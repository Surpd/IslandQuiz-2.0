import os
import sys
import types
import unittest
from unittest.mock import AsyncMock, patch

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests-only-123456")
fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

from routes import ai as ai_route
from services import ai_telemetry


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self.payload = payload

    def json(self):
        return self.payload


class FakeClient:
    def __init__(self, response):
        self.response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, *args, **kwargs):
        return self.response


class AITelemetryTests(unittest.IsolatedAsyncioTestCase):
    async def test_provider_success_records_model_and_usage(self):
        response = FakeResponse(
            200,
            {
                "choices": [{"message": {"content": "{\"ok\":true}"}}],
                "usage": {"prompt_tokens": 12, "completion_tokens": 4},
            },
        )
        with (
            patch.object(ai_route, "OPENAI_API_KEY", "test-key"),
            patch.object(ai_route.httpx, "AsyncClient", return_value=FakeClient(response)),
            patch.object(ai_telemetry, "record_ai_request") as record,
        ):
            result = await ai_route.call_openai("prompt", model="model-a", user_id="u1", request_type="generate_quiz")

        self.assertEqual(result, '{"ok":true}')
        record.assert_called_once_with(
            user_id="u1",
            request_type="generate_quiz",
            model="model-a",
            success=True,
            error=None,
            prompt_tokens=12,
            completion_tokens=4,
        )

    async def test_provider_error_records_failure_with_null_usage(self):
        response = FakeResponse(400, {"error": {"code": "model_not_found"}})
        with (
            patch.object(ai_route, "OPENAI_API_KEY", "test-key"),
            patch.object(ai_route.httpx, "AsyncClient", return_value=FakeClient(response)),
            patch.object(ai_telemetry, "record_ai_request") as record,
        ):
            result = await ai_route.call_openai("prompt", model="model-a", user_id="u1", request_type="generate_quiz")

        self.assertIn("model_not_found", result)
        record.assert_called_once_with(
            user_id="u1",
            request_type="generate_quiz",
            model="model-a",
            success=False,
            error="model_not_found",
            prompt_tokens=None,
            completion_tokens=None,
        )

    async def test_provider_success_without_usage_keeps_tokens_null(self):
        response = FakeResponse(200, {"choices": [{"message": {"content": "{\"ok\":true}"}}]})
        with (
            patch.object(ai_route, "OPENAI_API_KEY", "test-key"),
            patch.object(ai_route.httpx, "AsyncClient", return_value=FakeClient(response)),
            patch.object(ai_telemetry, "record_ai_request") as record,
        ):
            await ai_route.call_openai("prompt", model="model-a", user_id="u1", request_type="generate_quiz")

        self.assertIsNone(record.call_args.kwargs["prompt_tokens"])
        self.assertIsNone(record.call_args.kwargs["completion_tokens"])

    def test_legacy_ai_log_payload_contains_all_available_fields(self):
        inserted = {}

        class Query:
            def insert(self, payload):
                inserted.update(payload)
                return self

            def execute(self):
                return types.SimpleNamespace(data=[inserted])

        class Database:
            def table(self, name):
                self.name = name
                return Query()

        with patch.object(ai_telemetry, "supabase", Database()):
            ai_telemetry.record_ai_request(
                user_id="u1",
                request_type="generate_quiz",
                model="model-a",
                success=False,
                error="provider error",
            )

        self.assertEqual(inserted["user_id"], "u1")
        self.assertEqual(inserted["topic"], "generate_quiz")
        self.assertEqual(inserted["model"], "model-a")
        self.assertFalse(inserted["success"])
        self.assertIsNone(inserted["prompt_tokens"])
        self.assertIsNone(inserted["completion_tokens"])
        self.assertIsNotNone(inserted["created_at"])


if __name__ == "__main__":
    unittest.main()
