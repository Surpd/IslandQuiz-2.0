import copy
import json
import os
import unittest

from fastapi import WebSocketDisconnect

from routes import rooms as rooms_route
from services.trusted_scoring import issue_snapshot_token


os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests-only-123456")

QUIZ_SNAPSHOT_DATA = {
    "config": {"defaultTime": 30},
    "questions": [{"id": "q1", "type": "choice", "q": "Capital?", "answer": "Paris", "points": 100, "time": 30}],
}

JEOPARDY_SNAPSHOT_DATA = {
    "config": {},
    "rounds": [[{"category": "Capital cities", "questions": [{"points": 100}]}]],
    "final": {"category": "Final", "q": "Question", "a": "Answer"},
}


def snapshot_token():
    return issue_snapshot_token("game-1", "quiz", QUIZ_SNAPSHOT_DATA)[1]


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


def room_fixture():
    return {
        "code": "ROOM1",
        "gameKind": "quiz",
        "gameId": "game-1",
        "hostId": "server-host",
        "status": "waiting",
        "questionIdx": 0,
        "questionStartAt": None,
        "players": [
            {"id": "player-1", "nickname": "Alice", "avatar": "", "score": 0, "streak": 0},
            {"id": "player-2", "nickname": "Bob", "avatar": "", "score": 0, "streak": 0},
        ],
        "fastestPlayerId": None,
        "createdAt": 1,
        "_snapshot": issue_snapshot_token("game-1", "quiz", QUIZ_SNAPSHOT_DATA)[0],
        "_credentials": {
            "host-token": {"role": "host", "playerId": None},
            "player-1-token": {"role": "player", "playerId": "player-1"},
            "player-2-token": {"role": "player", "playerId": "player-2"},
        },
    }


def jeopardy_room_fixture():
    room = room_fixture()
    room["gameKind"] = "jeopardy"
    room["_snapshot"] = issue_snapshot_token("game-1", "jeopardy", JEOPARDY_SNAPSHOT_DATA)[0]
    room["jeopardy"] = {
        "phase": "lobby", "mode": "buzz", "round": 0, "currentPlayerIdx": 0,
        "usedKeys": [], "selectedCat": None, "selectedQ": None,
        "buzzedPlayerId": None, "buzzedPlayerIds": [], "buzzedAnswer": None,
        "buzzStartAt": None, "buzzTimeoutMs": 30000, "questionTotalMs": 30000,
        "questionElapsedMs": 0, "showAnswer": False, "awaitingBonus": False,
        "finalBets": {}, "finalAnswers": {}, "finalGiven": {},
        "finalRevealOrder": [], "finalRevealIdx": -1, "finalRevealStep": "done",
        "finalRevealAt": None, "lastDelta": None, "decisions": [],
    }
    return room


class RoomAuthorizationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        rooms_route.rooms.clear()
        rooms_route.connections.clear()
        for task in rooms_route.room_cleanup_tasks.values():
            task.cancel()
        rooms_route.room_cleanup_tasks.clear()

    async def asyncTearDown(self):
        rooms_route.rooms.clear()
        rooms_route.connections.clear()
        for task in rooms_route.room_cleanup_tasks.values():
            task.cancel()
        rooms_route.room_cleanup_tasks.clear()

    async def test_create_room_issues_server_host_identity(self):
        websocket = FakeWebSocket([json.dumps({
            "action": "create_room",
            "gameKind": "quiz",
            "gameId": "game-1",
            "snapshotToken": snapshot_token(),
            "hostId": "spoofed-host",
            "createdAt": 0,
        })])

        await rooms_route.room_websocket(websocket, "ROOM1")

        identity = next(message for message in websocket.sent if message["type"] == "room_identity")
        state = next(message["state"] for message in websocket.sent if message["type"] == "room_state")
        self.assertEqual(identity["role"], "host")
        self.assertTrue(identity["credential"])
        self.assertNotEqual(state["hostId"], "spoofed-host")
        self.assertNotIn("_credentials", state)

    async def test_guest_join_ignores_client_player_id_and_issues_identity(self):
        rooms_route.rooms["ROOM1"] = room_fixture()
        websocket = FakeWebSocket([json.dumps({
            "action": "join",
            "player": {"id": "player-2", "nickname": "Eve", "avatar": ""},
        })])

        await rooms_route.room_websocket(websocket, "ROOM1")

        identity = next(message for message in websocket.sent if message["type"] == "room_identity")
        state = [message["state"] for message in websocket.sent if message["type"] == "room_state"][-1]
        joined = next(player for player in state["players"] if player["nickname"] == "Eve")
        self.assertEqual(identity["role"], "player")
        self.assertEqual(identity["playerId"], joined["id"])
        self.assertNotEqual(joined["id"], "player-2")

    async def test_authorized_create_join_start_and_answer_happy_path(self):
        host_create = FakeWebSocket([json.dumps({
            "action": "create_room",
            "gameKind": "quiz",
            "gameId": "game-1",
            "snapshotToken": snapshot_token(),
        })])
        await rooms_route.room_websocket(host_create, "ROOM1")
        host_credential = next(message["credential"] for message in host_create.sent if message["type"] == "room_identity")

        guest_join = FakeWebSocket([json.dumps({
            "action": "join",
            "player": {"nickname": "Alice", "avatar": ""},
        })])
        await rooms_route.room_websocket(guest_join, "ROOM1")
        guest_identity = next(message for message in guest_join.sent if message["type"] == "room_identity")

        host_start = FakeWebSocket([json.dumps({"action": "start"})], credential=host_credential)
        await rooms_route.room_websocket(host_start, "ROOM1")

        player_answer = FakeWebSocket([json.dumps({
            "action": "answer",
            "correct": False,
            "delta": 999999,
            "streak": 100,
            "given": "Paris",
        })], credential=guest_identity["credential"])
        await rooms_route.room_websocket(player_answer, "ROOM1")

        state = [message["state"] for message in player_answer.sent if message["type"] == "room_state"][-1]
        self.assertEqual(state["status"], "active")
        self.assertEqual(state["players"][0]["id"], guest_identity["playerId"])
        self.assertEqual(state["players"][0]["score"], 1500)

    async def test_player_cannot_answer_for_another_player(self):
        room = room_fixture()
        room["status"] = "active"
        room["questionStartAt"] = 1
        rooms_route.rooms["ROOM1"] = room
        websocket = FakeWebSocket([json.dumps({
            "action": "answer",
            "playerId": "player-2",
            "correct": True,
            "delta": 100,
            "streak": 1,
            "given": "Paris",
        })], credential="player-1-token")

        await rooms_route.room_websocket(websocket, "ROOM1")

        state = [message["state"] for message in websocket.sent if message["type"] == "room_state"][-1]
        players = {player["id"]: player for player in state["players"]}
        self.assertGreater(players["player-1"]["score"], 0)
        self.assertEqual(players["player-2"]["score"], 0)

    async def test_host_actions_require_host_credential(self):
        rooms_route.rooms["ROOM1"] = room_fixture()
        websocket = FakeWebSocket([
            json.dumps({"action": "start"}),
            json.dumps({"action": "adjust_score", "playerId": "player-2", "delta": 999}),
        ], credential="player-1-token")

        await rooms_route.room_websocket(websocket, "ROOM1")

        errors = [message["error"] for message in websocket.sent if message["type"] == "error"]
        self.assertEqual(errors, ["Действие доступно только ведущему", "Действие доступно только ведущему"])

    async def test_host_can_control_room_but_unbound_socket_cannot(self):
        rooms_route.rooms["ROOM1"] = room_fixture()
        host = FakeWebSocket([json.dumps({"action": "start"})], credential="host-token")

        await rooms_route.room_websocket(host, "ROOM1")

        state = [message["state"] for message in host.sent if message["type"] == "room_state"][-1]
        self.assertEqual(state["status"], "active")

        rooms_route.rooms["ROOM1"] = room_fixture()
        unbound = FakeWebSocket([json.dumps({"action": "finish"})])
        await rooms_route.room_websocket(unbound, "ROOM1")
        self.assertIn({"type": "error", "error": "Действие доступно только ведущему"}, unbound.sent)

    async def test_player_reconnect_receives_state_after_disconnect(self):
        rooms_route.rooms["ROOM1"] = room_fixture()
        first_connection = FakeWebSocket([], credential="player-1-token")

        await rooms_route.room_websocket(first_connection, "ROOM1")

        self.assertIn("ROOM1", rooms_route.rooms)
        self.assertIn("ROOM1", rooms_route.room_cleanup_tasks)

        reconnect = FakeWebSocket([], credential="player-1-token")

        await rooms_route.room_websocket(reconnect, "ROOM1")

        self.assertEqual(reconnect.sent[0]["type"], "room_state")

    async def test_unknown_action_is_controlled(self):
        rooms_route.rooms["ROOM1"] = room_fixture()
        websocket = FakeWebSocket([json.dumps({"action": "delete_room"})], credential="host-token")
        await rooms_route.room_websocket(websocket, "ROOM1")
        self.assertIn({"type": "error", "error": "Неизвестное действие комнаты"}, websocket.sent)

    async def test_quiz_actions_reject_out_of_order_and_out_of_bounds(self):
        rooms_route.rooms["ROOM1"] = room_fixture()
        websocket = FakeWebSocket([
            json.dumps({"action": "answer", "given": "Paris"}),
            json.dumps({"action": "next_question"}),
        ], credential="player-1-token")

        await rooms_route.room_websocket(websocket, "ROOM1")

        errors = [message["error"] for message in websocket.sent if message["type"] == "error"]
        self.assertEqual(errors, ["Сейчас нельзя отвечать", "Действие доступно только ведущему"])

    async def test_quiz_answer_replay_and_oversized_message_are_rejected(self):
        room = room_fixture()
        room["status"] = "active"
        room["questionStartAt"] = 1
        rooms_route.rooms["ROOM1"] = room
        websocket = FakeWebSocket([
            json.dumps({"action": "answer", "given": "Paris"}),
            json.dumps({"action": "answer", "given": "Paris"}),
            json.dumps({"action": "answer", "given": "x" * 2001}),
        ], credential="player-1-token")

        await rooms_route.room_websocket(websocket, "ROOM1")

        errors = [message["error"] for message in websocket.sent if message["type"] == "error"]
        self.assertEqual(errors, ["На этот вопрос уже отвечали", "Некорректный ответ"])

        oversized = FakeWebSocket([json.dumps({"action": "answer", "given": "x" * 17000})], credential="player-2-token")
        await rooms_route.room_websocket(oversized, "ROOM1")
        self.assertIn({"type": "error", "error": "Сообщение комнаты слишком большое"}, oversized.sent)

    async def test_jeopardy_rejects_invalid_phase_and_question_bounds(self):
        rooms_route.rooms["ROOM1"] = jeopardy_room_fixture()
        websocket = FakeWebSocket([
            json.dumps({"action": "jeopardy_start"}),
            json.dumps({"action": "jeopardy_select", "catIdx": 9, "qIdx": 0, "questionTotalMs": 30000, "questionStartAt": 1}),
        ], credential="host-token")

        await rooms_route.room_websocket(websocket, "ROOM1")

        errors = [message["error"] for message in websocket.sent if message["type"] == "error"]
        self.assertEqual(errors, ["Некорректная категория Jeopardy"])

    async def test_jeopardy_rejects_duplicate_buzz_answer_and_invalid_final_bet(self):
        room = jeopardy_room_fixture()
        room["jeopardy"]["phase"] = "answering"
        room["jeopardy"]["buzzedPlayerId"] = "player-1"
        rooms_route.rooms["ROOM1"] = room
        answer_socket = FakeWebSocket([
            json.dumps({"action": "jeopardy_buzz_answer", "given": "Paris"}),
            json.dumps({"action": "jeopardy_buzz_answer", "given": "Paris"}),
        ], credential="player-1-token")

        await rooms_route.room_websocket(answer_socket, "ROOM1")

        errors = [message["error"] for message in answer_socket.sent if message["type"] == "error"]
        self.assertEqual(errors, ["Ответ на этот вопрос уже отправлен"])

        room["jeopardy"]["phase"] = "final-bets"
        room["players"][0]["score"] = 100
        bet_socket = FakeWebSocket([json.dumps({"action": "jeopardy_final_bet", "bet": 101})], credential="player-1-token")
        await rooms_route.room_websocket(bet_socket, "ROOM1")
        self.assertIn({"type": "error", "error": "Ставка не может превышать счёт игрока"}, bet_socket.sent)

    async def test_jeopardy_valid_state_transitions(self):
        rooms_route.rooms["ROOM1"] = jeopardy_room_fixture()
        host_start = FakeWebSocket([json.dumps({"action": "jeopardy_start"})], credential="host-token")
        await rooms_route.room_websocket(host_start, "ROOM1")
        self.assertEqual([m["state"]["jeopardy"]["phase"] for m in host_start.sent if m["type"] == "room_state"][-1], "board")

        host_select = FakeWebSocket([json.dumps({
            "action": "jeopardy_select", "catIdx": 0, "qIdx": 0,
            "questionTotalMs": 30000, "questionStartAt": 1,
        })], credential="host-token")
        await rooms_route.room_websocket(host_select, "ROOM1")
        self.assertEqual([m["state"]["jeopardy"]["phase"] for m in host_select.sent if m["type"] == "room_state"][-1], "question")

        player_buzz = FakeWebSocket([json.dumps({"action": "jeopardy_buzz", "buzzStartAt": 1})], credential="player-1-token")
        await rooms_route.room_websocket(player_buzz, "ROOM1")
        self.assertEqual([m["state"]["jeopardy"]["phase"] for m in player_buzz.sent if m["type"] == "room_state"][-1], "answering")

        player_answer = FakeWebSocket([json.dumps({"action": "jeopardy_buzz_answer", "given": "Paris"})], credential="player-1-token")
        await rooms_route.room_websocket(player_answer, "ROOM1")
        host_accept = FakeWebSocket([json.dumps({"action": "jeopardy_accept", "correct": True})], credential="host-token")
        await rooms_route.room_websocket(host_accept, "ROOM1")
        self.assertEqual([m["state"]["jeopardy"]["phase"] for m in host_accept.sent if m["type"] == "room_state"][-1], "reveal")


if __name__ == "__main__":
    unittest.main()
