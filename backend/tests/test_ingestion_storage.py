"""Migration preservation and concurrent ingestion in isolated temporary databases."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import tempfile
from threading import Barrier
import unittest
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.database import Base
from backend.app.detection import AuthenticationEvent
from backend.app import repositories


class IngestionStorageTests(unittest.TestCase):
    def test_migration_preserves_existing_events_and_enforces_unique_key(self):
        with tempfile.TemporaryDirectory() as folder:
            url = "sqlite:///" + (Path(folder) / "migration.db").as_posix()
            config = Config("alembic.ini")
            engine = create_engine(url)
            try:
                with patch.dict("os.environ", {"DATABASE_URL": url}):
                    command.upgrade(config, "20261012_01")
                    with engine.begin() as db:
                        db.execute(text("""INSERT INTO authentication_events(timestamp,ip_address,username,outcome)
                            VALUES ('2026-10-13 09:00:00','203.0.113.42','old-event','failed')"""))
                    command.upgrade(config, "head")
                with engine.connect() as db:
                    self.assertEqual(db.execute(text("SELECT username,ingestion_key FROM authentication_events")).one(),
                                     ("old-event", None))
                with engine.begin() as db:
                    db.execute(text("UPDATE authentication_events SET ingestion_key='same-key'"))
                with self.assertRaises(IntegrityError), engine.begin() as db:
                    db.execute(text("""INSERT INTO authentication_events(timestamp,ip_address,username,outcome,ingestion_key)
                        VALUES ('2026-10-13 09:00:00','203.0.113.42','duplicate','failed','same-key')"""))
            finally:
                engine.dispose()

    def test_concurrent_retries_commit_only_one_event(self):
        with tempfile.TemporaryDirectory() as folder:
            engine = create_engine("sqlite:///" + (Path(folder) / "race.db").as_posix(),
                                   connect_args={"timeout": 5})
            Base.metadata.create_all(engine)
            barrier = Barrier(2)
            original_insert = repositories._insert_event_and_new_alerts
            event = AuthenticationEvent(datetime(2026, 10, 13, tzinfo=timezone.utc), "203.0.113.42", "race", "failed")
            def synchronized_insert(*args):
                barrier.wait(timeout=5)
                return original_insert(*args)
            def save(_):
                with Session(engine) as session:
                    _, replayed = repositories.save_event_and_new_alerts(session, event, "concurrent-key-01")
                    return replayed
            try:
                with patch.object(repositories, "_insert_event_and_new_alerts", side_effect=synchronized_insert):
                    with ThreadPoolExecutor(max_workers=2) as executor:
                        self.assertEqual(sorted(executor.map(save, range(2))), [False, True])
                with Session(engine) as session:
                    self.assertEqual(repositories.count_events(session), 1)
            finally:
                engine.dispose()
