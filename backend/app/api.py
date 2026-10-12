"""Endpoints HTTP da API inicial do SentinelAI."""

import os
import hmac

import httpx
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .assistant import GeminiRequestError, answer_question
from .detection import AuthenticationEvent
from .repositories import (
    event_from_model,
    list_alerts,
    list_events,
    save_event_and_new_alerts,
)
from .schemas import (
    AssistantRequest,
    AssistantResponse,
    AuthenticationEventSchema,
    SecurityAlertSchema,
)


app = FastAPI(
    title="SentinelAI API",
    description="API educativa para eventos e alertas de autenticação suspeita.",
    version="0.3.0",
)

bearer_scheme = HTTPBearer(auto_error=False)


def require_api_access(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> None:
    """Fail closed in production; optionally enforce a shared operator token."""

    expected = os.getenv("SENTINELAI_API_TOKEN", "").strip()
    production = os.getenv("APP_ENV", "development").strip().lower() == "production"
    if not expected:
        if production:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="A API não está configurada com um token de acesso.",
            )
        return
    supplied = credentials.credentials if credentials else ""
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de acesso inválido ou em falta.",
            headers={"WWW-Authenticate": "Bearer"},
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
    allow_headers=["Accept", "Authorization", "Content-Type"],
)

@app.get("/health")
def health_check() -> dict[str, str]:
    """Indica que o processo da API está a responder."""

    return {"status": "ok"}


@app.get("/auth/check", dependencies=[Depends(require_api_access)])
def check_api_access() -> dict[str, str]:
    """Validates the dashboard's in-memory bearer token."""

    return {"status": "authorized"}


@app.get("/events", response_model=list[AuthenticationEventSchema])
def get_events(
    session: Session = Depends(get_db),
    _access: None = Depends(require_api_access),
) -> list[AuthenticationEvent]:
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
    _access: None = Depends(require_api_access),
) -> AuthenticationEvent:
    """Valida e guarda um evento e atualiza os alertas detetados."""

    validated_event = event.to_detection_event()
    saved = save_event_and_new_alerts(session, validated_event)
    return event_from_model(saved)


@app.get("/alerts", response_model=list[SecurityAlertSchema])
def get_alerts(
    session: Session = Depends(get_db),
    _access: None = Depends(require_api_access),
) -> list[SecurityAlertSchema]:
    """Devolve os alertas persistidos, incluindo quando foram detetados."""

    return [SecurityAlertSchema.model_validate(row) for row in list_alerts(session)]


@app.post("/assistant", response_model=AssistantResponse)
async def ask_assistant(
    request: AssistantRequest,
    session: Session = Depends(get_db),
    _access: None = Depends(require_api_access),
) -> AssistantResponse:
    """Answers using aggregate counts only; provider is opt-in via server env."""

    try:
        answer, provider = await answer_question(
            request.message,
            event_count=len(list_events(session)),
            alert_count=len(list_alerts(session)),
        )
    except GeminiRequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="O assistente externo não conseguiu responder. Tenta novamente mais tarde.",
        ) from exc
    return AssistantResponse(answer=answer, provider=provider)
