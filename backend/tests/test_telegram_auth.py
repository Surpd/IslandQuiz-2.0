import os
import sys
import types
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from threading import Lock
from unittest.mock import patch

from fastapi import HTTPException


os.environ["JWT_SECRET"] = "test-jwt-secret-for-unit-tests-only-123456"
fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

from routes import telegram_auth


class OneResultSupabase:
    def __init__(self, rows: list[dict]):
        self.rows = rows
        self.nonces = {}
        self._lock = Lock()

    def table(self, name: str):
        return _TokenQuery(self, name)


class _TokenQuery:
    def __init__(self, database: OneResultSupabase, table: str):
        self.database = database
        self.table_name = table
        self.operation = None
        self.payload = None
        self.filters = []

    def select(self, *_args, **_kwargs):
        if self.operation not in {"update", "delete"}:
            self.operation = "select"
        return self

    def eq(self, *_args, **_kwargs):
        self.filters.append(("eq", _args[0], _args[1]))
        return self

    def is_(self, *_args, **_kwargs):
        self.filters.append(("is", _args[0], _args[1]))
        return self

    def gt(self, *_args, **_kwargs):
        self.filters.append(("gt", _args[0], _args[1]))
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
        with database._lock:
            if self.operation == "insert" and self.table_name == "telegram_login_nonces":
                database.nonces[self.payload["nonce_hash"]] = dict(self.payload)
                return SimpleNamespace(data=[self.payload])

            if self.operation == "update" and self.table_name == "telegram_login_nonces":
                nonce_hash = next((value for kind, field, value in self.filters if kind == "eq" and field == "nonce_hash"), None)
                row = database.nonces.get(nonce_hash)
                if row and row.get("consumed_at") is None:
                    row.update(self.payload)
                    return SimpleNamespace(data=[dict(row)])
                return SimpleNamespace(data=[])

            if self.operation == "select" and self.table_name == "users":
                return SimpleNamespace(data=database.rows)

            return SimpleNamespace(data=[])


def telegram_user() -> dict:
    return {
        "id": "user-1",
        "email": None,
        "telegram_id": "42",
        "name": "Alice",
        "created_at": datetime.now(timezone.utc),
    }


class TelegramLoginTokenTests(unittest.TestCase):
    def test_valid_token_returns_signed_claims(self):
        with patch.object(telegram_auth, "supabase", OneResultSupabase([])):
            token = telegram_auth.create_telegram_login_token("user-1")

        claims = telegram_auth.verify_telegram_login_token(token)

        self.assertEqual(claims["user_id"], "user-1")
        self.assertTrue(claims["nonce"])

    def test_tampered_token_is_rejected(self):
        with patch.object(telegram_auth, "supabase", OneResultSupabase([])):
            token = telegram_auth.create_telegram_login_token("user-1")
        tampered = f"{token[:-1]}{'A' if token[-1] != 'A' else 'B'}"

        with self.assertRaises(HTTPException) as error:
            telegram_auth.verify_telegram_login_token(tampered)

        self.assertEqual(error.exception.status_code, 403)

    def test_expired_token_is_rejected(self):
        with patch.object(telegram_auth, "supabase", OneResultSupabase([])):
            token = telegram_auth.create_telegram_login_token("user-1")
        future = datetime.now(timezone.utc) + timedelta(
            minutes=telegram_auth.LOGIN_TOKEN_EXPIRE_MINUTES + 1
        )

        class FutureDatetime:
            @classmethod
            def now(cls, _timezone):
                return future

        with patch.object(telegram_auth, "datetime", FutureDatetime):
            with self.assertRaises(HTTPException) as error:
                telegram_auth.verify_telegram_login_token(token)

        self.assertEqual(error.exception.status_code, 403)

    def test_valid_token_is_consumed_once(self):
        database = OneResultSupabase([])
        with patch.object(telegram_auth, "supabase", database):
            token = telegram_auth.create_telegram_login_token("user-1", "complete")
            claims = telegram_auth.verify_telegram_login_token(token)
            telegram_auth.consume_telegram_login_token(claims, "complete")

            with self.assertRaises(HTTPException) as error:
                telegram_auth.consume_telegram_login_token(claims, "complete")

        self.assertEqual(error.exception.status_code, 403)

    def test_concurrent_double_use_has_one_success(self):
        database = OneResultSupabase([])
        with patch.object(telegram_auth, "supabase", database):
            token = telegram_auth.create_telegram_login_token("user-1", "complete")
            claims = telegram_auth.verify_telegram_login_token(token)

            def consume():
                try:
                    telegram_auth.consume_telegram_login_token(claims, "complete")
                    return True
                except HTTPException:
                    return False

            with ThreadPoolExecutor(max_workers=2) as executor:
                results = list(executor.map(lambda _: consume(), range(2)))

        self.assertEqual(results.count(True), 1)
        self.assertEqual(results.count(False), 1)

    def test_bot_login_accepts_valid_signed_token_for_existing_user(self):
        user = telegram_user()
        database = OneResultSupabase([user])
        with patch.object(telegram_auth, "supabase", database):
            token = telegram_auth.create_telegram_login_token(token_type="bot_login")
        input = telegram_auth.TelegramBotLoginInput(
            token=token,
            telegram_id=42,
        )

        with (
            patch.object(telegram_auth, "supabase", database),
            patch.object(telegram_auth, "create_access_token", return_value="access-token"),
        ):
            response = telegram_auth.telegram_bot_login(input)

        self.assertTrue(response["ok"])
        self.assertEqual(response["token"], "access-token")
        self.assertEqual(response["user"]["id"], user["id"])

    def test_complete_rejects_replay(self):
        user = telegram_user()
        database = OneResultSupabase([user])

        with (
            patch.object(telegram_auth, "supabase", database),
            patch.object(telegram_auth, "create_access_token", return_value="access-token"),
        ):
            token = telegram_auth.create_telegram_login_token(user["id"], "complete")
            first = telegram_auth.telegram_complete(token)
            with self.assertRaises(HTTPException) as error:
                telegram_auth.telegram_complete(token)

        self.assertEqual(first["token"], "access-token")
        self.assertEqual(first["user"]["id"], user["id"])
        self.assertEqual(error.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
