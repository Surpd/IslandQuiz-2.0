import os
import sys
import types
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests-only-123456")
fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

from routes import admin as admin_route
from routes.admin import _ai_metrics, _build_dashboard


class AdminAnalyticsTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 8, 21, 12, 0, tzinfo=timezone.utc)
        self.users = [
            {"id": "u1", "created_at": "2026-08-20T12:00:00+00:00"},
            {"id": "u2", "created_at": "2026-08-10T12:00:00+00:00"},
            {"id": "u3", "created_at": "2026-05-01T12:00:00+00:00"},
        ]
        self.games = [
            {"id": "gq", "kind": "quiz", "visibility": "public", "owner_id": "u1", "created_at": "2026-08-20T13:00:00+00:00", "data": {"config": {"title": "Quiz"}}},
            {"id": "gj", "kind": "jeopardy", "visibility": "link", "owner_id": "u2", "created_at": "2026-08-19T13:00:00+00:00", "data": {"config": {"title": "Jeopardy"}}},
            {"id": "gm", "kind": "millionaire", "visibility": "private", "owner_id": "u1", "created_at": "2026-08-18T13:00:00+00:00", "data": {"config": {"title": "Millionaire"}}},
            {"id": "gold", "kind": "quiz", "visibility": "public", "owner_id": "u3", "created_at": "2026-05-01T13:00:00+00:00", "data": {"config": {"title": "Old"}}},
        ]
        self.results = {
            "quiz_results": [{"game_id": "gq", "user_id": "u1", "finished_at": "2026-08-20T14:00:00+00:00"}],
            "online_quiz_results": [{"game_id": "gq", "played_at": "2026-08-19T14:00:00+00:00"}],
            "jeopardy_results": [{"game_id": "gj", "played_at": "2026-08-18T14:00:00+00:00"}],
            "millionaire_results": [{"game_id": "gm", "user_id": "u1", "finished_at": "2026-08-17T14:00:00+00:00"}],
        }
        self.usage = [
            {"id": 1, "user_id": "u1", "request_type": "ai_request", "created_at": "2026-08-20T15:00:00+00:00"},
            {"id": 2, "user_id": "u2", "request_type": "ai_request", "created_at": "2026-08-18T15:00:00+00:00"},
        ]
        self.logs = [
            {"id": 1, "user_id": "u1", "topic": "generate_quiz", "model": "model-a", "prompt_tokens": 10, "completion_tokens": 5, "success": True, "error": None, "created_at": "2026-08-20T15:00:00+00:00"},
            {"id": 2, "user_id": "u2", "topic": "generate_question", "model": "model-a", "prompt_tokens": None, "completion_tokens": None, "success": False, "error": "provider error", "created_at": "2026-08-18T15:00:00+00:00"},
        ]

    def test_all_result_sources_feed_kpi_and_chart_with_same_period(self):
        dashboard = _build_dashboard("7d", self.users, self.games, self.results, self.usage, self.logs, [], now=self.now)

        self.assertEqual(dashboard["kpis"]["plays"], 4)
        self.assertEqual(sum(row["plays"] for row in dashboard["activity"]), 4)
        self.assertEqual(dashboard["kpis"]["online_sessions"], 1)
        self.assertEqual(dashboard["kpis"]["games"], 3)
        self.assertEqual(dashboard["distribution"]["types"], {"quiz": 1, "jeopardy": 1, "millionaire": 1})
        self.assertEqual(dashboard["distribution"]["visibility"], {"public": 1, "link": 1, "private": 1})
        self.assertEqual(dashboard["kpis"]["active_users"], 2)

    def test_periods_filter_games_results_and_ai_consistently(self):
        self.results["quiz_results"].append({"game_id": "gold", "user_id": "u3", "finished_at": "2026-05-01T14:00:00+00:00"})
        self.usage.append({"id": 3, "user_id": "u3", "request_type": "ai_request", "created_at": "2026-05-01T15:00:00+00:00"})
        self.logs.append({"id": 3, "user_id": "u3", "topic": "generate_quiz", "model": "model-old", "prompt_tokens": 2, "completion_tokens": 3, "success": True, "error": None, "created_at": "2026-05-01T15:00:00+00:00"})

        recent = _build_dashboard("7d", self.users, self.games, self.results, self.usage, self.logs, [], now=self.now)
        all_time = _build_dashboard("all", self.users, self.games, self.results, self.usage, self.logs, [], now=self.now)

        self.assertEqual(recent["kpis"]["plays"], 4)
        self.assertEqual(recent["kpis"]["ai_requests"], 2)
        self.assertEqual(all_time["kpis"]["plays"], 5)
        self.assertEqual(all_time["kpis"]["games"], 4)
        self.assertEqual(all_time["kpis"]["ai_requests"], 3)

    def test_metrics_change_when_new_game_result_and_ai_request_are_added(self):
        before = _build_dashboard("7d", self.users, self.games, self.results, self.usage, self.logs, [], now=self.now)
        self.games.append({"id": "new", "kind": "quiz", "visibility": "private", "owner_id": "u2", "created_at": "2026-08-21T11:00:00+00:00", "data": {"config": {"title": "New"}}})
        self.results["quiz_results"].append({"game_id": "new", "user_id": "u2", "finished_at": "2026-08-21T11:30:00+00:00"})
        self.usage.append({"id": 3, "user_id": "u2", "request_type": "ai_request", "created_at": "2026-08-21T11:45:00+00:00"})
        after = _build_dashboard("7d", self.users, self.games, self.results, self.usage, self.logs, [], now=self.now)

        self.assertEqual(after["kpis"]["games"], before["kpis"]["games"] + 1)
        self.assertEqual(after["kpis"]["plays"], before["kpis"]["plays"] + 1)
        self.assertEqual(sum(row["plays"] for row in after["activity"]), after["kpis"]["plays"])
        self.assertEqual(after["kpis"]["ai_requests"], before["kpis"]["ai_requests"] + 1)

    def test_ai_success_error_tokens_and_request_types_are_reported(self):
        metrics = _ai_metrics(self.usage, self.logs, self.now - timedelta(days=7))

        self.assertEqual(metrics["requests"], 2)
        self.assertEqual(metrics["errors"], 1)
        self.assertEqual(metrics["successful"], 1)
        self.assertEqual(metrics["total_tokens"], 15)
        self.assertEqual(metrics["by_type"], {"generate_quiz": 1, "generate_question": 1})

    def test_dashboard_route_reads_all_controlled_fixture_tables(self):
        fixtures = {
            "users": self.users,
            "games": self.games,
            "ai_usage": self.usage,
            "ai_logs": self.logs,
            "error_logs": [],
            **self.results,
        }

        class Query:
            def __init__(self, table):
                self.table = table

            def select(self, *args, **kwargs):
                return self

            def execute(self):
                return types.SimpleNamespace(data=fixtures[self.table], count=None)

        class Database:
            def table(self, name):
                return Query(name)

        with patch.object(admin_route, "supabase", Database()):
            dashboard = admin_route.get_admin_dashboard("30d", {"id": "admin", "role": "admin"})

        self.assertEqual(dashboard["kpis"]["plays"], 4)
        self.assertEqual(dashboard["kpis"]["online_sessions"], 1)
        self.assertEqual(dashboard["kpis"]["ai_requests"], 2)


if __name__ == "__main__":
    unittest.main()
