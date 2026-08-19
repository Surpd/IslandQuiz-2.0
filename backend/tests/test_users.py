import os
import sys
import types
import unittest

from fastapi import HTTPException

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests-only-123456")
fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

from routes.users import _db_rows


class FakeQuery:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    def execute(self):
        if self.error:
            raise self.error
        return self.response


class UsersDatabaseResponseTests(unittest.TestCase):
    def test_empty_data_is_normalized(self):
        response = type("Response", (), {"data": None})()
        self.assertEqual(_db_rows(FakeQuery(response)), [])

    def test_none_response_exception_and_malformed_rows_are_controlled(self):
        for query in (
            FakeQuery(),
            FakeQuery(error=TimeoutError("database timeout")),
            FakeQuery(type("Response", (), {"data": ["not-a-row"]})()),
        ):
            with self.subTest(query=query), self.assertRaisesRegex(HTTPException, "Ошибка базы данных"):
                _db_rows(query)


if __name__ == "__main__":
    unittest.main()
