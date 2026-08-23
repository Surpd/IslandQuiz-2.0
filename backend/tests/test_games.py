import unittest
import sys
import types
import os
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests-only-123456")
fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

from routes.games import SaveGameInput, _db_rows, _without_persisted_theme, save_game


class FakeQuery:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    def execute(self):
        if self.error:
            raise self.error
        return self.response


class GamesDatabaseResponseTests(unittest.TestCase):
    def test_new_game_save_strips_theme_before_insert(self):
        game_input = SaveGameInput(
            kind="quiz",
            data={"config": {"title": "Quiz", "theme": "midnight"}, "questions": []},
        )
        database = MagicMock()

        with patch("routes.games.supabase", database), patch("routes.games._db_rows", side_effect=[[], [{"id": "game-1"}]]), patch("routes.games._enforce_game_limits"):
            save_game(game_input, {"id": "owner-1", "name": "Owner"})

        inserted = database.table.return_value.insert.call_args.args[0]
        self.assertNotIn("theme", inserted["data"]["config"])

    def test_persisted_theme_is_removed_without_mutating_other_game_data(self):
        data = {
            "config": {"title": "Quiz", "theme": "midnight", "defaultTime": 30},
            "questions": [{"id": "q1", "q": "Question"}],
        }

        cleaned = _without_persisted_theme(data)

        self.assertNotIn("theme", cleaned["config"])
        self.assertEqual(cleaned["config"]["title"], "Quiz")
        self.assertEqual(cleaned["questions"], data["questions"])
        self.assertEqual(data["config"]["theme"], "midnight")

    def test_empty_data_is_normalized_to_empty_rows(self):
        self.assertEqual(_db_rows(FakeQuery(type("Response", (), {"data": None})())), [])

    def test_none_response_is_a_stable_database_error(self):
        with self.assertRaisesRegex(HTTPException, "Ошибка базы данных"):
            _db_rows(FakeQuery())

    def test_database_exception_is_a_stable_database_error(self):
        with self.assertRaisesRegex(HTTPException, "Ошибка базы данных"):
            _db_rows(FakeQuery(error=RuntimeError("constraint or timeout")))

    def test_malformed_rows_are_a_stable_database_error(self):
        response = type("Response", (), {"data": {"id": "game-1"}})()
        with self.assertRaisesRegex(HTTPException, "Ошибка базы данных"):
            _db_rows(FakeQuery(response))


if __name__ == "__main__":
    unittest.main()
