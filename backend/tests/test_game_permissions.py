import os
import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

os.environ["JWT_SECRET"] = "test-jwt-secret-for-unit-tests-only-123456"
fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

from routes import games


class ForkSupabase:
    def __init__(self, game):
        self.game = game
        self.inserted = None
        self.operation = "select"

    def table(self, _name):
        return self

    def select(self, *_args, **_kwargs):
        self.operation = "select"
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.inserted = payload
        return self

    def execute(self):
        return SimpleNamespace(data=[self.game] if self.operation == "select" else [self.inserted])


class ReadSupabase:
    def __init__(self, game):
        self.game = game
        self.table_name = ""

    def table(self, name):
        self.table_name = name
        return self

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def execute(self):
        return SimpleNamespace(data=[self.game] if self.table_name == "games" else [])


class GamePermissionTests(unittest.TestCase):
    def test_copy_permission_is_enforced_server_side_and_legacy_defaults_allow(self):
        blocked = {
            "id": "game-1",
            "kind": "quiz",
            "owner_id": "owner",
            "owner_name": "Автор",
            "visibility": "public",
            "data": {"config": {"allowCopy": False}, "questions": [{"q": "secret"}]},
        }
        with patch.object(games, "supabase", ForkSupabase(blocked)):
            with self.assertRaises(HTTPException) as error:
                games.fork_game("game-1", {"id": "other", "name": "Друг"})
        self.assertEqual(error.exception.status_code, 403)

        legacy = {**blocked, "data": {"config": {}, "questions": []}}
        db = ForkSupabase(legacy)
        with patch.object(games, "supabase", db):
            result = games.fork_game("game-1", {"id": "other", "name": "Друг"})
        self.assertIn("id", result)
        self.assertEqual(db.inserted["forked_from"], "game-1")

    def test_owner_and_admin_keep_copy_access_when_disabled(self):
        game = {
            "id": "game-1",
            "kind": "quiz",
            "owner_id": "owner",
            "owner_name": "Автор",
            "visibility": "public",
            "data": {"config": {"allowCopy": False}, "questions": []},
        }
        for user in ({"id": "owner", "name": "Автор"}, {"id": "admin", "name": "Админ", "role": "admin"}):
            with self.subTest(user=user):
                with patch.object(games, "supabase", ForkSupabase(game)):
                    self.assertIn("id", games.fork_game("game-1", user))

    def test_preview_redaction_keeps_metadata_but_removes_playable_content(self):
        game = {
            "kind": "quiz",
            "data": {
                "config": {"title": "Закрытый preview", "allowPreview": False},
                "questions": [{"id": "q1", "type": "choice", "q": "Секрет", "options": ["A"], "answer": "A"}],
            },
        }
        data = games._redact_preview_data(game)
        self.assertEqual(data["config"]["title"], "Закрытый preview")
        self.assertEqual(data["questions"], [{"id": "q1", "type": "choice"}])
        self.assertNotIn("Секрет", str(data))

    def test_regular_game_get_is_redacted_but_play_endpoint_returns_content(self):
        game = {
            "id": "game-1",
            "kind": "quiz",
            "owner_id": "owner",
            "owner_name": "Автор",
            "visibility": "public",
            "data": {"config": {"title": "Игра", "allowPreview": False}, "questions": [{"id": "q1", "type": "text", "q": "Секрет", "answer": "Ответ"}]},
            "created_at": "2026-08-20T00:00:00Z",
            "updated_at": "2026-08-20T00:00:00Z",
        }
        with patch.object(games, "supabase", ReadSupabase(game)):
            redacted = games.get_game("game-1", {"id": "other"})
        self.assertNotIn("Секрет", str(redacted.data))
        self.assertNotIn("Ответ", str(redacted.data))

        with patch.object(games, "supabase", ReadSupabase(game)):
            playable = games.get_game_for_play("game-1", {"id": "other"})
        self.assertEqual(playable.data["questions"][0]["q"], "Секрет")


if __name__ == "__main__":
    unittest.main()
