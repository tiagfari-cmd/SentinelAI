"""Privacy tests for the optional external assistant provider."""

import unittest
import os
from unittest.mock import patch

from backend.app.assistant import answer_question, redact_sensitive_text


class RedactionTests(unittest.TestCase):
    def test_common_identifiers_and_credentials_are_redacted(self) -> None:
        question = (
            "Investiga 203.0.113.42 e 2001:db8::1; contacto ana@example.com; "
            "api_key=abc123 Bearer eyJhbGciOiJIUzI1NiJ9 secret=topsecret "
            "AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ123456"
        )

        redacted = redact_sensitive_text(question)

        self.assertNotIn("203.0.113.42", redacted)
        self.assertNotIn("2001:db8::1", redacted)
        self.assertNotIn("ana@example.com", redacted)
        self.assertNotIn("abc123", redacted)
        self.assertNotIn("eyJhbGciOiJIUzI1NiJ9", redacted)
        self.assertNotIn("topsecret", redacted)
        self.assertNotIn("AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ123456", redacted)
        self.assertIn("[IP redigido]", redacted)
        self.assertIn("[email redigido]", redacted)
        self.assertIn("[credencial redigida]", redacted)
        self.assertIn("[chave redigida]", redacted)

    def test_non_ip_timestamps_are_not_redacted_as_ipv6(self) -> None:
        self.assertEqual(
            redact_sensitive_text("O evento foi às 09:00:00Z."),
            "O evento foi às 09:00:00Z.",
        )


class GeminiPayloadTests(unittest.IsolatedAsyncioTestCase):
    async def test_gemini_receives_only_the_redacted_question_and_counts(self) -> None:
        class FakeResponse:
            is_error = False

            @staticmethod
            def json() -> dict[str, object]:
                return {"candidates": [{"content": {"parts": [{"text": "Resposta"}]}}]}

        class FakeClient:
            request_json: dict[str, object] | None = None

            async def __aenter__(self) -> "FakeClient":
                return self

            async def __aexit__(self, *_: object) -> None:
                return None

            async def post(self, *_: object, **kwargs: object) -> FakeResponse:
                self.request_json = kwargs["json"]  # type: ignore[assignment]
                return FakeResponse()

        client = FakeClient()
        with (
            patch.dict(os.environ, {"ASSISTANT_PROVIDER": "gemini", "GEMINI_API_KEY": "test-key"}),
            patch("backend.app.assistant.httpx.AsyncClient", return_value=client),
        ):
            answer, provider = await answer_question(
                "Investiga 203.0.113.42; email ana@example.com; token=supersecret",
                event_count=12,
                alert_count=2,
            )

        prompt = client.request_json["contents"][0]["parts"][0]["text"]  # type: ignore[index]
        self.assertEqual((answer, provider), ("Resposta", "gemini"))
        self.assertNotIn("203.0.113.42", prompt)
        self.assertNotIn("ana@example.com", prompt)
        self.assertNotIn("supersecret", prompt)
        self.assertIn("12 eventos e 2 alertas", prompt)


if __name__ == "__main__":
    unittest.main()
