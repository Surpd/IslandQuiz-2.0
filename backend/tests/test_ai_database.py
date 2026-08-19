import os
import sys
import types
import unittest

from fastapi import HTTPException

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests-only-123456")
fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

from routes.ai import _db_count, _db_insert


class FakeQuery:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    def execute(self):
        if self.error:
            raise self.error
        return self.response


class AIDatabaseResponseTests(unittest.TestCase):
    def test_count_handles_exact_count_and_empty_data(self):
        counted = type("Response", (), {"count": 4, "data": []})()
        empty = type("Response", (), {"count": None, "data": None})()
        self.assertEqual(_db_count(FakeQuery(counted)), 4)
        self.assertEqual(_db_count(FakeQuery(empty)), 0)

    def test_count_and_insert_database_errors_are_controlled(self):
        for operation in (_db_count, _db_insert):
            with self.subTest(operation=operation), self.assertRaisesRegex(HTTPException, "Ошибка базы данных"):
                operation(FakeQuery(error=RuntimeError("database unavailable")))

    def test_malformed_count_rows_are_controlled(self):
        response = type("Response", (), {"count": None, "data": ["not-a-row"]})()
        with self.assertRaisesRegex(HTTPException, "Ошибка базы данных"):
            _db_count(FakeQuery(response))


if __name__ == "__main__":
    unittest.main()
