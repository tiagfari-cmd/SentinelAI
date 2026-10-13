"""Validação de eventos e deteção de falhas de autenticação suspeitas."""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from ipaddress import ip_address
from typing import Any, Iterable


FAILED_OUTCOME = "failed"
VALID_OUTCOMES = {FAILED_OUTCOME, "success"}


@dataclass(frozen=True)
class AuthenticationEvent:
    """Um evento de autenticação já validado."""

    timestamp: datetime
    ip_address: str
    username: str
    outcome: str


@dataclass(frozen=True)
class SecurityAlert:
    """Evidência de várias falhas num intervalo curto."""

    ip_address: str
    first_failure: datetime
    last_failure: datetime
    failure_count: int
    usernames: tuple[str, ...]

    @property
    def message(self) -> str:
        return (
            f"Atividade suspeita: {self.failure_count} falhas do IP "
            f"{self.ip_address} entre {format_timestamp(self.first_failure)} e "
            f"{format_timestamp(self.last_failure)}. Requer investigação; "
            "não confirma um ataque."
        )


def parse_timestamp(value: Any) -> datetime:
    """Converte uma data ISO 8601 numa data UTC com informação de fuso horário."""

    if not isinstance(value, str) or not value.strip():
        raise ValueError("'timestamp' tem de ser texto ISO 8601 não vazio")

    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"

    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as error:
        raise ValueError("'timestamp' não é uma data ISO 8601 válida") from error

    if parsed.tzinfo is None:
        raise ValueError("'timestamp' tem de incluir o fuso horário")

    return parsed.astimezone(timezone.utc)


def validate_event(raw_event: Any) -> AuthenticationEvent:
    """Valida um objeto recebido do JSON e devolve um evento seguro para uso."""

    if not isinstance(raw_event, dict):
        raise ValueError("o evento tem de ser um objeto JSON")

    required_fields = ("timestamp", "ip_address", "username", "outcome")
    missing = [field for field in required_fields if field not in raw_event]
    if missing:
        raise ValueError(f"campos obrigatórios em falta: {', '.join(missing)}")

    timestamp = parse_timestamp(raw_event["timestamp"])

    raw_ip = raw_event["ip_address"]
    if not isinstance(raw_ip, str):
        raise ValueError("'ip_address' tem de ser texto")
    try:
        normalized_ip = str(ip_address(raw_ip.strip()))
    except ValueError as error:
        raise ValueError("'ip_address' não é um endereço IP válido") from error

    username = raw_event["username"]
    if not isinstance(username, str) or not username.strip():
        raise ValueError("'username' tem de ser texto não vazio")

    outcome = raw_event["outcome"]
    if not isinstance(outcome, str) or outcome.lower() not in VALID_OUTCOMES:
        raise ValueError("'outcome' tem de ser 'failed' ou 'success'")

    return AuthenticationEvent(
        timestamp=timestamp,
        ip_address=normalized_ip,
        username=username.strip(),
        outcome=outcome.lower(),
    )


def validate_events(
    raw_events: Any,
) -> tuple[list[AuthenticationEvent], list[str]]:
    """Valida uma lista e devolve separadamente eventos válidos e erros."""

    if not isinstance(raw_events, list):
        return [], ["a raiz do ficheiro JSON tem de ser uma lista"]

    valid_events: list[AuthenticationEvent] = []
    errors: list[str] = []
    for position, raw_event in enumerate(raw_events, start=1):
        try:
            valid_events.append(validate_event(raw_event))
        except ValueError as error:
            errors.append(f"evento {position}: {error}")

    return valid_events, errors


def detect_failed_login_bursts(
    events: Iterable[AuthenticationEvent],
    threshold: int = 5,
    window_seconds: int = 60,
) -> list[SecurityAlert]:
    """Deteta IPs com várias falhas dentro de uma janela temporal deslizante."""

    if threshold < 1:
        raise ValueError("threshold tem de ser pelo menos 1")
    if window_seconds < 0:
        raise ValueError("window_seconds não pode ser negativo")

    failures_by_ip: dict[str, list[AuthenticationEvent]] = defaultdict(list)
    for event in events:
        if event.outcome == FAILED_OUTCOME:
            failures_by_ip[event.ip_address].append(event)

    alerts: list[SecurityAlert] = []
    window_size = timedelta(seconds=window_seconds)

    for source_ip, failures in failures_by_ip.items():
        ordered_failures = sorted(failures, key=lambda event: event.timestamp)
        current_window: deque[AuthenticationEvent] = deque()
        sequence_has_alert = False

        for failure in ordered_failures:
            current_window.append(failure)
            while failure.timestamp - current_window[0].timestamp > window_size:
                current_window.popleft()

            if len(current_window) < threshold:
                sequence_has_alert = False
            elif not sequence_has_alert:
                evidence = list(current_window)
                alerts.append(
                    SecurityAlert(
                        ip_address=source_ip,
                        first_failure=evidence[0].timestamp,
                        last_failure=evidence[-1].timestamp,
                        failure_count=len(evidence),
                        usernames=tuple(sorted({item.username for item in evidence})),
                    )
                )
                sequence_has_alert = True

    return sorted(alerts, key=lambda alert: (alert.last_failure, alert.ip_address))


def format_timestamp(value: datetime) -> str:
    """Produz timestamps UTC legíveis e consistentes."""

    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

