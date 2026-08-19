import os
import sys
import types
import unittest

from fastapi import HTTPException

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests-only-123456")
fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

from routes.feedback import _db_insert


class FakeQuery:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    def execute(self):
        if self.error:
            raise self.error
        return self.response


class FeedbackDatabaseResponseTests(unittest.TestCase):
    def test_insert_requires_a_response(self):
        response = type("Response", (), {"data": []})()
        self.assertIs(_db_insert(FakeQuery(response)), response)

    def test_insert_errors_are_controlled(self):
        for query in (FakeQuery(), FakeQuery(error=RuntimeError("constraint"))):
            with self.subTest(query=query), self.assertRaisesRegex(HTTPException, "Ошибка базы данных"):
                _db_insert(query)


if __name__ == "__main__":
    unittest.main()
