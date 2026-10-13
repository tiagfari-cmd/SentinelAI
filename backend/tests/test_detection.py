"""Testes do motor de deteção, sem dependências externas."""

from datetime import datetime, timedelta, timezone
import unittest

from backend.app.detection import (
    AuthenticationEvent,
    detect_failed_login_bursts,
    validate_event,
    validate_events,
)


def failed_event(second: int, source_ip: str = "203.0.113.42") -> AuthenticationEvent:
    return AuthenticationEvent(
        timestamp=(
            datetime(2026, 10, 12, 9, 0, 0, tzinfo=timezone.utc)
            + timedelta(seconds=second)
        ),
        ip_address=source_ip,
        username="ana",
        outcome="failed",
    )


class ValidationTests(unittest.TestCase):
    def test_valid_event_is_normalized(self) -> None:
        event = validate_event(
            {
                "timestamp": "2026-10-12T10:00:00+01:00",
                "ip_address": "203.0.113.42",
                "username": "  ana  ",
                "outcome": "FAILED",
            }
        )

        self.assertEqual(event.timestamp, datetime(2026, 10, 12, 9, tzinfo=timezone.utc))
        self.assertEqual(event.username, "ana")
        self.assertEqual(event.outcome, "failed")

    def test_invalid_events_are_reported_without_stopping_valid_events(self) -> None:
        events, errors = validate_events(
            [
                {
                    "timestamp": "2026-10-12T09:00:00Z",
                    "ip_address": "203.0.113.42",
                    "username": "ana",
                    "outcome": "success",
                },
                {"timestamp": "not-a-date"},
            ]
        )

        self.assertEqual(len(events), 1)
        self.assertEqual(len(errors), 1)
        self.assertIn("evento 2", errors[0])

    def test_timestamp_without_timezone_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "fuso horário"):
            validate_event(
                {
                    "timestamp": "2026-10-12T09:00:00",
                    "ip_address": "203.0.113.42",
                    "username": "ana",
                    "outcome": "failed",
                }
            )


class DetectionTests(unittest.TestCase):
    def test_five_failures_inside_sixty_seconds_create_alert(self) -> None:
        alerts = detect_failed_login_bursts(
            [failed_event(second) for second in (0, 10, 20, 30, 60)]
        )

        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0].failure_count, 5)

    def test_events_out_of_order_are_detected(self) -> None:
        alerts = detect_failed_login_bursts(
            [failed_event(second) for second in (40, 0, 20, 10, 30)]
        )

        self.assertEqual(len(alerts), 1)

    def test_failures_outside_window_do_not_create_alert(self) -> None:
        events = [
            AuthenticationEvent(
                timestamp=datetime(2026, 10, 12, 9, minute, tzinfo=timezone.utc),
                ip_address="203.0.113.42",
                username="ana",
                outcome="failed",
            )
            for minute in range(5)
        ]

        self.assertEqual(detect_failed_login_bursts(events), [])

    def test_extra_failures_do_not_duplicate_same_sequence(self) -> None:
        alerts = detect_failed_login_bursts(
            [failed_event(second) for second in (0, 5, 10, 15, 20, 25, 30)]
        )

        self.assertEqual(len(alerts), 1)

    def test_failures_are_counted_separately_per_ip(self) -> None:
        events = [failed_event(second, "203.0.113.42") for second in (0, 5, 10)]
        events += [failed_event(second, "198.51.100.9") for second in (15, 20)]

        self.assertEqual(detect_failed_login_bursts(events), [])

    def test_successful_logins_are_not_counted(self) -> None:
        events = [failed_event(second) for second in (0, 10, 20, 30)]
        events.append(
            AuthenticationEvent(
                timestamp=datetime(2026, 10, 12, 9, 0, 40, tzinfo=timezone.utc),
                ip_address="203.0.113.42",
                username="ana",
                outcome="success",
            )
        )

        self.assertEqual(detect_failed_login_bursts(events), [])

    def test_a_later_distinct_sequence_can_create_another_alert(self) -> None:
        first = [failed_event(second) for second in (0, 5, 10, 15, 20)]
        second = [
            AuthenticationEvent(
                timestamp=datetime(2026, 10, 12, 9, 2, second, tzinfo=timezone.utc),
                ip_address="203.0.113.42",
                username="rui",
                outcome="failed",
            )
            for second in (0, 5, 10, 15, 20)
        ]

        self.assertEqual(len(detect_failed_login_bursts(first + second)), 2)


if __name__ == "__main__":
    unittest.main()

