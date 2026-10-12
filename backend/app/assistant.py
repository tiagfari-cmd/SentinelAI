"""Optional assistant providers; mock mode is the safe default."""

import os

import httpx


class GeminiRequestError(ValueError):
    """A safe, credential-free description of an upstream Gemini error."""


def _mock_answer(message: str, event_count: int, alert_count: int) -> str:
    question = message.casefold()
    if "alert" in question or "investig" in question:
        if alert_count:
            return (
                f"A API apresenta {alert_count} alerta(s) e {event_count} evento(s). "
                "Confirma os registos na origem, procura autenticações bem-sucedidas "
                "próximas das falhas e valida a atividade com a pessoa responsável. "
                "Um alerta é um sinal para investigar, não prova um ataque."
            )
        return "Não há alertas guardados neste momento. Um alerta é apenas um sinal para investigar, não uma confirmação de ataque."
    return (
        f"A API apresenta {event_count} evento(s) e {alert_count} alerta(s). "
        "Este modo de demonstração usa respostas fixas; configura Gemini no backend "
        "para respostas geradas por IA."
    )


async def answer_question(message: str, event_count: int, alert_count: int) -> tuple[str, str]:
    """Answer with Gemini only when explicitly enabled and a server key exists."""

    provider = os.getenv("ASSISTANT_PROVIDER", "mock").strip().lower()
    api_key = os.getenv("GEMINI_API_KEY")
    if provider != "gemini" or not api_key:
        return _mock_answer(message, event_count, alert_count), "mock"

    model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "system_instruction": {
            "parts": [{
                "text": (
                    "És o assistente educativo do SentinelAI. Responde em português europeu, "
                    "de forma concisa. Distingue factos de hipóteses. Nunca declares que houve "
                    "um ataque só com base num alerta, nem recomendes ações automáticas. "
                    "Recebes apenas contagens agregadas, não dados pessoais nem eventos brutos."
                )}]
        },
        "contents": [{"parts": [{"text": (
            f"Estado agregado: {event_count} eventos e {alert_count} alertas. "
            f"Pergunta: {message}"
        )}]}],
        "generationConfig": {"maxOutputTokens": 400, "temperature": 0.3},
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            endpoint,
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            json=payload,
        )
    if response.is_error:
        try:
            error = response.json().get("error", {})
            status_name = error.get("status", "UNKNOWN")
            status_code = response.status_code
        except (ValueError, AttributeError):
            status_name = "UNKNOWN"
            status_code = response.status_code
        raise GeminiRequestError(
            f"Gemini respondeu HTTP {status_code} ({status_name}). "
            "Verifica a chave, o modelo e a quota na Google AI Studio."
        )
    data = response.json()
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError, TypeError, AttributeError) as exc:
        raise ValueError("Gemini devolveu uma resposta sem texto") from exc
    if not text:
        raise ValueError("Gemini devolveu uma resposta vazia")
    return text, "gemini"
