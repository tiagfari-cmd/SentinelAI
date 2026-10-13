"""Durable, bounded web login outbox using only Python's standard library.

record_login does local I/O only. Run flush_one in a separate worker, never
on the login request's network path. Rows contain personal data, not secrets.
"""

from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
import ipaddress
from http.client import HTTPException
import json
import os
from pathlib import Path
import sqlite3
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from uuid import uuid4


class QueueError(RuntimeError):
    """A bounded/local storage failure; safe to log without event contents."""


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


@dataclass(frozen=True)
class Delivery:
    state: str
    status: int | None = None


def _matches_event(received: object, payload: str) -> bool:
    expected = json.loads(payload)
    if not isinstance(received, dict) or set(received) != set(expected):
        return False
    try:
        return (datetime.fromisoformat(received["timestamp"]) == datetime.fromisoformat(expected["timestamp"])
                and str(ipaddress.ip_address(received["ip_address"])) == expected["ip_address"]
                and received["username"] == expected["username"]
                and received["outcome"] == expected["outcome"])
    except (TypeError, ValueError):
        return False


def _destination(base_url: str, token: str) -> str:
    if not isinstance(base_url, str) or any(ord(char) <= 32 for char in base_url):
        raise ValueError("Invalid API URL")
    parsed = urlsplit(base_url)
    if (parsed.scheme not in {"http", "https"} or not parsed.hostname
            or parsed.username or parsed.password or parsed.query or parsed.fragment):
        raise ValueError("Use an HTTP(S) API base URL without credentials, query or fragment")
    try:
        local = ipaddress.ip_address(parsed.hostname).is_loopback
    except ValueError:
        local = parsed.hostname == "localhost"
    if not local and (parsed.scheme != "https" or not token):
        raise ValueError("Non-loopback delivery requires HTTPS and a server-side token")
    # Trigger validation of malformed/out-of-range ports before creating the queue.
    _ = parsed.port
    if not isinstance(token, str) or any(ord(char) < 33 or ord(char) > 126 for char in token):
        raise ValueError("Use an ASCII token without whitespace")
    return base_url.rstrip("/") + "/events"


