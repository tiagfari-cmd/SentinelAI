"""Endpoints HTTP da API inicial do SentinelAI."""

import os
import hmac
from typing import Literal

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .assistant import GeminiRequestError, answer_question
from .detection import AuthenticationEvent
from .limits import ApiLimitsMiddleware, TrafficLimiter
from .repositories import (
    count_alerts,
    count_events,
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
    version="0.4.0",
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
    if not supplied or not hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8")):
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

app.state.traffic_limiter = TrafficLimiter()
app.add_middleware(ApiLimitsMiddleware, limiter=app.state.traffic_limiter)
# CORS wraps the limits so browsers can read 413/429 responses too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Accept", "Authorization", "Content-Type"],
    expose_headers=["X-Total-Count", "Retry-After"],
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
    response: Response,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=100000),
    order: Literal["asc", "desc"] = "asc",
    session: Session = Depends(get_db),
    _access: None = Depends(require_api_access),
) -> list[AuthenticationEvent]:
    """Devolve uma página; X-Total-Count indica o total na base de dados."""

    response.headers["X-Total-Count"] = str(count_events(session))
    return [event_from_model(row) for row in list_events(
        session, limit=limit, offset=offset, descending=order == "desc",
    )]


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
    response: Response,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0, le=100000),
    order: Literal["asc", "desc"] = "asc",
    session: Session = Depends(get_db),
    _access: None = Depends(require_api_access),
) -> list[SecurityAlertSchema]:
    """Devolve os alertas persistidos, incluindo quando foram detetados."""

    response.headers["X-Total-Count"] = str(count_alerts(session))
    return [SecurityAlertSchema.model_validate(row) for row in list_alerts(
        session, limit=limit, offset=offset, descending=order == "desc",
    )]


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
            event_count=count_events(session),
            alert_count=count_alerts(session),
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
