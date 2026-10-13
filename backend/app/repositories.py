"""Operações de leitura e escrita na base de dados."""

from datetime import datetime, timezone
from hashlib import sha256

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .detection import AuthenticationEvent, SecurityAlert, detect_failed_login_bursts
from .models import AlertReviewModel, AuthenticationEventModel, SecurityAlertModel


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


class EventKeyConflict(ValueError):
    """An ingestion key was already used for a different authentication event."""


def save_event_and_new_alerts(
    session: Session, event: AuthenticationEvent, ingestion_key: str | None = None,
) -> tuple[AuthenticationEventModel, bool]:
    """Return (row, replayed); a unique key makes retries safe across restarts."""

    def existing_event() -> AuthenticationEventModel | None:
        if ingestion_key is None:
            return None
        row = session.scalar(select(AuthenticationEventModel).where(
            AuthenticationEventModel.ingestion_key == ingestion_key,
        ))
        if row is not None and event_from_model(row) != event:
            raise EventKeyConflict("A chave de ingestão já foi usada para outro evento.")
        return row

    existing = existing_event()
    if existing is not None:
        return existing, True
    try:
        return _insert_event_and_new_alerts(session, event, ingestion_key), False
    except IntegrityError:
        session.rollback()
        # Another request may have committed this key after our initial lookup.
        existing = existing_event()
        if existing is not None:
            return existing, True
        raise


def _insert_event_and_new_alerts(
    session: Session, event: AuthenticationEvent, ingestion_key: str | None,
) -> AuthenticationEventModel:
    """Guarda o evento e quaisquer novos alertas numa única transação."""

    row = AuthenticationEventModel(
        ingestion_key=ingestion_key,
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


class AlertNotFound(ValueError):
    pass


class AlertReviewConflict(ValueError):
    pass


def review_alert(session: Session, alert_id: int, *, review_status: str,
                 review_note: str, expected_revision: int) -> SecurityAlertModel:
    """Atomically save state plus history, refusing stale browser edits."""
    reviewed_at = datetime.now(timezone.utc)
    changed = session.execute(update(SecurityAlertModel).where(
        SecurityAlertModel.id == alert_id,
        SecurityAlertModel.review_revision == expected_revision,
    ).values(review_status=review_status, review_note=review_note,
             reviewed_at=reviewed_at, review_revision=expected_revision + 1))
    if changed.rowcount != 1:
        session.rollback()
        if session.get(SecurityAlertModel, alert_id) is None:
            raise AlertNotFound("Alerta não encontrado.")
        raise AlertReviewConflict("O alerta foi alterado. Atualiza os detalhes antes de guardar novamente.")
    session.add(AlertReviewModel(alert_id=alert_id, revision=expected_revision + 1,
                                review_status=review_status, review_note=review_note,
                                reviewed_at=reviewed_at))
    session.commit()
    return session.get(SecurityAlertModel, alert_id)


def list_alert_reviews(session: Session, alert_id: int, *, limit: int, offset: int):
    if session.get(SecurityAlertModel, alert_id) is None:
        raise AlertNotFound("Alerta não encontrado.")
    query = select(AlertReviewModel).where(AlertReviewModel.alert_id == alert_id)
    rows = list(session.scalars(query.order_by(AlertReviewModel.revision.desc()).limit(limit).offset(offset)))
    total = session.scalar(select(func.count()).select_from(AlertReviewModel).where(AlertReviewModel.alert_id == alert_id)) or 0
    return rows, total

