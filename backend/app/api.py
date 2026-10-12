"""Endpoints HTTP da API inicial do SentinelAI."""

from fastapi import FastAPI, status

from .detection import AuthenticationEvent, detect_failed_login_bursts
from .schemas import AuthenticationEventSchema, SecurityAlertSchema


app = FastAPI(
    title="SentinelAI API",
    description="API educativa para eventos e alertas de autenticação suspeita.",
    version="0.2.0",
)

# Armazenamento temporário: os eventos desaparecem quando a API é reiniciada.
events: list[AuthenticationEvent] = []


@app.get("/health")
def health_check() -> dict[str, str]:
    """Indica que o processo da API está a responder."""

    return {"status": "ok"}


@app.get("/events", response_model=list[AuthenticationEventSchema])
def list_events() -> list[AuthenticationEvent]:
    """Devolve os eventos guardados, por ordem cronológica."""

    return sorted(events, key=lambda event: event.timestamp)


@app.post(
    "/events",
    response_model=AuthenticationEventSchema,
    status_code=status.HTTP_201_CREATED,
)
def create_event(event: AuthenticationEventSchema) -> AuthenticationEvent:
    """Valida e guarda um evento durante a execução atual da API."""

    validated_event = event.to_detection_event()
    events.append(validated_event)
    return validated_event


@app.get("/alerts", response_model=list[SecurityAlertSchema])
def list_alerts() -> list[SecurityAlertSchema]:
    """Executa a regra de deteção sobre os eventos atualmente guardados."""

    alerts = detect_failed_login_bursts(events)
    return [SecurityAlertSchema.from_alert(alert) for alert in alerts]
