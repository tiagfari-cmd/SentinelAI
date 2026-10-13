"""Modelos SQLAlchemy que representam os dados persistidos."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class AuthenticationEventModel(Base):
    __tablename__ = "authentication_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    ingestion_key: Mapped[str | None] = mapped_column(String(128), unique=True, index=True, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ip_address: Mapped[str] = mapped_column(String(45), index=True)
    username: Mapped[str] = mapped_column(String(255))
    outcome: Mapped[str] = mapped_column(String(16), index=True)


class SecurityAlertModel(Base):
    __tablename__ = "security_alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True)
    ip_address: Mapped[str] = mapped_column(String(45), index=True)
    first_failure: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_failure: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    failure_count: Mapped[int] = mapped_column(Integer)
    usernames: Mapped[list[str]] = mapped_column(JSON)
    message: Mapped[str] = mapped_column(String(1000))
    review_status: Mapped[str] = mapped_column(String(20), default="open", server_default="open", index=True)
    review_note: Mapped[str] = mapped_column(String(1000), default="", server_default="")
    review_revision: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AlertReviewModel(Base):
    """Append-only through the API, not a tamper-proof or personally attributed audit."""

    __tablename__ = "alert_reviews"
    __table_args__ = (UniqueConstraint("alert_id", "revision", name="uq_alert_review_revision"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    alert_id: Mapped[int] = mapped_column(ForeignKey("security_alerts.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    review_status: Mapped[str] = mapped_column(String(20))
    review_note: Mapped[str] = mapped_column(String(1000))
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