class WebAuthCollector:
    """One queue belongs to one destination. Tokens are never written to SQLite."""

    def __init__(self, queue_path: str | Path, base_url: str, token: str = "",
                 *, max_events: int = 10000, timeout: float = 5):
        if not 1 <= max_events <= 100000 or not 0 < timeout <= 30:
            raise ValueError("Invalid capacity or timeout")
        self.endpoint = _destination(base_url, token)
        self._token = token
        self.max_events, self.timeout = max_events, timeout
        self.queue_path = Path(queue_path)
        # Do not use implicit OS/HTTP_PROXY settings for credentials or event data.
        self._opener = build_opener(ProxyHandler({}), NoRedirects())
        self.queue_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.queue_path.exists():
            try:
                fd = os.open(self.queue_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                os.close(fd)
            except FileExistsError:
                pass
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("CREATE TABLE IF NOT EXISTS destination (url TEXT PRIMARY KEY)")
            known = db.execute("SELECT url FROM destination").fetchone()
            if known is not None and known[0] != self.endpoint:
                raise ValueError("Queue belongs to another destination; use a different queue file")
            db.execute("INSERT OR IGNORE INTO destination VALUES (?)", (self.endpoint,))
            db.execute("""CREATE TABLE IF NOT EXISTS outbox (
                id TEXT PRIMARY KEY, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
                next_attempt REAL NOT NULL DEFAULT 0, lease_until REAL NOT NULL DEFAULT 0,
                blocked INTEGER NOT NULL DEFAULT 0, last_status INTEGER,
                created_order INTEGER NOT NULL)""")

    @contextmanager
    def _connect(self):
        db = sqlite3.connect(self.queue_path, timeout=0.2)
        try:
            db.execute("PRAGMA secure_delete=ON")
            with db:
                yield db
        finally:
            db.close()

    def record_login(self, *, ip_address: str, username: str, outcome: str,
                     timestamp: datetime | None = None) -> str:
        """Call after the application's authentication decision, not from HTTP status."""
        if not isinstance(username, str) or not 1 <= len(username.strip()) <= 255:
            raise ValueError("username must be nonblank and at most 255 characters")
        if outcome not in {"failed", "success"}:
            raise ValueError("outcome must be failed or success")
        normalized_ip = str(ipaddress.ip_address(ip_address))
        observed = timestamp if timestamp is not None else datetime.now(timezone.utc)
        if not isinstance(observed, datetime) or observed.tzinfo is None or observed.utcoffset() is None:
            raise ValueError("timestamp must be timezone-aware")
        payload = json.dumps({"timestamp": observed.astimezone(timezone.utc).isoformat(),
                              "ip_address": normalized_ip, "username": username.strip(),
                              "outcome": outcome}, separators=(",", ":"))
        key = uuid4().hex
        try:
            with self._connect() as db:
                db.execute("BEGIN IMMEDIATE")
                if db.execute("SELECT count(*) FROM outbox").fetchone()[0] >= self.max_events:
                    raise QueueError("SentinelAI outbox capacity reached")
                order = db.execute("SELECT coalesce(max(created_order), 0) + 1 FROM outbox").fetchone()[0]
                db.execute("INSERT INTO outbox(id,payload,created_order) VALUES (?,?,?)", (key, payload, order))
        except sqlite3.Error as exc:
            raise QueueError("SentinelAI outbox write failed") from exc
        return key

    def stats(self) -> dict[str, int]:
        with self._connect() as db:
            pending, blocked = db.execute("SELECT count(*), coalesce(sum(blocked),0) FROM outbox").fetchone()
        return {"pending": pending - blocked, "blocked": blocked}

    def retry_blocked(self) -> int:
        """Explicit operator action after fixing auth/validation; preserve event keys."""
        with self._connect() as db:
            count = db.execute("UPDATE outbox SET blocked=0, next_attempt=0 WHERE blocked=1").rowcount
        return count

    def flush_one(self, *, now: float | None = None) -> Delivery:
        """Try one eligible row. Leases allow a crashed worker to recover safely."""
        observed = time.time() if now is None else now
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("""SELECT id,payload,attempts FROM outbox WHERE blocked=0
                AND next_attempt<=? AND lease_until<=? ORDER BY created_order LIMIT 1""",
                (observed, observed)).fetchone()
            if row is None:
                return Delivery("idle")
            key, payload, attempts = row
            db.execute("UPDATE outbox SET lease_until=? WHERE id=?", (observed + 120, key))
        headers = {"Content-Type": "application/json", "Idempotency-Key": key,
                   "Accept": "application/json"}
        if self._token:
            headers["Authorization"] = "Bearer " + self._token
        request = Request(self.endpoint, data=payload.encode("utf-8"), headers=headers, method="POST")
        http_status, retry_after, acknowledged = None, None, False
        try:
            with self._opener.open(request, timeout=self.timeout) as response:
                http_status = response.status
                # A static SPA can return HTML/200. Only acknowledge a matching API event.
                raw = response.read(8193)
                if (http_status in {200, 201} and len(raw) <= 8192
                        and response.headers.get("Idempotency-Key") == key):
                    try:
                        acknowledged = _matches_event(json.loads(raw), payload)
                    except (ValueError, UnicodeDecodeError):
                        pass
        except HTTPError as exc:
            http_status, retry_after = exc.code, exc.headers.get("Retry-After")
            exc.close()
        except (URLError, OSError, TimeoutError, HTTPException):
            pass
        if acknowledged:
            with self._connect() as db:
                db.execute("DELETE FROM outbox WHERE id=?", (key,))
            return Delivery("delivered", http_status)
        transient = http_status is None or http_status in {408, 429} or 500 <= http_status <= 599
        delay = min(300, 2 ** min(attempts + 1, 9))
        if retry_after is not None and retry_after.isascii() and retry_after.isdigit():
            delay = max(delay, min(86400, int(retry_after[:10])))
        with self._connect() as db:
            db.execute("""UPDATE outbox SET attempts=attempts+1, next_attempt=?, lease_until=0,
                blocked=?, last_status=? WHERE id=?""", (observed + delay, int(not transient), http_status, key))
        return Delivery("retry" if transient else "blocked", http_status)


def main() -> int:
    parser = argparse.ArgumentParser(description="Send queued web login events; no browser code or passwords")
    parser.add_argument("command", choices=("run", "once", "stats", "retry-blocked"))
    parser.add_argument("--queue", required=True, help="Private local SQLite outbox path")
    parser.add_argument("--interval", type=float, default=2, help="Seconds between attempts (minimum 1)")
    args = parser.parse_args()
    if not 1 <= args.interval <= 300:
        parser.error("interval must be between 1 and 300 seconds")
    try:
        collector = WebAuthCollector(args.queue, os.environ.get("SENTINELAI_COLLECTOR_URL", "http://127.0.0.1:8001"),
                                     os.environ.get("SENTINELAI_INGEST_TOKEN", ""))
        if args.command == "stats":
            print(json.dumps(collector.stats()))
        elif args.command == "retry-blocked":
            print(json.dumps({"requeued": collector.retry_blocked()}))
        elif args.command == "once":
            result = collector.flush_one()
            print(json.dumps({"state": result.state, "status": result.status}))
        else:
            while True:
                result = collector.flush_one()
                if result.state != "idle":
                    print(json.dumps({"state": result.state, "status": result.status}), flush=True)
                time.sleep(args.interval)
    except KeyboardInterrupt:
        return 0
    except (ValueError, QueueError, sqlite3.Error):
        print("Collector configuration/storage error; no event or credential details shown")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
