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

from routes import games, results


class OneResultSupabase:
    def __init__(self, rows: list[dict]):
        self.rows = rows

    def table(self, _name: str):
        return self

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows)


class VisibilityAndResultsTests(unittest.TestCase):
    def test_game_visibility_follows_d6_for_owner_and_anonymous(self):
        owner = {"id": "owner"}
        non_owner = {"id": "other"}
        private = {"owner_id": "owner", "visibility": "private"}
        link = {"owner_id": "owner", "visibility": "link"}
        public = {"owner_id": "owner", "visibility": "public"}

        self.assertTrue(games._can_view(private, owner))
        self.assertFalse(games._can_view(private, non_owner))
        self.assertFalse(games._can_view(private, None))
        self.assertTrue(games._can_view(link, None))
        self.assertTrue(games._can_view(public, None))

    def test_result_view_requires_authenticated_viewer(self):
        public_game = {"owner_id": "owner", "visibility": "public"}

        with patch.object(results, "supabase", OneResultSupabase([public_game])):
            self.assertFalse(results._can_view_game("game-1", None))
            self.assertTrue(results._can_view_game("game-1", {"id": "other"}))

    def test_private_result_view_allows_only_owner(self):
        private_game = {"owner_id": "owner", "visibility": "private"}

        with patch.object(results, "supabase", OneResultSupabase([private_game])):
            self.assertTrue(results._can_view_game("game-1", {"id": "owner"}))
            self.assertFalse(results._can_view_game("game-1", {"id": "other"}))
            self.assertFalse(results._can_view_game("game-1", {"id": "admin"}))

    def test_result_submit_respects_private_access_and_kind(self):
        private_game = {"owner_id": "owner", "visibility": "private", "kind": "quiz"}

        with patch.object(results, "supabase", OneResultSupabase([private_game])):
            self.assertEqual(
                results._check_can_submit("game-1", "quiz", {"id": "owner"}),
                private_game,
            )
            with self.assertRaises(HTTPException) as error:
                results._check_can_submit("game-1", "quiz", None)
            self.assertEqual(error.exception.status_code, 403)

            with self.assertRaises(HTTPException) as error:
                results._check_can_submit("game-1", "millionaire", {"id": "owner"})
            self.assertEqual(error.exception.status_code, 400)

    def test_empty_game_result_is_denied_without_crashing(self):
        with patch.object(results, "supabase", OneResultSupabase([])):
            self.assertFalse(results._can_view_game("missing", {"id": "owner"}))
            with self.assertRaises(HTTPException) as error:
                results._check_can_submit("missing", "quiz", {"id": "owner"})

        self.assertEqual(error.exception.status_code, 404)

    def test_private_online_and_jeopardy_submit_lack_owner_binding_until_h9(self):
        private_game = {"owner_id": "owner", "visibility": "private", "kind": "quiz"}
        online_payload = results.OnlineQuizResultInput(
            roomCode="ROOM1",
            durationSec=10,
            players=[],
        )
        jeopardy_payload = results.JeopardyResultInput(
            gameId="game-1",
            hasFinal=False,
            teams=[],
        )

        with patch.object(results, "supabase", OneResultSupabase([private_game])):
            with self.assertRaises(HTTPException) as error:
                results.submit_online_result("game-1", online_payload)
            self.assertEqual(error.exception.status_code, 403)

        private_game["kind"] = "jeopardy"
        with patch.object(results, "supabase", OneResultSupabase([private_game])):
            with self.assertRaises(HTTPException) as error:
                results.submit_jeopardy_result("game-1", jeopardy_payload)

        self.assertEqual(error.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
