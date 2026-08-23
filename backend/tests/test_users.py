import os
import sys
import types
import unittest
from unittest.mock import patch

from fastapi import HTTPException

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests-only-123456")
fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

from routes.users import _db_rows, get_user_games, get_user_profile


class FakeQuery:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    def execute(self):
        if self.error:
            raise self.error
        return self.response


class ProfileSupabase:
    def __init__(self, user, game):
        self.user = user
        self.game = game
        self.table_name = ""

    def table(self, name):
        self.table_name = name
        return self

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self.table_name == "users":
            return type("Response", (), {"data": [self.user]})()
        return type("Response", (), {"data": [self.game], "count": 1})()


class UsersDatabaseResponseTests(unittest.TestCase):
    def test_empty_data_is_normalized(self):
        response = type("Response", (), {"data": None})()
        self.assertEqual(_db_rows(FakeQuery(response)), [])

    def test_none_response_exception_and_malformed_rows_are_controlled(self):
        for query in (
            FakeQuery(),
            FakeQuery(error=TimeoutError("database timeout")),
            FakeQuery(type("Response", (), {"data": ["not-a-row"]})()),
        ):
            with self.subTest(query=query), self.assertRaisesRegex(HTTPException, "Ошибка базы данных"):
                _db_rows(query)

    def test_public_profile_redacts_answers_but_owner_keeps_content(self):
        user = {
            "id": "owner",
            "name": "Автор",
            "created_at": "2026-08-20T00:00:00Z",
        }
        game = {
            "id": "game-1",
            "kind": "quiz",
            "owner_id": "owner",
            "visibility": "public",
            "show_answers": False,
            "data": {
                "config": {"title": "Public"},
                "questions": [{"id": "q1", "q": "Вопрос", "answer": "SECRET"}],
            },
            "created_at": "2026-08-20T00:00:00Z",
            "updated_at": "2026-08-20T00:00:00Z",
        }

        with patch("routes.users.supabase", ProfileSupabase(user, game)):
            public_profile = get_user_profile("owner", {"id": "other"})
        self.assertIn("Вопрос", str(public_profile["games"][0].data))
        self.assertNotIn("SECRET", str(public_profile["games"][0].data))

        with patch("routes.users.supabase", ProfileSupabase(user, game)):
            owner_profile = get_user_profile("owner", {"id": "owner"})
        self.assertIn("SECRET", str(owner_profile["games"][0].data))

    def test_public_profile_games_endpoint_uses_same_preview_contract(self):
        user = {"id": "owner", "name": "Автор", "created_at": "2026-08-20T00:00:00Z"}
        game = {
            "id": "game-1",
            "kind": "quiz",
            "owner_id": "owner",
            "visibility": "public",
            "show_answers": False,
            "data": {"config": {"title": "Public"}, "questions": [{"q": "Вопрос", "answer": "SECRET"}]},
            "created_at": "2026-08-20T00:00:00Z",
            "updated_at": "2026-08-20T00:00:00Z",
        }
        with patch("routes.users.supabase", ProfileSupabase(user, game)):
            result = get_user_games("owner", limit=20, offset=0, current_user={"id": "other"})
        self.assertIn("Вопрос", str(result["games"][0].data))
        self.assertNotIn("SECRET", str(result["games"][0].data))


if __name__ == "__main__":
    unittest.main()
