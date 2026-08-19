import unittest
import sys
import types
import os

from fastapi import HTTPException

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests-only-123456")
fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

from routes.games import _db_rows


class FakeQuery:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    def execute(self):
        if self.error:
            raise self.error
        return self.response


class GamesDatabaseResponseTests(unittest.TestCase):
    def test_empty_data_is_normalized_to_empty_rows(self):
        self.assertEqual(_db_rows(FakeQuery(type("Response", (), {"data": None})())), [])

    def test_none_response_is_a_stable_database_error(self):
        with self.assertRaisesRegex(HTTPException, "Ошибка базы данных"):
            _db_rows(FakeQuery())

    def test_database_exception_is_a_stable_database_error(self):
        with self.assertRaisesRegex(HTTPException, "Ошибка базы данных"):
            _db_rows(FakeQuery(error=RuntimeError("constraint or timeout")))

    def test_malformed_rows_are_a_stable_database_error(self):
        response = type("Response", (), {"data": {"id": "game-1"}})()
        with self.assertRaisesRegex(HTTPException, "Ошибка базы данных"):
            _db_rows(FakeQuery(response))


if __name__ == "__main__":
    unittest.main()
