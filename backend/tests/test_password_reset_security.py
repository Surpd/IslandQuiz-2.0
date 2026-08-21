import os
import sys
import types
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Lock
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException


os.environ["JWT_SECRET"] = "test-jwt-secret-for-unit-tests-only-123456"
fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

from routes import auth as auth_route


class ResetSupabase:
    def __init__(self, reset_row):
        self.users = [{"id": "user-1", "email": "alice@example.com"}]
        self.reset_row = dict(reset_row)
        self.lock = Lock()

    def table(self, name):
        return ResetQuery(self, name)


class ResetQuery:
    def __init__(self, database, table):
        self.database = database
        self.table_name = table
        self.operation = None
        self.payload = None
        self.filters = []

    def select(self, *_args, **_kwargs):
        if self.operation not in {"update", "delete"}:
            self.operation = "select"
        return self

    def eq(self, field, value):
        self.filters.append(("eq", field, value))
        return self

    def gt(self, field, value):
        self.filters.append(("gt", field, value))
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def execute(self):
        database = self.database
        with database.lock:
            if self.table_name == "password_resets" and self.operation == "select":
                expected = next((value for kind, field, value in self.filters if field == "token_hash"), None)
                if database.reset_row and database.reset_row.get("token_hash") == expected:
                    return SimpleNamespace(data=[dict(database.reset_row)])
                return SimpleNamespace(data=[])

            if self.table_name == "password_resets" and self.operation == "delete":
                expected = next((value for kind, field, value in self.filters if field == "token_hash"), None)
                valid_until = next((value for kind, field, value in self.filters if kind == "gt" and field == "expires_at"), None)
                current = database.reset_row
                if not current:
                    return SimpleNamespace(data=[])
                if current.get("token_hash") != expected:
                    return SimpleNamespace(data=[])
                if valid_until is not None and current["expires_at"] <= valid_until:
                    return SimpleNamespace(data=[])
                database.reset_row = None
                return SimpleNamespace(data=[dict(current)])

            if self.table_name == "users" and self.operation == "update":
                email = next((value for kind, field, value in self.filters if field == "email"), None)
                for user in database.users:
                    if user["email"] == email:
                        user.update(self.payload)
                        return SimpleNamespace(data=[{"id": user["id"]}])
                return SimpleNamespace(data=[])

            return SimpleNamespace(data=[])


def reset_handler():
    return getattr(auth_route.reset_password, "__wrapped__", auth_route.reset_password)


class PasswordResetSecurityTests(unittest.TestCase):
    def make_reset(self, expires_at):
        token = "reset-token-for-test"
        return token, ResetSupabase({
            "email": "alice@example.com",
            "token_hash": auth_route.hash_password_reset_token(token),
            "expires_at": expires_at,
        })

    def call_reset(self, token, password):
        return reset_handler()(
            SimpleNamespace(),
            token=token,
            password=password,
        )

    def test_valid_reset_is_single_use(self):
        token, database = self.make_reset((datetime.now(timezone.utc) + timedelta(hours=1)).isoformat())
        with patch.object(auth_route, "supabase", database):
            first = self.call_reset(token, "new-password")
            second = self.call_reset(token, "another-password")

        self.assertEqual(first, {"ok": True})
        self.assertEqual(second, {"error": "Недействительная ссылка"})
        self.assertTrue(database.users[0].get("password_hash"))

    def test_expired_reset_is_rejected(self):
        token, database = self.make_reset((datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat())
        with patch.object(auth_route, "supabase", database):
            response = self.call_reset(token, "new-password")

        self.assertEqual(response, {"error": "Срок действия ссылки истёк"})

    def test_concurrent_reset_reuse_has_one_success(self):
        token, database = self.make_reset((datetime.now(timezone.utc) + timedelta(hours=1)).isoformat())
        with patch.object(auth_route, "supabase", database):
            with ThreadPoolExecutor(max_workers=2) as executor:
                results = list(executor.map(
                    lambda password: self.call_reset(token, password),
                    ["new-password-a", "new-password-b"],
                ))

        self.assertEqual(sum(result == {"ok": True} for result in results), 1)
        self.assertEqual(sum(result == {"error": "Недействительная ссылка"} for result in results), 1)


if __name__ == "__main__":
    unittest.main()
