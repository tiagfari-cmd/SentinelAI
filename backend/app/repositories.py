"""Operações de leitura e escrita na base de dados."""

from datetime import datetime, timezone
from hashlib import sha256

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .detection import AuthenticationEvent, SecurityAlert, detect_failed_login_bursts
from .models import AuthenticationEventModel, SecurityAlertModel


def as_utc(value: datetime) -> datetime:
    """Normaliza também datas sem fuso devolvidas pelo SQLite para UTC."""

    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def event_from_model(row: AuthenticationEventModel) -> AuthenticationEvent:
    return AuthenticationEvent(
        timestamp=as_utc(row.timestamp),
        ip_address=row.ip_address,
        username=row.username,
        outcome=row.outcome,
    )


def list_events(
    session: Session, *, limit: int | None = None, offset: int = 0, descending: bool = False,
) -> list[AuthenticationEventModel]:
    columns = (AuthenticationEventModel.timestamp, AuthenticationEventModel.id)
    statement = select(AuthenticationEventModel).order_by(
        *(column.desc() if descending else column.asc() for column in columns)
    ).offset(offset)
    if limit is not None:
        statement = statement.limit(limit)
    return list(session.scalars(statement))


def count_events(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(AuthenticationEventModel)) or 0


def count_alerts(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(SecurityAlertModel)) or 0


def save_event_and_new_alerts(
    session: Session, event: AuthenticationEvent
) -> AuthenticationEventModel:
    """Guarda o evento e quaisquer novos alertas numa única transação."""

    row = AuthenticationEventModel(
        timestamp=event.timestamp,
        ip_address=event.ip_address,
        username=event.username,
        outcome=event.outcome,
    )
    session.add(row)
    session.flush()

    all_events = [event_from_model(item) for item in list_events(session)]
    alerts = detect_failed_login_bursts(all_events)
    known_fingerprints = set(
        session.scalars(select(SecurityAlertModel.fingerprint))
    )
    detected_at = datetime.now(timezone.utc)

    for alert in alerts:
        fingerprint = alert_fingerprint(alert)
        if fingerprint in known_fingerprints:
            continue
        session.add(
            SecurityAlertModel(
                fingerprint=fingerprint,
                ip_address=alert.ip_address,
                first_failure=alert.first_failure,
                last_failure=alert.last_failure,
                detected_at=detected_at,
                failure_count=alert.failure_count,
                usernames=list(alert.usernames),
                message=alert.message,
            )
        )
        known_fingerprints.add(fingerprint)

    session.commit()
    session.refresh(row)
    return row


def alert_fingerprint(alert: SecurityAlert) -> str:
    """Gera uma chave estável para não guardar duas vezes o mesmo alerta."""

    raw = "|".join(
        (
            alert.ip_address,
            alert.first_failure.isoformat(),
            alert.last_failure.isoformat(),
        )
    )
    return sha256(raw.encode("utf-8")).hexdigest()


def list_alerts(
    session: Session, *, limit: int | None = None, offset: int = 0, descending: bool = False,
) -> list[SecurityAlertModel]:
    columns = (SecurityAlertModel.last_failure, SecurityAlertModel.id)
    statement = select(SecurityAlertModel).order_by(
        *(column.desc() if descending else column.asc() for column in columns)
    ).offset(offset)
    if limit is not None:
        statement = statement.limit(limit)
    return list(session.scalars(statement))

