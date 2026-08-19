import os
import sys
import types
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import jwt
from fastapi import HTTPException


os.environ["JWT_SECRET"] = "test-jwt-secret-for-unit-tests-only-123456"
fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

from routes import auth as auth_route


def user_lookup(rows: list[dict]) -> MagicMock:
    supabase = MagicMock()
    supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        SimpleNamespace(data=rows)
    )
    return supabase


class AuthBasicsTests(unittest.TestCase):
    def test_valid_token_resolves_existing_user(self):
        token = auth_route.create_access_token("user-1")
        user = {"id": "user-1", "name": "Alice", "banned": False}

        with patch.object(auth_route, "supabase", user_lookup([user])):
            self.assertEqual(auth_route.get_current_user(token), user)

    def test_missing_token_returns_401(self):
        with self.assertRaises(HTTPException) as error:
            auth_route.get_current_user(None)

        self.assertEqual(error.exception.status_code, 401)

    def test_invalid_token_returns_401(self):
        with self.assertRaises(HTTPException) as error:
            auth_route.get_current_user("invalid-token")

        self.assertEqual(error.exception.status_code, 401)

    def test_expired_token_returns_401(self):
        token = jwt.encode(
            {
                "sub": "user-1",
                "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
            },
            auth_route.SECRET_KEY,
            algorithm=auth_route.ALGORITHM,
        )

        with self.assertRaises(HTTPException) as error:
            auth_route.get_current_user(token)

        self.assertEqual(error.exception.status_code, 401)

    def test_deleted_and_banned_users_are_rejected(self):
        token = auth_route.create_access_token("user-1")

        with patch.object(auth_route, "supabase", user_lookup([])):
            with self.assertRaises(HTTPException) as error:
                auth_route.get_current_user(token)
            self.assertEqual(error.exception.status_code, 401)

        with patch.object(
            auth_route,
            "supabase",
            user_lookup([{"id": "user-1", "banned": True}]),
        ):
            with self.assertRaises(HTTPException) as error:
                auth_route.get_current_user(token)
            self.assertEqual(error.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
