import os
import sys
import types
import unittest

from fastapi import HTTPException

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests-only-123456")
fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

from routes.results import _db_rows


class FakeQuery:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    def execute(self):
        if self.error:
            raise self.error
        return self.response


class ResultsDatabaseResponseTests(unittest.TestCase):
    def test_empty_or_malformed_result_envelopes_are_empty(self):
        self.assertEqual(_db_rows(FakeQuery(type("Response", (), {"data": None})())), [])
        self.assertEqual(_db_rows(FakeQuery(type("Response", (), {"data": {"id": "result-1"}})())), [])

    def test_transport_errors_are_controlled(self):
        for query in (FakeQuery(), FakeQuery(error=RuntimeError("database unavailable"))):
            with self.subTest(query=query), self.assertRaisesRegex(HTTPException, "Ошибка базы данных"):
                _db_rows(query)


if __name__ == "__main__":
    unittest.main()
