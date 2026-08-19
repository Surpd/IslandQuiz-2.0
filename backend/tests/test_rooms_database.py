import os
import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import patch


fake_database = types.ModuleType("database")
fake_database.supabase = SimpleNamespace()
sys.modules.setdefault("database", fake_database)

from routes import rooms


os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests-only-123456")


class Query:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    def execute(self):
        if self.error:
            raise self.error
        return self.response


class FakeSupabase:
    def __init__(self, response):
        self.response = response

    def table(self, _name):
        return self

    def insert(self, _payload):
        return Query(self.response)


class RoomsDatabaseNormalizationTests(unittest.TestCase):
    def test_insert_exception_returns_controlled_failure(self):
        self.assertIsNone(rooms._room_db_insert(Query(error=RuntimeError("database unavailable"))))

    def test_none_and_empty_insert_responses_do_not_mark_result_saved(self):
        for response in (None, SimpleNamespace(data=[])):
            room = {
                "gameKind": "quiz",
                "gameId": "game-1",
                "code": "ROOM1",
                "createdAt": 0,
                "_resultSaved": False,
                "_snapshot": {
                    "gameId": "game-1",
                    "kind": "quiz",
                    "version": 1,
                    "data": {"questions": []},
                },
                "players": [],
            }
            with patch("database.supabase", FakeSupabase(response)):
                self.assertFalse(rooms._persist_room_result(room))
            self.assertFalse(room.get("_resultSaved"))


if __name__ == "__main__":
    unittest.main()
