import json
import sys
import types
import unittest
from unittest.mock import AsyncMock, patch


fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

fake_auth = types.ModuleType("routes.auth")


async def fake_get_current_user():
    return None


fake_auth.get_current_user = fake_get_current_user
sys.modules.setdefault("routes.auth", fake_auth)

from routes import ai as ai_route


def choice_question(index: int) -> dict:
    options = [f"{index}-A", f"{index}-B", f"{index}-C", f"{index}-D"]
    return {
        "type": "choice",
        "difficulty": "medium",
        "question": f"Question {index}?",
        "options": options,
        "correct": 0,
        "correctAnswer": options[0],
    }


class AIRouteContractTests(unittest.IsolatedAsyncioTestCase):
    request = object()

    async def test_generate_quiz_returns_requested_count(self):
        payload = {
            "title": "Quiz",
            "questions": [choice_question(index) for index in range(5)],
        }

        with (
            patch.object(ai_route, "check_ai_limit", return_value=None),
            patch.object(
                ai_route,
                "call_openai",
                new=AsyncMock(return_value=json.dumps(payload)),
            ),
        ):
            response = await ai_route.generate_quiz.__wrapped__(
                self.request,
                ai_route.GenerateQuizInput(count=5),
                None,
            )

        self.assertEqual(response, payload)

    async def test_generate_question_returns_three_variants(self):
        payload = {"variants": [choice_question(index) for index in range(3)]}

        with (
            patch.object(ai_route, "check_ai_limit", return_value=None),
            patch.object(
                ai_route,
                "call_openai",
                new=AsyncMock(return_value=json.dumps(payload)),
            ),
        ):
            response = await ai_route.generate_question.__wrapped__(
                self.request,
                ai_route.GenerateQuestionInput(topic="history"),
                None,
            )

        self.assertEqual(response["variants"], payload["variants"])
        self.assertEqual(len(response["variants"]), 3)

    async def test_provider_error_returns_controlled_502(self):
        provider_error = {
            "error": "AI provider configuration error",
            "code": "model_not_found",
        }

        with (
            patch.object(ai_route, "check_ai_limit", return_value=None),
            patch.object(
                ai_route,
                "call_openai",
                new=AsyncMock(return_value=json.dumps(provider_error)),
            ),
        ):
            response = await ai_route.generate_quiz.__wrapped__(
                self.request,
                ai_route.GenerateQuizInput(count=5),
                None,
            )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            json.loads(response.body),
            {
                "error": provider_error["error"],
                "code": provider_error["code"],
            },
        )

    async def test_malformed_json_returns_controlled_502(self):
        with (
            patch.object(ai_route, "check_ai_limit", return_value=None),
            patch.object(
                ai_route,
                "call_openai",
                new=AsyncMock(return_value="not json"),
            ),
        ):
            response = await ai_route.generate_quiz.__wrapped__(
                self.request,
                ai_route.GenerateQuizInput(count=5),
                None,
            )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(json.loads(response.body)["code"], "invalid_ai_json")


if __name__ == "__main__":
    unittest.main()
