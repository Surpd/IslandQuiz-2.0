import asyncio
import copy
import json
import os
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import WebSocketDisconnect

from routes import rooms
from services.trusted_scoring import issue_snapshot_token


os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests-only-123456")

SNAPSHOT_DATA = {
    "config": {"defaultTime": 30},
    "questions": [{"id": "q1", "type": "choice", "q": "Capital?", "answer": "Paris", "points": 100, "time": 30}],
}


class FakeWebSocket:
    def __init__(self, messages, credential=None):
        self.messages = iter(messages)
        self.sent = []
        self.query_params = {"credential": credential} if credential else {}

    async def accept(self):
        return None

    async def send_json(self, message):
        self.sent.append(copy.deepcopy(message))

    async def receive_text(self):
        try:
            return next(self.messages)
        except StopIteration as exc:
            raise WebSocketDisconnect() from exc


class PersistenceQuery:
    def __init__(self, database, table):
        self.database = database
        self.table_name = table
        self.operation = None
        self.payload = None
        self.code = None

    def select(self, *_args, **_kwargs):
        self.operation = "select"
        return self

    def eq(self, field, value):
        if field == "code":
            self.code = value
        return self

    def gt(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def upsert(self, payload):
        self.operation = "upsert"
        self.payload = payload
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def execute(self):
        if self.operation == "upsert":
            self.database.rows[self.payload["code"]] = copy.deepcopy(self.payload)
            return SimpleNamespace(data=[self.payload])
        if self.operation == "select":
            row = self.database.rows.get(self.code)
            return SimpleNamespace(data=[copy.deepcopy(row)] if row else [])
        if self.operation == "delete":
            self.database.rows.pop(self.code, None)
            return SimpleNamespace(data=[])
        return SimpleNamespace(data=[])


class PersistenceSupabase:
    def __init__(self):
        self.rows = {}

    def table(self, name):
        return PersistenceQuery(self, name)


def snapshot_token():
    return issue_snapshot_token("game-1", "quiz", SNAPSHOT_DATA)[1]


class RoomPersistenceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        rooms.rooms.clear()
        rooms.connections.clear()
        for task in rooms.room_cleanup_tasks.values():
            task.cancel()
        rooms.room_cleanup_tasks.clear()

    async def asyncTearDown(self):
        rooms.rooms.clear()
        rooms.connections.clear()
        for task in rooms.room_cleanup_tasks.values():
            task.cancel()
        rooms.room_cleanup_tasks.clear()

    async def test_progress_survives_simulated_restart_and_reconnect(self):
        database = PersistenceSupabase()
        with patch("database.supabase", database):
            host = FakeWebSocket([json.dumps({
                "action": "create_room",
                "gameKind": "quiz",
                "gameId": "game-1",
                "snapshotToken": snapshot_token(),
                "theme": "midnight",
            })])
            await rooms.room_websocket(host, "ROOM1")
            host_credential = next(item["credential"] for item in host.sent if item["type"] == "room_identity")

            player = FakeWebSocket([json.dumps({
                "action": "join",
                "player": {"nickname": "Alice", "avatar": ""},
            })])
            await rooms.room_websocket(player, "ROOM1")
            player_credential = next(item["credential"] for item in player.sent if item["type"] == "room_identity")

            starter = FakeWebSocket([json.dumps({"action": "start"})], credential=host_credential)
            await rooms.room_websocket(starter, "ROOM1")
            answerer = FakeWebSocket([json.dumps({"action": "answer", "given": "Paris"})], credential=player_credential)
            await rooms.room_websocket(answerer, "ROOM1")

            persisted_json = json.dumps(database.rows["ROOM1"], sort_keys=True)
            self.assertNotIn(host_credential, persisted_json)
            self.assertNotIn(player_credential, persisted_json)
            self.assertEqual(database.rows["ROOM1"]["state"]["status"], "active")

            # Simulate a process restart: in-memory rooms and sockets disappear.
            rooms.rooms.clear()
            rooms.connections.clear()

            reconnect = FakeWebSocket([], credential=host_credential)
            await rooms.room_websocket(reconnect, "ROOM1")

        state = next(item["state"] for item in reconnect.sent if item["type"] == "room_state")
        self.assertEqual(state["status"], "active")
        self.assertEqual(state["theme"], "midnight")
        self.assertEqual(state["players"][0]["score"], 1500)
        self.assertIn("ROOM1", rooms.rooms)


if __name__ == "__main__":
    unittest.main()
