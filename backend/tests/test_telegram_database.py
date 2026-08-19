import os
import sys
import types
import unittest
from types import SimpleNamespace

from fastapi import HTTPException


os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests-only-123456")
fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

from routes import telegram_auth


class Query:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    def execute(self):
        if self.error:
            raise self.error
        return self.response


class TelegramDatabaseNormalizationTests(unittest.TestCase):
    def test_missing_rows_are_empty(self):
        self.assertEqual(telegram_auth._db_rows(Query(SimpleNamespace(data=None))), [])

    def test_malformed_rows_are_ignored(self):
        self.assertEqual(
            telegram_auth._db_rows(Query(SimpleNamespace(data=[None, {"id": "u1"}, "bad"]))),
            [{"id": "u1"}],
        )

    def test_database_exception_is_controlled(self):
        with self.assertRaises(HTTPException) as error:
            telegram_auth._db_rows(Query(error=RuntimeError("database unavailable")))
        self.assertEqual(error.exception.status_code, 502)
        self.assertEqual(error.exception.detail, telegram_auth.DB_ERROR_DETAIL)

    def test_none_response_is_controlled(self):
        with self.assertRaises(HTTPException) as error:
            telegram_auth._db_rows(Query())
        self.assertEqual(error.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
