"""No operational data or external network calls: temporary private queues only."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from io import BytesIO
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.request import Request

from collectors.web_auth import NoRedirects, QueueError, WebAuthCollector
from examples.web_login_hook import observe_web_login


class Reply(BytesIO):
    def __init__(self, data: bytes, status: int = 201, headers=None):
        super().__init__(data)
        self.status = status
        self.headers = headers or {}


class WebCollectorTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.path = Path(self.folder.name) / "outbox.db"
        self.client = WebAuthCollector(self.path, "http://127.0.0.1:8001", "private-test-token")

    def tearDown(self):
        self.folder.cleanup()

    def record(self, client=None):
        return (client or self.client).record_login(ip_address="203.0.113.42", username="ana",
                                                   outcome="failed", timestamp=datetime(2026, 10, 13, tzinfo=timezone.utc))

    def echo(self, req, **kwargs):
        payload = json.loads(req.data)
        payload["timestamp"] = payload["timestamp"].replace("+00:00", "Z")
        return Reply(json.dumps(payload).encode(), headers={"Idempotency-Key": req.get_header("Idempotency-key")})

    def test_record_is_local_and_restart_delivers_minimal_payload(self):
        with patch.object(self.client._opener, "open", side_effect=AssertionError("No network in record")):
            key = self.record()
        restarted = WebAuthCollector(self.path, "http://127.0.0.1:8001", "private-test-token")
        with patch.object(restarted._opener, "open", side_effect=self.echo) as send:
            result = restarted.flush_one(now=100)
        self.assertEqual(result.state, "delivered")
        request = send.call_args.args[0]
        self.assertEqual(request.get_header("Idempotency-key"), key)
        self.assertEqual(request.get_header("Authorization"), "Bearer private-test-token")
        self.assertEqual(set(json.loads(request.data)), {"timestamp", "username", "ip_address", "outcome"})
        self.assertEqual(restarted.stats(), {"pending": 0, "blocked": 0})
        self.assertNotIn(b"private-test-token", self.path.read_bytes())

    def test_transport_failure_keeps_key_and_backoff(self):
        key = self.record()
        with patch.object(self.client._opener, "open", side_effect=URLError("offline")) as send:
            self.assertEqual(self.client.flush_one(now=100).state, "retry")
            self.assertEqual(self.client.flush_one(now=101).state, "idle")
            send.assert_called_once()
        with patch.object(self.client._opener, "open", side_effect=self.echo) as send:
            self.assertEqual(self.client.flush_one(now=103).state, "delivered")
            self.assertEqual(send.call_args.args[0].get_header("Idempotency-key"), key)

    def test_rate_limit_retry_after_is_respected(self):
        self.record()
        error = HTTPError("http://local/events", 429, "Limited", {"Retry-After": "60"}, BytesIO())
        with patch.object(self.client._opener, "open", side_effect=error):
            self.assertEqual(self.client.flush_one(now=100).state, "retry")
        with patch.object(self.client._opener, "open", side_effect=self.echo) as send:
            self.assertEqual(self.client.flush_one(now=159).state, "idle")
            self.assertEqual(self.client.flush_one(now=160).state, "delivered")
            send.assert_called_once()

    def test_server_error_is_retried(self):
        self.record()
        error = HTTPError("http://local/events", 503, "Down", {}, BytesIO())
        with patch.object(self.client._opener, "open", side_effect=error):
            self.assertEqual(self.client.flush_one(now=100).state, "retry")
        self.assertEqual(self.client.stats()["pending"], 1)

    def test_invalid_auth_validation_or_conflict_blocks_without_deleting(self):
        for status in (401, 403, 409, 413, 422):
            with self.subTest(status=status):
                self.record()
                error = HTTPError("http://local/events", status, "Error", {}, BytesIO())
                with patch.object(self.client._opener, "open", side_effect=error):
                    self.assertEqual(self.client.flush_one(now=100).state, "blocked")
        self.assertEqual(self.client.stats(), {"pending": 0, "blocked": 5})
        self.assertEqual(self.client.retry_blocked(), 5)
        self.assertEqual(self.client.stats(), {"pending": 5, "blocked": 0})

    def test_html_200_is_not_acknowledged_as_an_api_event(self):
        self.record()
        with patch.object(self.client._opener, "open", return_value=Reply(b"<html>demo</html>", 200)):
            self.assertEqual(self.client.flush_one(now=100).state, "blocked")
        self.assertEqual(self.client.stats()["blocked"], 1)

    def test_mismatched_or_oversized_success_is_not_acknowledged(self):
        for body in (b"{}", b"x" * 8193):
            self.record()
            with patch.object(self.client._opener, "open", return_value=Reply(body)):
                self.assertEqual(self.client.flush_one(now=100).state, "blocked")

    def test_redirects_are_disabled(self):
        request = Request("https://api.example/events", data=b"{}", headers={"Authorization": "secret"})
        self.assertIsNone(NoRedirects().redirect_request(request, None, 307, "redirect", {}, "https://other.example"))
        self.record()
        error = HTTPError(request.full_url, 307, "Redirect", {"Location": "https://other.example"}, BytesIO())
        with patch.object(self.client._opener, "open", side_effect=error) as send:
            self.assertEqual(self.client.flush_one(now=100).state, "blocked")
            send.assert_called_once()

    def test_private_http_and_remote_without_token_are_rejected(self):
        for url, token in (("http://192.168.1.2", "token"), ("https://api.example", ""),
                           ("file:///etc/passwd", "token"), ("https://user:password@api.example", "token"),
                           ("https://api.example?key=secret", "token"), ("https://api.example#fragment", "token"),
                           ("https://api.example", "bad\nheader")):
            with self.subTest(url=url):
                with self.assertRaises(ValueError):
                    WebAuthCollector(self.path, url, token)

    def test_queue_is_bound_to_its_destination(self):
        self.record()
        with self.assertRaises(ValueError):
            WebAuthCollector(self.path, "https://different.example", "token")

    def test_invalid_events_do_not_enter_outbox(self):
        for change in ({"username": " "}, {"username": "a" * 256}, {"ip_address": "not-ip"},
                       {"outcome": "unknown"}, {"timestamp": datetime(2026, 10, 13)}):
            with self.assertRaises(ValueError):
                self.client.record_login(**({"ip_address": "203.0.113.42", "username": "ana", "outcome": "failed"} | change))
        self.assertEqual(self.client.stats()["pending"], 0)

    def test_capacity_is_bounded_under_concurrent_writers(self):
        client = WebAuthCollector(self.path, "http://127.0.0.1:8001", max_events=1)
        def enqueue(_):
            try:
                self.record(client)
                return True
            except QueueError:
                return False
        with ThreadPoolExecutor(max_workers=4) as executor:
            self.assertEqual(sum(executor.map(enqueue, range(4))), 1)
        self.assertEqual(client.stats()["pending"], 1)

    def test_crashed_worker_lease_recovers_without_losing_event(self):
        key = self.record()
        with self.client._connect() as db:
            db.execute("UPDATE outbox SET lease_until=220 WHERE id=?", (key,))
        with patch.object(self.client._opener, "open", side_effect=self.echo):
            self.assertEqual(self.client.flush_one(now=219).state, "idle")
            self.assertEqual(self.client.flush_one(now=220).state, "delivered")

    def test_hook_records_server_decision_without_network(self):
        with patch.object(self.client._opener, "open", side_effect=AssertionError("No login-path network")):
            for result in (True, False):
                self.assertTrue(observe_web_login(self.client, username="ana", client_ip="203.0.113.42",
                                                 authenticated=result))
        with self.client._connect() as db:
            outcomes = [json.loads(row[0])["outcome"] for row in db.execute("SELECT payload FROM outbox ORDER BY created_order")]
        self.assertEqual(outcomes, ["success", "failed"])

    def test_hook_failure_logs_no_event_or_secret_details(self):
        with patch("examples.web_login_hook.logger.warning") as warning:
            self.assertFalse(observe_web_login(self.client, username="private-username" * 100,
                                               client_ip="203.0.113.42", authenticated=False))
        warning.assert_called_once()
        self.assertNotIn("private-username", str(warning.call_args))
        self.assertNotIn("203.0.113.42", str(warning.call_args))
        with self.assertRaises(TypeError):
            observe_web_login(self.client, username="ana", client_ip="203.0.113.42", authenticated="false")

    def test_old_api_without_idempotency_ack_does_not_silently_drop_event(self):
        self.record()
        with self.client._connect() as db:
            payload = db.execute("SELECT payload FROM outbox").fetchone()[0]
        with patch.object(self.client._opener, "open", return_value=Reply(payload.encode())):
            self.assertEqual(self.client.flush_one(now=100).state, "blocked")
        self.assertEqual(self.client.stats()["blocked"], 1)
