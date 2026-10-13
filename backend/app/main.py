"""Interface de linha de comandos para o motor de deteção SentinelAI."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .detection import detect_failed_login_bursts, validate_events


def load_json(path: Path) -> Any:
    """Lê e descodifica um ficheiro JSON."""

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValueError(f"ficheiro não encontrado: {path}") from error
    except OSError as error:
        raise ValueError(f"não foi possível ler o ficheiro: {error}") from error
    except json.JSONDecodeError as error:
        raise ValueError(
            f"JSON inválido na linha {error.lineno}, coluna {error.colno}"
        ) from error


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Deteta padrões suspeitos em registos de autenticação."
    )
    parser.add_argument("log_file", type=Path, help="caminho para o ficheiro JSON")
    return parser


def main() -> int:
    args = build_parser().parse_args()

    try:
        raw_events = load_json(args.log_file)
    except ValueError as error:
        print(f"Erro: {error}", file=sys.stderr)
        return 1

    events, validation_errors = validate_events(raw_events)
    for error in validation_errors:
        print(f"Aviso: ignorado {error}", file=sys.stderr)

    alerts = detect_failed_login_bursts(events)
    print(f"Eventos válidos: {len(events)}")
    print(f"Eventos inválidos: {len(validation_errors)}")
    print(f"Alertas: {len(alerts)}")

    for number, alert in enumerate(alerts, start=1):
        print(f"\n[{number}] {alert.message}")
        print(f"    Utilizadores observados: {', '.join(alert.usernames)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

