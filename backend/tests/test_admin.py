import os
import sys
import types
import unittest

from fastapi import HTTPException

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests-only-123456")
fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

from routes.admin import _db_count, _db_rows


class FakeQuery:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    def execute(self):
        if self.error:
            raise self.error
        return self.response


class AdminDatabaseResponseTests(unittest.TestCase):
    def test_empty_and_none_rows_are_normalized(self):
        self.assertEqual(_db_rows(FakeQuery(type("Response", (), {"data": None})())), [])

    def test_database_error_and_malformed_rows_are_controlled(self):
        with self.assertRaisesRegex(HTTPException, "Ошибка базы данных"):
            _db_rows(FakeQuery(error=RuntimeError("duplicate constraint")))
        malformed = type("Response", (), {"data": {"id": "user-1"}})()
        with self.assertRaisesRegex(HTTPException, "Ошибка базы данных"):
            _db_rows(FakeQuery(malformed))

    def test_count_uses_exact_count_or_row_count_fallback(self):
        counted = type("Response", (), {"data": [], "count": 12})()
        fallback = type("Response", (), {"data": [{"id": "one"}], "count": None})()
        self.assertEqual(_db_count(FakeQuery(counted)), 12)
        self.assertEqual(_db_count(FakeQuery(fallback)), 1)


if __name__ == "__main__":
    unittest.main()
