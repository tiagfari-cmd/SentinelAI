"""Endpoints HTTP da API inicial do SentinelAI."""

import os

from fastapi import Depends, FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .database import get_db
from .detection import AuthenticationEvent
from .repositories import (
    event_from_model,
    list_alerts,
    list_events,
    save_event_and_new_alerts,
)
from .schemas import AuthenticationEventSchema, SecurityAlertSchema


app = FastAPI(
    title="SentinelAI API",
    description="API educativa para eventos e alertas de autenticação suspeita.",
    version="0.3.0",
)

allowed_origins = os.getenv("CORS_ALLOWED_ORIGINS")
if allowed_origins:
    cors_origins = [origin.strip() for origin in allowed_origins.split(",") if origin.strip()]
else:
    cors_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Accept", "Content-Type"],
)

@app.get("/health")
def health_check() -> dict[str, str]:
    """Indica que o processo da API está a responder."""

    return {"status": "ok"}


@app.get("/events", response_model=list[AuthenticationEventSchema])
def get_events(session: Session = Depends(get_db)) -> list[AuthenticationEvent]:
    """Devolve os eventos guardados, por ordem cronológica."""

    return [event_from_model(row) for row in list_events(session)]


@app.post(
    "/events",
    response_model=AuthenticationEventSchema,
    status_code=status.HTTP_201_CREATED,
)
def create_event(
    event: AuthenticationEventSchema,
    session: Session = Depends(get_db),
) -> AuthenticationEvent:
    """Valida e guarda um evento e atualiza os alertas detetados."""

    validated_event = event.to_detection_event()
    saved = save_event_and_new_alerts(session, validated_event)
    return event_from_model(saved)


@app.get("/alerts", response_model=list[SecurityAlertSchema])
def get_alerts(session: Session = Depends(get_db)) -> list[SecurityAlertSchema]:
    """Devolve os alertas persistidos, incluindo quando foram detetados."""

    return [SecurityAlertSchema.model_validate(row) for row in list_alerts(session)]
