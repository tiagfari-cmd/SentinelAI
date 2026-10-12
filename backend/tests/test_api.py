"""Testes dos endpoints HTTP, sem iniciar um servidor de rede."""

import asyncio
import unittest

import httpx
from sqlalchemy.pool import StaticPool

from backend.app.api import app
from backend.app.database import Base, get_db
from backend.app.models import AuthenticationEventModel, SecurityAlertModel
from sqlalchemy import create_engine


class ApiTests(unittest.TestCase):
    def setUp(self) -> None:
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

    def test_local_frontend_origin_can_call_api(self) -> None:
        response = self.request(
            "GET",
            "/health",
            headers={"Origin": "http://localhost:5173"},
        )

        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:5173")

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
