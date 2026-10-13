"""Configuração da ligação à base de dados e sessões SQLAlchemy."""

import os
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    """Classe base para os modelos guardados na base de dados."""


def build_engine(database_url: str | None = None) -> Engine:
    """Cria uma ligação; SQLite é a opção local por omissão."""

    url = database_url or os.getenv("DATABASE_URL", "sqlite:///./sentinelai.db")
    options = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=options)


engine = build_engine()
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """Abre uma sessão por pedido e garante que é fechada no fim."""

    with SessionLocal() as session:
        yield session

