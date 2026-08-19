import os
import sys
import types
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
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

    def table(self, _name: str):
        return self

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows)


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
        token = telegram_auth.create_telegram_login_token("user-1")

        claims = telegram_auth.verify_telegram_login_token(token)

        self.assertEqual(claims["user_id"], "user-1")
        self.assertTrue(claims["nonce"])

    def test_tampered_token_is_rejected(self):
        token = telegram_auth.create_telegram_login_token("user-1")
        tampered = f"{token[:-1]}{'A' if token[-1] != 'A' else 'B'}"

        with self.assertRaises(HTTPException) as error:
            telegram_auth.verify_telegram_login_token(tampered)

        self.assertEqual(error.exception.status_code, 403)

    def test_expired_token_is_rejected(self):
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

    def test_current_stateless_token_is_reusable_until_c1(self):
        token = telegram_auth.create_telegram_login_token("user-1")

        first = telegram_auth.verify_telegram_login_token(token)
        second = telegram_auth.verify_telegram_login_token(token)

        self.assertEqual(first["user_id"], second["user_id"])
        self.assertEqual(first["nonce"], second["nonce"])

    def test_bot_login_accepts_valid_signed_token_for_existing_user(self):
        user = telegram_user()
        input = telegram_auth.TelegramBotLoginInput(
            token=telegram_auth.create_telegram_login_token(),
            telegram_id=42,
        )

        with (
            patch.object(telegram_auth, "supabase", OneResultSupabase([user])),
            patch.object(telegram_auth, "create_access_token", return_value="access-token"),
        ):
            response = telegram_auth.telegram_bot_login(input)

        self.assertTrue(response["ok"])
        self.assertEqual(response["token"], "access-token")
        self.assertEqual(response["user"]["id"], user["id"])

    def test_complete_currently_accepts_same_valid_token_twice_until_c1(self):
        user = telegram_user()
        token = telegram_auth.create_telegram_login_token(user["id"])

        with (
            patch.object(telegram_auth, "supabase", OneResultSupabase([user])),
            patch.object(telegram_auth, "create_access_token", return_value="access-token"),
        ):
            first = telegram_auth.telegram_complete(token)
            second = telegram_auth.telegram_complete(token)

        self.assertEqual(first["token"], "access-token")
        self.assertEqual(second["token"], "access-token")
        self.assertEqual(first["user"]["id"], user["id"])


if __name__ == "__main__":
    unittest.main()
