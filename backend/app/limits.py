"""Bounded, process-local traffic protection for the educational API."""

import math
import time
from collections import deque
from collections.abc import Callable
from threading import Lock

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class TrafficLimiter:
    """Global rolling budgets; no client headers, tokens or IPs are retained.

    All callers share these budgets. Multiple processes need a shared limiter
    at the ingress; this class deliberately does not claim distributed safety.
    """

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self.clock = clock
        self.budgets = {"all": 300, "read": 120, "write": 60, "assistant": 10, "auth": 20}
        self.history: dict[str, deque[float]] = {key: deque() for key in self.budgets}
        self.lock = Lock()

    def reset(self) -> None:
        """Clear process-local state, primarily for isolated tests."""
        with self.lock:
            for history in self.history.values():
                history.clear()

    def admit(self, category: str) -> int:
        """Return 0 when accepted, otherwise seconds until capacity is free."""
        with self.lock:
            now = self.clock()
            keys = ("all", category)
            retry = 0
            for key in keys:
                history = self.history[key]
                while history and history[0] <= now - 60:
                    history.popleft()
                if len(history) >= self.budgets[key]:
                    retry = max(retry, math.ceil(history[0] + 60 - now))
            if retry:
                return max(1, retry)
            for key in keys:
                self.history[key].append(now)
            return 0


class ApiLimitsMiddleware:
    """Reject excess traffic and bodies above 8 KiB before JSON parsing."""

    def __init__(self, app: ASGIApp, limiter: TrafficLimiter, max_body_bytes: int = 8192) -> None:
        self.app = app
        self.limiter = limiter
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method, path = scope["method"], scope["path"].rstrip("/")
        # Preflights do not consume the operator's request budget.
        if method != "OPTIONS" and not (method == "GET" and path == "/health"):
            category = (
                "auth" if path == "/auth/check" else
                "assistant" if path == "/assistant" else
                "write" if method not in {"GET", "HEAD"} else "read"
            )
            retry = self.limiter.admit(category)
            if retry:
                await JSONResponse(
                    {"detail": "Limite de pedidos atingido. Aguarda antes de tentar novamente."},
                    status_code=429, headers={"Retry-After": str(retry)},
                )(scope, receive, send)
                return

        for name, value in scope.get("headers", []):
            if name.lower() == b"content-length":
                try:
                    size = int(value)
                except ValueError:
                    await JSONResponse({"detail": "Content-Length inválido."}, status_code=400)(scope, receive, send)
                    return
                if size < 0:
                    await JSONResponse({"detail": "Content-Length inválido."}, status_code=400)(scope, receive, send)
                    return
                if size > self.max_body_bytes:
                    await self.reject_body(scope, receive, send)
                    return

        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > self.max_body_bytes:
                await self.reject_body(scope, receive, send)
                return
            body.extend(chunk)
            if not message.get("more_body", False):
                break

        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)

    async def reject_body(self, scope: Scope, receive: Receive, send: Send) -> None:
        await JSONResponse(
            {"detail": "Pedido demasiado grande. O limite é 8192 bytes."}, status_code=413,
        )(scope, receive, send)
