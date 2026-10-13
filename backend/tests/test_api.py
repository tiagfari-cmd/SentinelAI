"""Testes dos endpoints HTTP, sem iniciar um servidor de rede."""

import asyncio
import unittest
from datetime import datetime
from unittest.mock import patch

import httpx
from sqlalchemy.pool import StaticPool

from backend.app.api import app
from backend.app.database import Base, get_db
from backend.app.models import AuthenticationEventModel, SecurityAlertModel
from sqlalchemy import create_engine


class ApiTests(unittest.TestCase):
    def setUp(self) -> None:
        app.state.traffic_limiter.reset()
        # Uma base SQLite em memória, partilhada pelos pedidos deste teste.
        self.test_engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.test_engine)

        def override_get_db():
            from sqlalchemy.orm import Session

            with Session(self.test_engine) as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(self.test_engine)
        self.test_engine.dispose()

    def request(self, method: str, path: str, **kwargs: object) -> httpx.Response:
        async def send_request() -> httpx.Response:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport,
                base_url="http://testserver",
            ) as client:
                return await client.request(method, path, **kwargs)

        return asyncio.run(send_request())

    def test_health_endpoint(self) -> None:
        response = self.request("GET", "/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_lists_support_bounded_pagination_and_total_counts(self) -> None:
        from sqlalchemy.orm import Session

        with Session(self.test_engine) as session:
            for index in range(105):
                session.add(AuthenticationEventModel(
                    timestamp=datetime(2026, 10, 12),
                    ip_address="203.0.113.42", username=f"user-{index}", outcome="success",
                ))
            session.commit()
        first = self.request("GET", "/events")
        page = self.request("GET", "/events?limit=2&offset=1&order=desc")
        self.assertEqual(len(first.json()), 100)
        self.assertEqual(first.headers["x-total-count"], "105")
        self.assertEqual([row["username"] for row in page.json()], ["user-103", "user-102"])
        self.assertEqual(self.request("GET", "/events?offset=105").json(), [])
        self.assertEqual(self.request("GET", "/alerts").headers["x-total-count"], "0")

    def test_pagination_rejects_out_of_bounds_and_bad_order(self) -> None:
        for path in ("/events", "/alerts"):
            for query in ("limit=0", "limit=501", "offset=-1", "offset=100001", "order=random"):
                with self.subTest(path=path, query=query):
                    self.assertEqual(self.request("GET", f"{path}?{query}").status_code, 422)

    def test_username_length_matches_database_bound(self) -> None:
        event = {"timestamp": "2026-10-12T09:00:00Z", "ip_address": "203.0.113.42",
                 "username": "a" * 256, "outcome": "failed"}
        self.assertEqual(self.request("POST", "/events", json=event).status_code, 422)
        self.assertEqual(self.request("GET", "/events").json(), [])

    def test_api_rate_limit_preserves_cors_and_health(self) -> None:
        with patch.dict(app.state.traffic_limiter.budgets, {"read": 1}):
            self.assertEqual(self.request("GET", "/events").status_code, 200)
            limited = self.request("GET", "/events", headers={"Origin": "http://localhost:5173"})
            health = self.request("GET", "/health")
        self.assertEqual(limited.status_code, 429)
        self.assertGreater(int(limited.headers["retry-after"]), 0)
        self.assertEqual(limited.headers["access-control-allow-origin"], "http://localhost:5173")
        self.assertEqual(health.status_code, 200)

    def test_spoofed_forwarded_headers_do_not_bypass_auth_budget(self) -> None:
        with patch.dict(app.state.traffic_limiter.budgets, {"auth": 1}):
            self.request("GET", "/auth/check", headers={"X-Forwarded-For": "203.0.113.1"})
            response = self.request("GET", "/auth/check", headers={"X-Forwarded-For": "203.0.113.2"})
        self.assertEqual(response.status_code, 429)

    def test_excess_assistant_requests_do_not_call_provider(self) -> None:
        from unittest.mock import AsyncMock
        provider = AsyncMock(return_value=("Resposta", "mock"))
        with patch.dict(app.state.traffic_limiter.budgets, {"assistant": 1}), patch(
            "backend.app.api.answer_question", provider,
        ):
            first = self.request("POST", "/assistant", json={"message": "Olá"})
            second = self.request("POST", "/assistant", json={"message": "Olá"})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)
        provider.assert_awaited_once()

    def test_oversized_body_is_rejected_before_endpoint(self) -> None:
        response = self.request("POST", "/events", content=b"x" * 8193)
        self.assertEqual(response.status_code, 413)
        self.assertEqual(self.request("GET", "/events").json(), [])

    def test_non_ascii_wrong_token_is_unauthorized_not_server_error(self) -> None:
        with patch.dict("os.environ", {"SENTINELAI_API_TOKEN": "test-token"}):
            response = self.request("GET", "/events", headers=[(b"Authorization", b"Bearer \xff")])
        self.assertEqual(response.status_code, 401)

    def test_all_protected_routes_reject_missing_token(self) -> None:
        with patch.dict("os.environ", {"SENTINELAI_API_TOKEN": "test-token"}):
            for method, path in (("GET", "/events"), ("POST", "/events"), ("GET", "/alerts"),
                                 ("POST", "/assistant"), ("GET", "/auth/check")):
                with self.subTest(method=method, path=path):
                    response = self.request(method, path, json={}) if method == "POST" else self.request(method, path)
                    self.assertEqual(response.status_code, 401)

    def test_protected_endpoints_require_configured_token(self) -> None:
        with patch.dict("os.environ", {"APP_ENV": "development", "SENTINELAI_API_TOKEN": "sentinel-test-token"}):
            unauthorized = self.request("GET", "/events")
            authorized = self.request(
                "GET",
                "/events",
                headers={"Authorization": "Bearer sentinel-test-token"},
            )
            auth_check = self.request(
                "GET",
                "/auth/check",
                headers={"Authorization": "Bearer sentinel-test-token"},
            )

        self.assertEqual(unauthorized.status_code, 401)
        self.assertEqual(authorized.status_code, 200)
        self.assertEqual(auth_check.json(), {"status": "authorized"})

    def test_production_fails_closed_when_token_is_missing(self) -> None:
        with patch.dict("os.environ", {"APP_ENV": "production"}, clear=True):
            response = self.request("GET", "/events")

        self.assertEqual(response.status_code, 503)

    def test_local_frontend_origin_can_call_api(self) -> None:
        response = self.request(
            "GET",
            "/health",
            headers={"Origin": "http://localhost:5173"},
        )

        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:5173")

    def test_assistant_defaults_to_mock_without_sending_event_details(self) -> None:
        with patch.dict("os.environ", {"ASSISTANT_PROVIDER": "mock"}, clear=False):
            response = self.request("POST", "/assistant", json={"message": "Como investigo alertas?"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["provider"], "mock")
        self.assertIn("alertas guardados", response.json()["answer"])

    def test_assistant_rejects_blank_question(self) -> None:
        response = self.request("POST", "/assistant", json={"message": "   "})

        self.assertEqual(response.status_code, 422)

    def test_events_start_empty(self) -> None:
        response = self.request("GET", "/events")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_post_event_returns_201_and_get_returns_event(self) -> None:
        event = {
            "timestamp": "2026-10-12T09:00:00Z",
            "ip_address": "203.0.113.42",
            "username": "ana",
            "outcome": "failed",
        }

        created = self.request("POST", "/events", json=event)
        listed = self.request("GET", "/events")

        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["username"], "ana")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)

    def test_invalid_event_returns_422(self) -> None:
        response = self.request(
            "POST",
            "/events",
            json={
                "timestamp": "2026-10-12T09:00:00",
                "ip_address": "not-an-ip",
                "username": "ana",
                "outcome": "failed",
            },
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.request("GET", "/events").json(), [])

    def test_ingestion_retry_is_idempotent_and_conflicts_are_rejected(self) -> None:
        event = {"timestamp": "2026-10-12T09:00:00Z", "ip_address": "203.0.113.42",
                 "username": "ana", "outcome": "failed"}
        headers = {"Idempotency-Key": "0123456789abcdef0123456789abcdef"}
        first = self.request("POST", "/events", json=event, headers=headers)
        retry = self.request("POST", "/events", json={**event, "timestamp": "2026-10-12T10:00:00+01:00"}, headers=headers)
        conflict = self.request("POST", "/events", json={**event, "outcome": "success"}, headers=headers)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(first.json(), retry.json())
        self.assertEqual(retry.headers["idempotency-key"], headers["Idempotency-Key"])
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(len(self.request("GET", "/events").json()), 1)

    def test_distinct_login_keys_preserve_distinct_attempts(self) -> None:
        event = {"timestamp": "2026-10-12T09:00:00Z", "ip_address": "203.0.113.42",
                 "username": "ana", "outcome": "failed"}
        for index in range(5):
            headers = {"Idempotency-Key": f"web-login-event-{index:02d}"}
            self.assertEqual(self.request("POST", "/events", json=event, headers=headers).status_code, 201)
            self.assertEqual(self.request("POST", "/events", json=event, headers=headers).status_code, 200)
        self.assertEqual(len(self.request("GET", "/events").json()), 5)
        self.assertEqual(len(self.request("GET", "/alerts").json()), 1)

    def test_invalid_ingestion_keys_are_rejected_before_storage(self) -> None:
        event = {"timestamp": "2026-10-12T09:00:00Z", "ip_address": "203.0.113.42",
                 "username": "ana", "outcome": "success"}
        for key in ("short", "a" * 129, "invalid-key-with spaces"):
            self.assertEqual(self.request("POST", "/events", json=event,
                                          headers={"Idempotency-Key": key}).status_code, 422)
        self.assertEqual(self.request("GET", "/events").json(), [])

    def test_web_collector_to_api_survives_lost_ack_and_creates_one_alert(self) -> None:
        from datetime import timezone
        from io import BytesIO
        from pathlib import Path
        import tempfile
        from urllib.error import URLError
        from collectors.web_auth import WebAuthCollector

        class Reply(BytesIO):
            def __init__(self, response):
                super().__init__(response.content)
                self.status = response.status_code
                self.headers = response.headers

        deliveries = []
        def deliver(req, **kwargs):
            response = self.request("POST", "/events", content=req.data,
                                    headers={"Idempotency-Key": req.get_header("Idempotency-key"),
                                             "Content-Type": "application/json"})
            deliveries.append(response.status_code)
            if len(deliveries) == 1:
                raise URLError("API committed but acknowledgement was lost")
            return Reply(response)

        with tempfile.TemporaryDirectory() as folder:
            collector = WebAuthCollector(Path(folder) / "outbox.db", "http://127.0.0.1:8001")
            with patch.object(collector._opener, "open", side_effect=deliver):
                for second in range(5):
                    collector.record_login(timestamp=datetime(2026, 10, 13, 9, 0, second, tzinfo=timezone.utc),
                                           ip_address="203.0.113.42", username="web-pilot", outcome="failed")
                self.assertEqual(collector.flush_one(now=100).state, "retry")
                for tick in range(5):
                    self.assertEqual(collector.flush_one(now=103 + tick).state, "delivered")
            self.assertEqual(collector.stats(), {"pending": 0, "blocked": 0})
        self.assertEqual(deliveries, [201, 200, 201, 201, 201, 201])
        self.assertEqual(len(self.request("GET", "/events").json()), 5)
        self.assertEqual(len(self.request("GET", "/alerts").json()), 1)

    def test_collector_token_is_write_only_and_operator_token_remains_valid(self) -> None:
        event = {"timestamp": "2026-10-13T09:00:00Z", "ip_address": "203.0.113.42",
                 "username": "collector-pilot", "outcome": "success"}
        with patch.dict("os.environ", {"APP_ENV": "production", "SENTINELAI_API_TOKEN": "operator-only",
                                      "SENTINELAI_INGEST_TOKEN": "collector-only"}):
            headers = {"Authorization": "Bearer collector-only"}
            self.assertEqual(self.request("POST", "/events", json=event, headers=headers).status_code, 201)
            for path in ("/events", "/alerts", "/auth/check"):
                self.assertEqual(self.request("GET", path, headers=headers).status_code, 401)
            self.assertEqual(self.request("POST", "/assistant", json={"message": "hi"}, headers=headers).status_code, 401)
            self.assertEqual(self.request("POST", "/events", json=event).status_code, 401)
            self.assertEqual(self.request("POST", "/events", json=event,
                                          headers={"Authorization": "Bearer operator-only"}).status_code, 201)

    def test_unexpected_fields_are_rejected(self) -> None:
        response = self.request(
            "POST",
            "/events",
            json={
                "timestamp": "2026-10-12T09:00:00Z",
                "ip_address": "203.0.113.42",
                "username": "ana",
                "outcome": "failed",
                "unexpected": "value",
            },
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.request("GET", "/events").json(), [])

    def test_alert_endpoint_uses_posted_events_and_deduplicates_sequence(self) -> None:
        event = {
            "timestamp": "2026-10-12T09:00:00Z",
            "ip_address": "203.0.113.42",
            "username": "ana",
            "outcome": "failed",
        }
        for second in (0, 5, 10, 15, 20, 25):
            event["timestamp"] = f"2026-10-12T09:00:{second:02d}Z"
            self.request("POST", "/events", json=event)

        response = self.request("GET", "/alerts")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["failure_count"], 5)
        self.assertIn("detected_at", response.json()[0])
        detected_at = response.json()[0]["detected_at"]
        self.assertTrue(detected_at.endswith("Z") or detected_at.endswith("+00:00"))
        self.assertIn("não confirma um ataque", response.json()[0]["message"])

    def test_event_and_alert_are_stored_as_database_rows(self) -> None:
        event = {
            "timestamp": "2026-10-12T09:00:00Z",
            "ip_address": "203.0.113.42",
            "username": "ana",
            "outcome": "failed",
        }
        for second in (0, 5, 10, 15, 20):
            event["timestamp"] = f"2026-10-12T09:00:{second:02d}Z"
            self.request("POST", "/events", json=event)

        from sqlalchemy.orm import Session

        with Session(self.test_engine) as session:
            self.assertEqual(session.query(AuthenticationEventModel).count(), 5)
            self.assertEqual(session.query(SecurityAlertModel).count(), 1)


if __name__ == "__main__":
    unittest.main()
