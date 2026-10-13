"""Modelos Pydantic usados para validar e representar dados da API."""

from datetime import datetime, timezone
from ipaddress import IPv4Address, IPv6Address
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .detection import AuthenticationEvent


class AuthenticationEventSchema(BaseModel):
    """Formato de um evento recebido ou devolvido pela API."""

    model_config = ConfigDict(from_attributes=True, extra="forbid")

    timestamp: datetime
    ip_address: IPv4Address | IPv6Address
    username: str = Field(min_length=1, max_length=255)
    outcome: Literal["failed", "success"]

    @field_validator("timestamp")
    @classmethod
    def timestamp_must_have_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp tem de incluir o fuso horário")
        return value.astimezone(timezone.utc)

    @field_validator("username")
    @classmethod
    def username_must_not_be_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("username não pode estar vazio")
        return normalized

    def to_detection_event(self) -> AuthenticationEvent:
        """Converte os dados validados para o formato usado pelo detetor."""

        return AuthenticationEvent(
            timestamp=self.timestamp,
            ip_address=str(self.ip_address),
            username=self.username,
            outcome=self.outcome,
        )


class SecurityAlertSchema(BaseModel):
    """Formato público de um alerta devolvido pela API."""

    model_config = ConfigDict(from_attributes=True)

    ip_address: str
    first_failure: datetime
    last_failure: datetime
    detected_at: datetime
    failure_count: int
    usernames: tuple[str, ...]
    message: str

    @field_validator("first_failure", "last_failure", "detected_at")
    @classmethod
    def alert_timestamps_are_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class AssistantRequest(BaseModel):
    """A bounded question for the optional security assistant."""

    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=1000)

    @field_validator("message")
    @classmethod
    def message_must_not_be_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("message não pode estar vazio")
        return normalized


class AssistantResponse(BaseModel):
    answer: str
    provider: Literal["mock", "gemini"]


__all__ = ["AssistantRequest", "AssistantResponse", "AuthenticationEventSchema", "SecurityAlertSchema"]
# End of public API schemas.

