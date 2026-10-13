"""Human triage preserves evidence and protects concurrent edits."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import tempfile
from threading import Barrier
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from backend.tests import test_api
from backend.app.database import Base
from backend.app.models import AlertReviewModel, SecurityAlertModel
from backend.app.repositories import AlertReviewConflict, review_alert
from alembic import command
from alembic.config import Config
from sqlalchemy import text


class AlertReviewTests(unittest.TestCase):
    def setUp(self):
        self.api = test_api.ApiTests()
        self.api.setUp()
        self.request = self.api.request
        for second in range(5):
            self.request("POST", "/events", json={"timestamp": f"2026-10-13T09:00:0{second}Z",
                "ip_address": "203.0.113.42", "username": "fictional-web-user", "outcome": "failed"})
        self.original = self.request("GET", "/alerts").json()[0]
        self.path = f"/alerts/{self.original['id']}"

    def tearDown(self):
        self.api.tearDown()

    def update(self, status="investigating", note="Verificar com o responsável.", revision=0):
        return self.request("POST", self.path + "/review", json={"review_status": status,
                            "review_note": note, "expected_revision": revision})

    def test_new_alert_is_open_and_review_does_not_change_evidence(self):
        self.assertEqual(self.original["review_status"], "open")
        self.assertEqual(self.original["review_revision"], 0)
        self.assertEqual(self.request("GET", self.path + "/reviews").json(), [])
        changed = self.update().json()
        self.assertEqual(changed["review_status"], "investigating")
        self.assertEqual(changed["review_revision"], 1)
        self.assertTrue(changed["reviewed_at"].endswith("Z"))
        for key in ("ip_address", "first_failure", "last_failure", "detected_at", "failure_count", "usernames", "message"):
            self.assertEqual(self.original[key], changed[key])
        self.assertEqual(self.request("GET", "/alerts").json()[0], changed)

    def test_resolve_and_reopen_preserve_history_with_bounded_pagination(self):
        self.assertEqual(self.update().status_code, 200)
        self.assertEqual(self.update("resolved", "  Acesso de teste autorizado.  ", 1).status_code, 200)
        self.assertEqual(self.update("open", "Novos elementos a rever.", 2).status_code, 200)
        history = self.request("GET", self.path + "/reviews?limit=1&offset=1")
        self.assertEqual(history.headers["x-total-count"], "3")
        self.assertEqual(history.json()[0]["revision"], 2)
        self.assertEqual(history.json()[0]["review_note"], "Acesso de teste autorizado.")
        self.assertEqual(self.request("GET", self.path + "/reviews?offset=3").json(), [])
        self.assertEqual(self.request("GET", self.path + "/reviews?limit=501").status_code, 422)

    def test_stale_revision_is_conflict_not_a_silent_overwrite(self):
        self.update(note="Primeira análise.")
        self.assertEqual(self.update("resolved", "Outra pessoa alterou sem refrescar.", 0).status_code, 409)
        current = self.request("GET", "/alerts").json()[0]
        self.assertEqual(current["review_note"], "Primeira análise.")
        self.assertEqual(len(self.request("GET", self.path + "/reviews").json()), 1)

    def test_invalid_reviews_do_not_write_state_or_history(self):
        base = {"review_status": "resolved", "review_note": "Conclusão", "expected_revision": 0}
        for change in ({"review_note": " "}, {"review_note": "x" * 1001}, {"review_status": "blocked"},
                       {"expected_revision": -1}, {"actor": "forged-owner"}):
            with self.subTest(change=list(change)):
                response = self.request("POST", self.path + "/review", json=base | change)
                self.assertEqual(response.status_code, 422)
        self.assertEqual(self.request("GET", "/alerts").json()[0]["review_revision"], 0)
        self.assertEqual(self.request("GET", self.path + "/reviews").json(), [])

    def test_missing_alert_and_invalid_ids_are_not_created(self):
        for suffix in ("/review", "/reviews"):
            response = self.request("POST", "/alerts/999" + suffix,
                json={"review_status": "open", "review_note": "", "expected_revision": 0}) if suffix == "/review" else self.request("GET", "/alerts/999" + suffix)
            self.assertEqual(response.status_code, 404)
        self.assertEqual(self.request("GET", "/alerts/0/reviews").status_code, 422)

    def test_only_operator_token_can_review_or_read_history_in_production(self):
        body = {"review_status": "investigating", "review_note": "Nota", "expected_revision": 0}
        with patch.dict("os.environ", {"APP_ENV": "production", "SENTINELAI_API_TOKEN": "operator-token",
                                      "SENTINELAI_INGEST_TOKEN": "write-only-token"}):
            for headers in ({}, {"Authorization": "Bearer write-only-token"}):
                self.assertEqual(self.request("POST", self.path + "/review", json=body, headers=headers).status_code, 401)
                self.assertEqual(self.request("GET", self.path + "/reviews", headers=headers).status_code, 401)
            self.assertEqual(self.request("POST", self.path + "/review", json=body,
                                          headers={"Authorization": "Bearer operator-token"}).status_code, 200)
        with patch.dict("os.environ", {"APP_ENV": "production", "SENTINELAI_API_TOKEN": ""}):
            self.assertEqual(self.request("GET", self.path + "/reviews").status_code, 503)

    def test_further_ingestion_does_not_erase_human_resolution(self):
        self.update("resolved", "Testes autorizados.")
        self.request("POST", "/events", json={"timestamp": "2026-10-13T09:00:05Z",
            "ip_address": "203.0.113.42", "username": "fictional-web-user", "outcome": "failed"})
        current = self.request("GET", "/alerts").json()[0]
        self.assertEqual(current["review_status"], "resolved")
        self.assertEqual(current["review_note"], "Testes autorizados.")


class ConcurrentReviewTests(unittest.TestCase):
    def test_upgrade_preserves_old_evidence_and_initializes_open_state(self):
        with tempfile.TemporaryDirectory() as folder:
            url = "sqlite:///" + (Path(folder) / "old-alerts.db").as_posix()
            engine = create_engine(url)
            try:
                with patch.dict("os.environ", {"DATABASE_URL": url}):
                    config = Config("alembic.ini")
                    command.upgrade(config, "20261013_02")
                    with engine.begin() as db:
                        db.execute(text("""INSERT INTO security_alerts(fingerprint,ip_address,first_failure,last_failure,
                            detected_at,failure_count,usernames,message) VALUES
                            ('old-fingerprint','203.0.113.42','2026-10-13 09:00:00','2026-10-13 09:00:30',
                            '2026-10-13 09:00:31',5,'["old-user"]','Original evidence')"""))
                    command.upgrade(config, "head")
                with engine.connect() as db:
                    row = db.execute(text("SELECT message,review_status,review_note,review_revision,reviewed_at FROM security_alerts")).one()
                    self.assertEqual(tuple(row), ("Original evidence", "open", "", 0, None))
                    self.assertEqual(db.execute(text("SELECT count(*) FROM alert_reviews")).scalar(), 0)
            finally:
                engine.dispose()

    def test_only_one_concurrent_review_with_the_same_revision_wins(self):
        with tempfile.TemporaryDirectory() as folder:
            engine = create_engine("sqlite:///" + (Path(folder) / "reviews.db").as_posix(), connect_args={"timeout": 5})
            Base.metadata.create_all(engine)
            now = datetime.now(timezone.utc)
            with Session(engine) as session:
                row = SecurityAlertModel(fingerprint="a" * 64, ip_address="203.0.113.42", first_failure=now,
                    last_failure=now, detected_at=now, failure_count=5, usernames=["fictional"], message="Evidence")
                session.add(row)
                session.commit()
                alert_id = row.id
            barrier = Barrier(2)
            def save(index):
                with Session(engine) as session:
                    barrier.wait(timeout=5)
                    try:
                        review_alert(session, alert_id, review_status="investigating", review_note=f"Note {index}", expected_revision=0)
                        return True
                    except AlertReviewConflict:
                        return False
            try:
                with ThreadPoolExecutor(max_workers=2) as executor:
                    self.assertEqual(sorted(executor.map(save, range(2))), [False, True])
                with Session(engine) as session:
                    self.assertEqual(session.get(SecurityAlertModel, alert_id).review_revision, 1)
                    self.assertEqual(session.scalar(select(func.count()).select_from(AlertReviewModel)), 1)
            finally:
                engine.dispose()
