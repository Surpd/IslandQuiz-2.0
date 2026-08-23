import os
import json
import re
import sys
import types
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

os.environ.setdefault("JWT_SECRET", "official-content-tests-only")
fake_database = types.ModuleType("database")
fake_database.supabase = MagicMock()
sys.modules.setdefault("database", fake_database)

from routes.admin import OfficialContentImportInput, apply_official_content_import, require_admin
from services.official_content import validate_pack


TAGS = {"география": "География", "история": "История", "логика": "Логика", "общая эрудиция": "Общая эрудиция"}


def quiz_data():
    return {
        "config": {
            "title": "Все типы Quiz",
            "description": "Регрессионный пример",
            "shuffleQuestions": False,
            "showResult": "end",
            "defaultTime": 30,
            "orderMode": "sequential",
            "totalTime": 10,
        },
        "questions": [
            {"id": "q-choice", "type": "choice", "q": "Столица Италии?", "options": ["Рим", "Париж", "Берлин", "Лиссабон"], "answer": "Рим", "points": 100, "time": 30},
            {"id": "q-bool", "type": "bool", "q": "Земля круглая?", "options": [], "answer": "true", "points": 100, "time": 30},
            {"id": "q-text", "type": "text", "q": "2 + 2 = ?", "options": [], "answer": "4, четыре", "points": 100, "time": 30},
            {"id": "q-matching", "type": "matching", "q": "Соотнесите", "options": [], "answer": "[{\"left\":\"Франция\",\"right\":\"Париж\"},{\"left\":\"Италия\",\"right\":\"Рим\"},{\"left\":\"Германия\",\"right\":\"Берлин\"}]", "points": 100, "time": 30},
            {"id": "q-close", "type": "close", "q": "Столица ___ — город ___.", "options": [], "answer": "[\"Франции\",\"Париж\"]", "points": 100, "time": 30},
            {"id": "q-ordering", "type": "ordering", "q": "Расположите числа по возрастанию", "options": [], "answer": "[\"Один\",\"Два\",\"Три\"]", "points": 100, "time": 30},
        ],
    }


def jeopardy_data():
    return {
        "config": {"title": "Своя игра", "roundTitles": ["Раунд 1"], "timeBase": 30, "timeStep": 15, "timeFinal": 90},
        "rounds": [[
            {"category": "Европа", "questions": [{"points": 100, "q": "Столица Франции?", "a": "Париж"}, {"points": 200, "q": "Столица Италии?", "a": "Рим"}]},
        ]],
        "final": {"category": "География", "q": "Самая длинная река?", "a": "Нил"},
    }


def millionaire_data():
    return {
        "config": {"title": "Миллионер", "timePerQuestion": 30, "moneyScale": "normal", "milestones": "three", "pointsMode": "classic"},
        "questions": [{"q": "Столица Германии?", "money": 500, "options": [{"text": "Берлин", "correct": True}, {"text": "Вена", "correct": False}, {"text": "Прага", "correct": False}, {"text": "Рим", "correct": False}]}],
    }


def pack(*games):
    return {"schema_version": 1, "games": list(games)}


