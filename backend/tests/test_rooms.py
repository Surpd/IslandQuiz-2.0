import json
import copy
import unittest

from fastapi import WebSocketDisconnect

from routes import rooms as rooms_route


class FakeWebSocket:
    def __init__(self, messages):
        self.messages = iter(messages)
        self.sent = []

    async def accept(self):
        return None

    async def send_json(self, message):
        self.sent.append(copy.deepcopy(message))

    async def receive_text(self):
        try:
            return next(self.messages)
        except StopIteration as exc:
            raise WebSocketDisconnect() from exc


class RoomFlowTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        rooms_route.rooms.clear()
        rooms_route.connections.clear()

    async def asyncTearDown(self):
        rooms_route.rooms.clear()
        rooms_route.connections.clear()

    async def test_quiz_room_lifecycle_and_disconnect_cleanup(self):
        player = {"id": "player-1", "nickname": "Alice", "avatar": "", "score": 0}
        actions = [
            {"action": "create_room", "gameId": "game-1", "hostId": "host-1"},
            {"action": "join", "player": player},
            {"action": "start", "questionStartAt": 123},
            {
                "action": "answer",
                "playerId": "player-1",
                "correct": True,
                "delta": 100,
                "given": "Paris",
            },
            {"action": "next_question", "questionStartAt": 456},
            {"action": "finish"},
        ]
        websocket = FakeWebSocket([json.dumps(action) for action in actions])

        await rooms_route.room_websocket(websocket, "ROOM1")

        states = [message["state"] for message in websocket.sent if message["type"] == "room_state"]
        self.assertGreaterEqual(len(states), len(actions))
        self.assertEqual(states[0]["status"], "waiting")
        self.assertEqual(states[1]["players"][0]["id"], "player-1")
        self.assertEqual(states[2]["status"], "active")
        self.assertEqual(states[3]["players"][0]["score"], 100)
        self.assertEqual(states[-2]["questionIdx"], 1)
        self.assertEqual(states[-1]["status"], "finished")
        self.assertNotIn("ROOM1", rooms_route.rooms)
        self.assertNotIn("ROOM1", rooms_route.connections)

    async def test_joining_unknown_room_returns_error_and_cleans_up(self):
        websocket = FakeWebSocket([
            json.dumps({
                "action": "join",
                "player": {"id": "player-1", "nickname": "Alice"},
            }),
        ])

        await rooms_route.room_websocket(websocket, "MISSING")

        self.assertEqual(
            websocket.sent,
            [{"type": "error", "error": "Комната не найдена"}],
        )
        self.assertNotIn("MISSING", rooms_route.rooms)
        self.assertNotIn("MISSING", rooms_route.connections)

    async def test_malformed_message_returns_error_and_cleans_up(self):
        websocket = FakeWebSocket(["not json"])

        await rooms_route.room_websocket(websocket, "INVALID")

        self.assertEqual(
            websocket.sent,
            [{"type": "error", "error": "Неверный формат сообщения"}],
        )
        self.assertNotIn("INVALID", rooms_route.rooms)
        self.assertNotIn("INVALID", rooms_route.connections)


if __name__ == "__main__":
    unittest.main()
