import json
import io
import os
import sys
import types
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import UploadFile


fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)
os.environ["JWT_SECRET"] = "test-jwt-secret-for-unit-tests-only-123456"

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


def bool_question(index: int) -> dict:
    return {"type": "bool", "difficulty": "medium", "question": f"Statement {index}", "correct": True}


def text_question(index: int) -> dict:
    return {"type": "text", "difficulty": "medium", "question": f"Question {index}?", "correctAnswer": "Answer"}


def five_question_auto_quiz() -> dict:
    return {
        "title": "Quiz",
        "questions": [choice_question(1), choice_question(2), choice_question(3), text_question(4), bool_question(5)],
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
            ) as call_openai,
        ):
            response = await ai_route.generate_quiz.__wrapped__(
                self.request,
                ai_route.GenerateQuizInput(count=5),
                None,
            )

        self.assertEqual(response, payload)
        self.assertNotIn("Используй РОВНО это количество", call_openai.await_args.args[0])

    async def test_generate_quiz_passes_and_validates_manual_distribution(self):
        distribution = {"choice": 3, "bool": 2, "text": 0, "matching": 0, "close": 0, "ordering": 0}
        payload = {
            "title": "Manual",
            "questions": [choice_question(1), choice_question(2), choice_question(3), bool_question(4), bool_question(5)],
        }
        with (
            patch.object(ai_route, "check_ai_limit", return_value=None),
            patch.object(ai_route, "call_openai", new=AsyncMock(return_value=json.dumps(payload))) as call_openai,
        ):
            response = await ai_route.generate_quiz.__wrapped__(
                self.request,
                ai_route.GenerateQuizInput(count=5, type_distribution=distribution),
                None,
            )

        self.assertEqual(response, payload)
        self.assertIn("- choice: 3", call_openai.await_args.args[0])
        self.assertIn("- bool: 2", call_openai.await_args.args[0])

    async def test_generate_quiz_rejects_invalid_manual_total(self):
        distribution = {"choice": 4, "bool": 0, "text": 0, "matching": 0, "close": 0, "ordering": 0}
        with patch.object(ai_route, "check_ai_limit", return_value=None):
            response = await ai_route.generate_quiz.__wrapped__(
                self.request,
                ai_route.GenerateQuizInput(count=5, type_distribution=distribution),
                None,
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(json.loads(response.body)["code"], "invalid_type_distribution")

    async def test_generate_quiz_rejects_ai_distribution_mismatch(self):
        distribution = {"choice": 3, "bool": 2, "text": 0, "matching": 0, "close": 0, "ordering": 0}
        wrong_payload = five_question_auto_quiz()
        with (
            patch.object(ai_route, "check_ai_limit", return_value=None),
            patch.object(ai_route, "call_openai", new=AsyncMock(return_value=json.dumps(wrong_payload))),
        ):
            response = await ai_route.generate_quiz.__wrapped__(
                self.request,
                ai_route.GenerateQuizInput(count=5, type_distribution=distribution),
                None,
            )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(json.loads(response.body)["code"], "invalid_ai_response")

    async def test_generate_quiz_retries_manual_distribution_after_model_mismatch(self):
        distribution = {"choice": 3, "bool": 2, "text": 0, "matching": 0, "close": 0, "ordering": 0}
        correct_payload = {
            "title": "Manual",
            "questions": [choice_question(1), choice_question(2), choice_question(3), bool_question(4), bool_question(5)],
        }
        with (
            patch.object(ai_route, "check_ai_limit", return_value=None),
            patch.object(
                ai_route,
                "call_openai",
                new=AsyncMock(side_effect=[json.dumps(five_question_auto_quiz()), json.dumps(correct_payload)]),
            ) as call_openai,
        ):
            response = await ai_route.generate_quiz.__wrapped__(
                self.request,
                ai_route.GenerateQuizInput(count=5, type_distribution=distribution),
                None,
            )

        self.assertEqual(response, correct_payload)
        self.assertEqual(call_openai.await_count, 2)
        self.assertEqual(call_openai.await_args_list[1].kwargs["temperature"], 0.2)
        self.assertEqual(call_openai.await_args_list[1].kwargs["request_type"], "generate_quiz_retry")

    def test_automatic_distribution_covers_limits(self):
        self.assertEqual(sum(ai_route.get_quiz_type_distribution(5).values()), 5)
        self.assertEqual(ai_route.get_quiz_type_distribution(10)["choice"], 6)
        self.assertEqual(sum(ai_route.get_quiz_type_distribution(20).values()), 20)

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

    async def test_jeopardy_categories_returns_validated_categories(self):
        payload = {
            "categories": [
                {"name": f"Category {index}", "description": f"Description {index}"}
                for index in range(1, 6)
            ]
        }

        with (
            patch.object(ai_route, "check_ai_limit", return_value=None),
            patch.object(
                ai_route,
                "call_openai",
                new=AsyncMock(return_value=json.dumps(payload)),
            ),
        ):
            response = await ai_route.generate_jeopardy_categories.__wrapped__(
                self.request,
                ai_route.GenerateJeopardyCategoriesInput(topic="science"),
                None,
            )

        self.assertEqual(response, payload)

    async def test_jeopardy_questions_reject_invalid_slots(self):
        payload = {
            "questions": [
                {"points": 100, "difficulty": "basic", "q": "Question?", "a": "Answer"},
            ]
        }

        with (
            patch.object(ai_route, "check_ai_limit", return_value=None),
            patch.object(
                ai_route,
                "call_openai",
                new=AsyncMock(return_value=json.dumps(payload)),
            ),
        ):
            response = await ai_route.generate_jeopardy_questions.__wrapped__(
                self.request,
                ai_route.GenerateJeopardyQuestionsInput(
                    category="science",
                    emptySlots=[100, 200],
                ),
                None,
            )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(json.loads(response.body)["code"], "invalid_ai_response")

    async def test_generate_from_file_rejects_unsupported_extension(self):
        upload = UploadFile(filename="notes.csv", file=io.BytesIO(b"facts"))

        with patch.object(ai_route, "check_ai_limit", return_value=None):
            response = await ai_route.generate_from_file.__wrapped__(
                self.request,
                upload,
                5,
                "mixed",
                "",
                None,
                None,
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(json.loads(response.body)["code"], "unsupported_file_format")

    async def test_generate_from_file_returns_validated_quiz(self):
        payload = {
            "title": "Imported quiz",
            "questions": [choice_question(index) for index in range(5)],
        }
        upload = UploadFile(
            filename="notes.txt",
            file=io.BytesIO("The moon reflects sunlight.".encode()),
        )

        with (
            patch.object(ai_route, "check_ai_limit", return_value=None),
            patch.object(
                ai_route,
                "call_openai",
                new=AsyncMock(return_value=json.dumps(payload)),
            ) as call_openai,
        ):
            response = await ai_route.generate_from_file.__wrapped__(
                self.request,
                upload,
                5,
                "mixed",
                "",
                None,
                None,
            )

        self.assertEqual(response, payload)
        self.assertIn("The moon reflects sunlight.", call_openai.await_args.args[0])

    async def test_generate_from_file_rejects_empty_text(self):
        upload = UploadFile(filename="empty.txt", file=io.BytesIO(b"  \n"))

        with patch.object(ai_route, "check_ai_limit", return_value=None):
            response = await ai_route.generate_from_file.__wrapped__(
                self.request,
                upload,
                5,
                "mixed",
                "",
                None,
                None,
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(json.loads(response.body)["code"], "empty_file_text")

    async def test_generate_from_file_returns_provider_error(self):
        upload = UploadFile(filename="notes.txt", file=io.BytesIO(b"facts"))
        provider_error = {
            "error": "AI request timeout",
            "code": "ai_provider_timeout",
        }

        with (
            patch.object(ai_route, "check_ai_limit", return_value=None),
            patch.object(
                ai_route,
                "call_openai",
                new=AsyncMock(return_value=json.dumps(provider_error)),
            ),
        ):
            response = await ai_route.generate_from_file.__wrapped__(
                self.request,
                upload,
                5,
                "mixed",
                "",
                None,
                None,
            )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(json.loads(response.body)["code"], "ai_provider_timeout")


if __name__ == "__main__":
    unittest.main()
