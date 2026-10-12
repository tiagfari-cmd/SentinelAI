"""Modelos SQLAlchemy que representam os dados persistidos."""

from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class AuthenticationEventModel(Base):
    __tablename__ = "authentication_events"

    id: Mapped[int] = mapped_column(primary_key=True)
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

