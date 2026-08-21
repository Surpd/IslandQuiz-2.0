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

from routes.admin import BulkDeleteInput, _assert_not_self, bulk_delete_games, require_admin
from routes.ai import check_ai_limit
from services.error_logging import parse_error_log, redact_error_details
from services.role_limits import normalize_limits


class AdminWorkspaceTests(unittest.TestCase):
    def test_admin_actions_reject_non_admin_before_database_access(self):
        with self.assertRaisesRegex(HTTPException, "Access denied"):
            require_admin({"id": "user-1", "role": "user"})
        with self.assertRaisesRegex(HTTPException, "Access denied"):
            bulk_delete_games(BulkDeleteInput(ids=["game-1"]), {"id": "user-1", "role": "user"})

    def test_current_admin_protection_blocks_self_ban_or_demotion(self):
        with self.assertRaisesRegex(HTTPException, "текущего администратора"):
            _assert_not_self("admin-1", {"id": "admin-1", "role": "admin"}, "заблокировать")

    def test_error_details_are_redacted_and_structured_rows_remain_readable(self):
        details = redact_error_details("Authorization: Bearer secret-token password=hidden")
        self.assertNotIn("secret-token", details)
        self.assertNotIn("hidden", details)
        parsed = parse_error_log({"id": 1, "created_at": "2026-08-20T10:00:00Z", "path": "/api/ai", "message": '{"message":"provider failed","source":"ai","details":"api_key=abc"}'})
        self.assertEqual(parsed["source"], "ai")
        self.assertNotIn("abc", parsed["details"])

    def test_limits_support_unlimited_and_reject_negative_values(self):
        limits = normalize_limits({
            "user": {"saved_games": 5, "public_games": 2, "ai_generations_per_day": 3, "ai_file_generations_per_day": 1, "ai_upload_bytes": 100},
            "admin": {"saved_games": None, "public_games": None, "ai_generations_per_day": None, "ai_file_generations_per_day": None, "ai_upload_bytes": None},
        })
        self.assertIsNone(limits["admin"]["ai_generations_per_day"])
        with self.assertRaises(ValueError):
            normalize_limits({"user": {"saved_games": -1}, "admin": {}})

    def test_ai_limit_is_enforced_server_side_at_boundary(self):
        user = {"id": "user-1", "role": "user"}
        with patch("routes.ai.get_user_limit", return_value=5), patch("routes.ai.consume_ai_quota", return_value=False) as consume:
            response = check_ai_limit(user)
        self.assertEqual(response.status_code, 429)
        consume.assert_called_once_with("user-1", "ai_request", 5)
        with patch("routes.ai.get_user_limit", return_value=5), patch("routes.ai.consume_ai_quota", return_value=True) as consume:
            self.assertIsNone(check_ai_limit(user))
        consume.assert_called_once_with("user-1", "ai_request", 5)

    def test_unlimited_role_skips_quota_reservation(self):
        with patch("routes.ai.get_user_limit", return_value=None), patch("routes.ai.consume_ai_quota") as consume:
            self.assertIsNone(check_ai_limit({"id": "admin-1", "role": "admin"}))
        consume.assert_not_called()


if __name__ == "__main__":
    unittest.main()
