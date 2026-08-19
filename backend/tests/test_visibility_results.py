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


class RoutedResultSupabase:
    def __init__(self, game, result_rows=None):
        self.game = game
        self.result_rows = [None] if result_rows is None else result_rows
        self.current_table = None

    def table(self, name: str):
        self.current_table = name
        return self

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self.current_table == "games":
            return SimpleNamespace(data=[self.game])
        return SimpleNamespace(data=self.result_rows)


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

    def test_admin_can_view_private_results(self):
        private_game = {"owner_id": "owner", "visibility": "private"}

        with patch.object(results, "supabase", OneResultSupabase([private_game])):
            self.assertTrue(results._can_view_game("game-1", {"id": "admin", "role": "admin"}))

    def test_result_endpoints_enforce_private_matrix_and_tolerate_malformed_rows(self):
        endpoints = (
            (results.get_quiz_results, "quiz_results"),
            (results.get_jeopardy_results, "jeopardy_results"),
            (results.get_millionaire_results, "millionaire_results"),
            (results.get_online_results, "online_quiz_results"),
        )
        private_game = {"owner_id": "owner", "visibility": "private"}

        for endpoint, _table in endpoints:
            with self.subTest(endpoint=endpoint.__name__):
                with patch.object(results, "supabase", RoutedResultSupabase(private_game)):
                    with self.assertRaises(HTTPException) as error:
                        endpoint("game-1", {"id": "other"})
                self.assertEqual(error.exception.status_code, 403)

                with patch.object(results, "supabase", RoutedResultSupabase(private_game)):
                    owner_results = endpoint("game-1", {"id": "owner"})
                self.assertEqual(owner_results, [])

                with patch.object(results, "supabase", RoutedResultSupabase(private_game)):
                    admin_results = endpoint("game-1", {"id": "admin", "role": "admin"})
                self.assertEqual(admin_results, [])

        with patch.object(results, "supabase", RoutedResultSupabase(private_game)):
            with self.assertRaises(HTTPException) as error:
                results.get_jeopardy_result_detail("game-1", "result-1", {"id": "other"})
        self.assertEqual(error.exception.status_code, 403)

        with patch.object(results, "supabase", RoutedResultSupabase(private_game)):
            self.assertIsNone(results.get_jeopardy_result_detail("game-1", "result-1", {"id": "owner"}))

    def test_public_and_link_results_allow_authenticated_non_owner_without_pii_leak(self):
        rows = {
            results.get_quiz_results: {"id": "result-1", "game_id": "game-1", "secret": "must-not-leak"},
            results.get_jeopardy_results: {"id": "result-1", "game_id": "game-1", "teams": [{"secret": "must-not-leak"}]},
            results.get_millionaire_results: {"id": "result-1", "game_id": "game-1", "secret": "must-not-leak"},
            results.get_online_results: {"id": "result-1", "game_id": "game-1", "players": [{"secret": "must-not-leak", "answers": [{"email": "must-not-leak"}]}]},
        }
        endpoints = (
            results.get_quiz_results,
            results.get_jeopardy_results,
            results.get_millionaire_results,
            results.get_online_results,
        )

        for visibility in ("public", "link"):
            with self.subTest(visibility=visibility):
                game = {"owner_id": "owner", "visibility": visibility}
                for endpoint in endpoints:
                    with patch.object(results, "supabase", RoutedResultSupabase(game)):
                        output = endpoint("game-1", {"id": "other"})
                    self.assertEqual(output, [])

                for endpoint in endpoints:
                    with patch.object(results, "supabase", RoutedResultSupabase(game, [rows[endpoint]])):
                        output = endpoint("game-1", {"id": "other"})
                    self.assertEqual(len(output), 1)
                    self.assertNotIn("secret", str(output[0].model_dump()))
                self.assertEqual(len(output), 1)

                self.assertEqual(results._result_items(["malformed", None, {"id": "ok"}]), [{"id": "ok"}])

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

            private_game["kind"] = "jeopardy"
            self.assertEqual(
                results._check_can_submit("game-1", "jeopardy", {"id": "owner"}),
                private_game,
            )

    def test_empty_game_result_is_denied_without_crashing(self):
        with patch.object(results, "supabase", OneResultSupabase([])):
            self.assertFalse(results._can_view_game("missing", {"id": "owner"}))
            with self.assertRaises(HTTPException) as error:
                results._check_can_submit("missing", "quiz", {"id": "owner"})

        self.assertEqual(error.exception.status_code, 404)

    def test_malformed_game_rows_are_denied_without_crashing(self):
        with patch.object(results, "supabase", OneResultSupabase([None])):
            self.assertFalse(results._can_view_game("game-1", {"id": "owner"}))
            with self.assertRaises(HTTPException) as error:
                results._check_can_submit("game-1", "quiz", {"id": "owner"})
        self.assertEqual(error.exception.status_code, 404)

    def test_legacy_online_submit_is_disabled_and_private_jeopardy_requires_user(self):
        private_game = {"owner_id": "owner", "visibility": "private", "kind": "quiz"}
        online_payload = results.OnlineQuizResultInput(
            roomCode="ROOM1",
            durationSec=10,
            players=[],
        )
        jeopardy_payload = results.JeopardyResultInput(
            snapshotToken="snapshot",
            teams=[],
            decisions=[],
        )

        with patch.object(results, "supabase", OneResultSupabase([private_game])):
            with self.assertRaises(HTTPException) as error:
                results.submit_online_result("game-1", online_payload)
            self.assertEqual(error.exception.status_code, 410)

        private_game["kind"] = "jeopardy"
        with patch.object(results, "supabase", OneResultSupabase([private_game])):
            with self.assertRaises(HTTPException) as error:
                results.submit_jeopardy_result("game-1", jeopardy_payload, None)

        self.assertEqual(error.exception.status_code, 403)

    def test_private_jeopardy_submit_passes_current_user_to_access_check(self):
        payload = results.JeopardyResultInput(snapshotToken="snapshot", teams=[], decisions=[])
        owner = {"id": "owner"}

        with patch.object(results, "_check_can_submit", return_value={"kind": "jeopardy"}) as check:
            with patch.object(results, "verify_snapshot_token", side_effect=ValueError("invalid snapshot")):
                with self.assertRaises(HTTPException) as error:
                    results.submit_jeopardy_result("game-1", payload, owner)

        self.assertEqual(error.exception.status_code, 400)
        check.assert_called_once_with("game-1", "jeopardy", owner)

    def test_played_games_rejects_client_user_id_tampering(self):
        with self.assertRaises(HTTPException) as error:
            results.get_played_game_ids("other", {"id": "owner"})

        self.assertEqual(error.exception.status_code, 403)

    def test_legacy_online_result_submit_is_disabled(self):
        payload = results.OnlineQuizResultInput(roomCode="ROOM1", durationSec=10, players=[])
        with self.assertRaises(HTTPException) as error:
            results.submit_online_result("game-1", payload)
        self.assertEqual(error.exception.status_code, 410)


if __name__ == "__main__":
    unittest.main()
