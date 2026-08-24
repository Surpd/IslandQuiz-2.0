import os
import sys
import types
import unittest

from fastapi import HTTPException

os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests-only-123456")
fake_database = types.ModuleType("database")
fake_database.supabase = object()
sys.modules.setdefault("database", fake_database)

from routes.results import _db_rows, _result_variant_identity, _select_quiz_variant


class FakeQuery:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    def execute(self):
        if self.error:
            raise self.error
        return self.response


class ResultsDatabaseResponseTests(unittest.TestCase):
    def test_quiz_snapshot_selects_requested_variant_and_legacy_defaults_to_root(self):
        data = {"questions": [{"id": "q1"}], "variants": [{"id": "v2", "name": "Вариант 2", "questions": [{"id": "q2"}]}]}
        self.assertEqual(_select_quiz_variant(data, None)["questions"][0]["id"], "q1")
        selected = _select_quiz_variant(data, "v2")
        self.assertEqual(selected["questions"][0]["id"], "q2")
        self.assertEqual(selected["selectedVariantName"], "Вариант 2")
        self.assertNotIn("variants", selected)
        self.assertNotIn("variants", _select_quiz_variant(data, None))
        with self.assertRaisesRegex(ValueError, "не найден"):
            _select_quiz_variant(data, "missing")
    def test_empty_or_malformed_result_envelopes_are_empty(self):
        self.assertEqual(_db_rows(FakeQuery(type("Response", (), {"data": None})())), [])
        self.assertEqual(_db_rows(FakeQuery(type("Response", (), {"data": {"id": "result-1"}})())), [])

    def test_result_variant_identity_reads_snapshot_and_keeps_legacy_empty(self):
        payload = {"snapshot": {"data": {"selectedVariantId": "variant-2", "selectedVariantName": "Вариант 2"}}}
        self.assertEqual(_result_variant_identity(payload), ("variant-2", "Вариант 2"))
        self.assertEqual(_result_variant_identity({"items": []}), (None, None))
        self.assertEqual(_result_variant_identity(None), (None, None))

    def test_transport_errors_are_controlled(self):
        for query in (FakeQuery(), FakeQuery(error=RuntimeError("database unavailable"))):
            with self.subTest(query=query), self.assertRaisesRegex(HTTPException, "Ошибка базы данных"):
                _db_rows(query)


if __name__ == "__main__":
    unittest.main()
