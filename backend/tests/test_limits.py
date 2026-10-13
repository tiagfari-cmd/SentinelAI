"""Deterministic traffic limits and chunked body tests, without sleeps."""

import asyncio
import unittest
from concurrent.futures import ThreadPoolExecutor

from backend.app.limits import ApiLimitsMiddleware, TrafficLimiter


class TrafficTests(unittest.TestCase):
    def test_budget_expires_at_sixty_seconds(self) -> None:
        now = [10.0]
        limiter = TrafficLimiter(clock=lambda: now[0])
        for _ in range(10):
            self.assertEqual(limiter.admit("assistant"), 0)
        self.assertEqual(limiter.admit("assistant"), 60)
        now[0] = 69.5
        self.assertEqual(limiter.admit("assistant"), 1)
        now[0] = 70.0
        self.assertEqual(limiter.admit("assistant"), 0)

    def test_global_budget_is_shared_across_categories(self) -> None:
        limiter = TrafficLimiter(clock=lambda: 0.0)
        limiter.budgets["all"] = 2
        self.assertEqual(limiter.admit("read"), 0)
        self.assertEqual(limiter.admit("write"), 0)
        self.assertEqual(limiter.admit("assistant"), 60)
        self.assertEqual(len(limiter.history["all"]), 2)

    def test_concurrent_admission_does_not_overrun_budget(self) -> None:
        limiter = TrafficLimiter(clock=lambda: 0.0)
        with ThreadPoolExecutor(max_workers=8) as pool:
            decisions = list(pool.map(lambda _: limiter.admit("assistant"), range(100)))
        self.assertEqual(decisions.count(0), 10)
        self.assertEqual(len(limiter.history["assistant"]), 10)


class BodyTests(unittest.TestCase):
    def run_body(self, chunks: list[bytes], headers: list | None = None) -> tuple[list, list]:
        sent, received = [], []

        async def endpoint(scope, receive, send):
            received.append(await receive())
            await send({"type": "http.response.start", "status": 204, "headers": []})
            await send({"type": "http.response.body", "body": b""})

        messages = [{"type": "http.request", "body": chunk, "more_body": index < len(chunks) - 1}
                    for index, chunk in enumerate(chunks)]

        async def receive():
            return messages.pop(0) if messages else {"type": "http.disconnect"}

        async def send(message):
            sent.append(message)

        middleware = ApiLimitsMiddleware(endpoint, TrafficLimiter())
        asyncio.run(middleware({"type": "http", "method": "POST", "path": "/events",
                                "headers": headers or []}, receive, send))
        return sent, received

    def test_chunked_body_is_limited_without_content_length(self) -> None:
        sent, received = self.run_body([b"x" * 4096, b"x" * 4097])
        self.assertEqual(sent[0]["status"], 413)
        self.assertEqual(received, [])

    def test_forged_small_content_length_does_not_bypass_size(self) -> None:
        sent, received = self.run_body([b"x" * 8193], [(b"content-length", b"1")])
        self.assertEqual(sent[0]["status"], 413)
        self.assertEqual(received, [])

    def test_exact_limit_is_accepted_and_replayed_intact(self) -> None:
        sent, received = self.run_body([b"x" * 4096, b"y" * 4096])
        self.assertEqual(sent[0]["status"], 204)
        self.assertEqual(received[0]["body"], b"x" * 4096 + b"y" * 4096)

    def test_invalid_content_length_is_rejected(self) -> None:
        for size in (b"garbage", b"-1"):
            sent, received = self.run_body([b""], [(b"content-length", size)])
            self.assertEqual(sent[0]["status"], 400)
            self.assertEqual(received, [])