class OfficialContentValidationTests(unittest.TestCase):
    def test_legacy_theme_is_rejected_from_import_data(self):
        game = {"content_id": "legacy-theme-v1", "kind": "quiz", "tags": [], "data": quiz_data()}
        game["data"]["config"]["theme"] = "midnight"

        result = validate_pack(pack(game), TAGS)

        self.assertFalse(result["valid"])
        self.assertTrue(any(error["path"].endswith("config.theme") for error in result["errors"]))

    def test_malformed_schema_and_duplicate_content_id_are_blocking(self):
        result = validate_pack({"schema_version": 2, "games": [{"content_id": "bad", "kind": "quiz", "data": {}}]}, TAGS)
        self.assertFalse(result["valid"])
        duplicate = {"content_id": "geo-europe-v1", "kind": "quiz", "tags": [], "data": quiz_data()}
        result = validate_pack(pack(duplicate, duplicate), TAGS)
        self.assertFalse(result["valid"])
        self.assertTrue(any("повторяется" in error["message"] for error in result["errors"]))

    def test_unknown_tags_and_canonical_normalization(self):
        game = {"content_id": "geo-europe-v1", "kind": "quiz", "tags": ["  ГЕОГРАФИЯ  "], "data": quiz_data()}
        result = validate_pack(pack(game), TAGS)
        self.assertTrue(result["valid"])
        self.assertEqual(result["games"][0]["tags"], ["География"])
        game["tags"] = ["Неизвестный тег"]
        result = validate_pack(pack(game), TAGS)
        self.assertFalse(result["valid"])

    def test_user_identity_fields_are_not_allowed_in_pack(self):
        game = {"content_id": "geo-europe-v1", "kind": "quiz", "owner_id": "production-user", "tags": [], "data": quiz_data()}
        result = validate_pack(pack(game), TAGS)
        self.assertFalse(result["valid"])
        self.assertTrue(any("UUID" in error["message"] for error in result["errors"]))

    def test_quiz_all_question_types_jeopardy_and_millionaire(self):
        result = validate_pack(pack(
            {"content_id": "quiz-all-v1", "kind": "quiz", "tags": ["История"], "data": quiz_data()},
            {"content_id": "jeopardy-v1", "kind": "jeopardy", "tags": ["География"], "data": jeopardy_data()},
            {"content_id": "millionaire-v1", "kind": "millionaire", "tags": ["Логика"], "data": millionaire_data()},
        ), TAGS)
        self.assertTrue(result["valid"], result["errors"])
        self.assertEqual(result["counts"], {"quiz": 1, "jeopardy": 1, "millionaire": 1})

    def test_existing_content_is_warning_and_not_blocking(self):
        game = {"content_id": "quiz-existing-v1", "kind": "quiz", "tags": [], "data": quiz_data()}
        result = validate_pack(pack(game), TAGS, {"quiz-existing-v1": "game-1"})
        self.assertTrue(result["valid"])
        self.assertEqual(result["games"][0]["status"], "already_imported")

    def test_documentation_examples_pass_the_same_validator(self):
        with open(os.path.join(os.path.dirname(__file__), "..", "..", "docs", "OFFICIAL_CONTENT_IMPORT.md"), encoding="utf-8") as handle:
            document = handle.read()
        examples = re.findall(r"```json\n(.*?)\n```", document, flags=re.DOTALL)
        self.assertEqual(len(examples), 4)
        for example in examples[1:]:
            result = validate_pack(json.loads(example), TAGS)
            self.assertTrue(result["valid"], result["errors"])

    def test_published_schema_binds_kind_data_and_quiz_fields(self):
        with open(os.path.join(os.path.dirname(__file__), "..", "..", "content", "library-v1.schema.json"), encoding="utf-8") as handle:
            schema = json.load(handle)
        self.assertEqual(schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
        self.assertEqual(schema["$defs"]["game"]["oneOf"], [
            {"$ref": "#/$defs/quizGame"},
            {"$ref": "#/$defs/jeopardyGame"},
            {"$ref": "#/$defs/millionaireGame"},
        ])
        question_base = schema["$defs"]["quizQuestionBase"]
        self.assertIn("type", question_base["properties"])
        self.assertNotIn("additionalProperties", question_base)
        for question_name in ("choiceQuestion", "boolQuestion", "textQuestion", "matchingQuestion", "closeQuestion", "orderingQuestion"):
            self.assertFalse(schema["$defs"][question_name]["unevaluatedProperties"])


class OfficialContentAdminTests(unittest.TestCase):
    def test_non_admin_is_rejected(self):
        with self.assertRaisesRegex(HTTPException, "Access denied"):
            require_admin({"id": "user", "role": "user"})

    def test_apply_uses_one_rpc_for_the_whole_new_batch(self):
        payload = OfficialContentImportInput(owner_id="author-1", pack=pack(
            {"content_id": "quiz-one-v1", "kind": "quiz", "tags": [], "data": quiz_data()},
            {"content_id": "quiz-two-v1", "kind": "quiz", "tags": [], "data": quiz_data()},
        ))
        preview = {
            "valid": True,
            "errors": [],
            "normalized_games": [
                {"content_id": "quiz-one-v1", "kind": "quiz", "tags": [], "data": quiz_data()},
                {"content_id": "quiz-two-v1", "kind": "quiz", "tags": [], "data": quiz_data()},
            ],
            "games": [
                {"content_id": "quiz-one-v1", "status": "new"},
                {"content_id": "quiz-two-v1", "status": "new"},
            ],
        }
        response = types.SimpleNamespace(data=[
            {"content_id": "quiz-one-v1", "game_id": "game-1", "status": "created"},
            {"content_id": "quiz-two-v1", "game_id": "game-2", "status": "created"},
        ])
        with patch("routes.admin._official_preview", return_value=(preview, {"id": "author-1", "name": "Author"})), patch("routes.admin._db_response", return_value=response), patch("routes.admin.supabase", MagicMock()) as supabase:
            result = apply_official_content_import(payload, {"role": "admin"})
        supabase.rpc.assert_called_once()
        self.assertEqual(result["created"], 2)

    def test_apply_rejects_blocking_errors_before_rpc(self):
        payload = OfficialContentImportInput(owner_id="missing", pack=pack())
        with patch("routes.admin._official_preview", return_value=({"valid": False, "errors": [{"path": "$.owner_id", "message": "Автор не найден."}]}, None)), patch("routes.admin.supabase", MagicMock()) as supabase:
            with self.assertRaisesRegex(HTTPException, "Импорт заблокирован"):
                apply_official_content_import(payload, {"role": "admin"})
        supabase.rpc.assert_not_called()

    def test_repeat_apply_skips_existing_game_without_rpc(self):
        payload = OfficialContentImportInput(owner_id="author-1", pack=pack(
            {"content_id": "quiz-existing-v1", "kind": "quiz", "tags": [], "data": quiz_data()},
        ))
        preview = {
            "valid": True,
            "errors": [],
            "normalized_games": [{"content_id": "quiz-existing-v1", "kind": "quiz", "tags": [], "data": quiz_data()}],
            "games": [{"content_id": "quiz-existing-v1", "game_id": "game-1", "status": "already_imported"}],
        }
        with patch("routes.admin._official_preview", return_value=(preview, {"id": "author-1", "name": "Author"})), patch("routes.admin.supabase", MagicMock()) as supabase:
            result = apply_official_content_import(payload, {"role": "admin"})
        supabase.rpc.assert_not_called()
        self.assertEqual(result["created"], 0)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["games"][0]["status"], "already_imported")

    def test_migration_has_unique_key_and_single_transaction_rpc(self):
        root = os.path.join(os.path.dirname(__file__), "..", "..", "supabase", "migrations")
        migration = ""
        for filename in ("20260822000000_official_content_import.sql", "20260822000001_official_content_import_rpc_fix.sql"):
            with open(os.path.join(root, filename), encoding="utf-8") as handle:
                migration += handle.read().lower()
        self.assertIn("unique index", migration)
        self.assertIn("official_content_id", migration)
        self.assertIn("on conflict (official_content_id) where official_content_id is not null", migration)
        self.assertIn("returns table(content_id text, game_id text, status text)", migration)


if __name__ == "__main__":
    unittest.main()
