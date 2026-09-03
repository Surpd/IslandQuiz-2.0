import copy
import asyncio
import json
import os
import time
import unittest

from fastapi import WebSocketDisconnect

from routes import rooms as rooms_route
from routes.results import _select_quiz_variant
from services.trusted_scoring import issue_snapshot_token


os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-unit-tests-only-123456")

QUIZ_SNAPSHOT_DATA = {
    "config": {"defaultTime": 30},
    "questions": [{"id": "q1", "type": "choice", "q": "Capital?", "options": ["Paris", "London"], "answer": "Paris", "points": 100, "time": 30}],
}

JEOPARDY_SNAPSHOT_DATA = {
    "config": {},
    "rounds": [[{"category": "Capital cities", "questions": [{"points": 100, "q": "Round question", "a": "Round answer"}]}]],
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


class LiveFakeWebSocket:
    def __init__(self, credential=None):
        self.incoming = asyncio.Queue()
        self.sent = []
        self.query_params = {"credential": credential} if credential else {}

    async def accept(self):
        return None

    async def send_json(self, message):
        self.sent.append(copy.deepcopy(message))

    async def receive_text(self):
        message = await self.incoming.get()
        if message is None:
            raise WebSocketDisconnect()
        return message

    async def send(self, message):
        await self.incoming.put(json.dumps(message))

    async def disconnect(self):
        await self.incoming.put(None)


def room_fixture():
    return {
        "code": "ROOM1",
        "gameKind": "quiz",
        "gameId": "game-1",
        "theme": "classic",
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
            "answers-token": {"role": "answers", "playerId": None},
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
            "theme": "midnight",
            "createdAt": 0,
        })])

        await rooms_route.room_websocket(websocket, "ROOM1")

        identity = next(message for message in websocket.sent if message["type"] == "room_identity")
        state = next(message["state"] for message in websocket.sent if message["type"] == "room_state")
        self.assertEqual(identity["role"], "host")
        self.assertTrue(identity["credential"])
        self.assertTrue(identity["answersCredential"])
        self.assertNotEqual(state["hostId"], "spoofed-host")
        self.assertEqual(state["theme"], "midnight")
        self.assertNotIn("_credentials", state)

    async def test_four_variant_room_sends_only_selected_variant_snapshot(self):
        full_data = {
            "config": {"defaultTime": 30},
            "questions": [{"id": "root-q", "type": "choice", "q": "Root", "answer": "A", "points": 100, "time": 30}],
            "variants": [
                {"id": f"variant-{index}", "name": f"Вариант {index + 1}", "questions": [{"id": f"q-{index}", "type": "choice", "q": f"Question {index}", "answer": "A", "points": 100, "time": 30}]}
                for index in range(2, 5)
            ],
        }
        selected_data = _select_quiz_variant(full_data, "variant-4")
        token = issue_snapshot_token("game-1", "quiz", selected_data)[1]
        websocket = FakeWebSocket([json.dumps({
            "action": "create_room",
            "gameKind": "quiz",
            "gameId": "game-1",
            "snapshotToken": token,
        })])

        await rooms_route.room_websocket(websocket, "ROOM1")

        snapshot_message = next(message for message in websocket.sent if message["type"] == "room_snapshot")
        snapshot = snapshot_message["snapshot"]
        self.assertEqual(snapshot["data"]["selectedVariantId"], "variant-4")
        self.assertEqual(snapshot["data"]["questions"][0]["id"], "q-4")
        self.assertNotIn("variants", snapshot["data"])
        self.assertLess(len(json.dumps(snapshot).encode("utf-8")), rooms_route.MAX_ROOM_MESSAGE_BYTES)

        guest = FakeWebSocket([json.dumps({"action": "join", "player": {"nickname": "Player", "avatar": ""}})])
        await rooms_route.room_websocket(guest, "ROOM1")
        guest_snapshot = next(message for message in guest.sent if message["type"] == "room_snapshot")["snapshot"]
        self.assertEqual(guest_snapshot["data"]["selectedVariantId"], "variant-4")
        self.assertNotIn("variants", guest_snapshot["data"])

    async def test_player_jeopardy_snapshot_hides_answers_but_teacher_token_keeps_them(self):
        room = jeopardy_room_fixture()
        player_snapshot = rooms_route.public_room_snapshot(room, {"role": "player", "playerId": "player-1"})
        teacher_snapshot = rooms_route.public_room_snapshot(room, {"role": "answers"})

        self.assertEqual(player_snapshot["data"]["rounds"][0][0]["questions"][0]["a"], "")
        self.assertEqual(player_snapshot["data"]["final"]["a"], "")
        self.assertEqual(teacher_snapshot["data"]["rounds"][0][0]["questions"][0]["a"], "Round answer")
        self.assertEqual(teacher_snapshot["data"]["final"]["a"], "Answer")

    async def test_jeopardy_reveal_state_exposes_only_the_revealed_answer_and_resync_keeps_snapshot_redacted(self):
        room = jeopardy_room_fixture()
        room["jeopardy"].update({
            "phase": "question",
            "selectedCat": 0,
            "selectedQ": 0,
        })
        rooms_route.rooms["ROOM1"] = room

        close = FakeWebSocket([json.dumps({"action": "jeopardy_close_question"})], credential="host-token")
        await rooms_route.room_websocket(close, "ROOM1")
        revealed_state = [message["state"] for message in close.sent if message["type"] == "room_state"][-1]
        self.assertEqual(revealed_state["jeopardy"]["revealedAnswer"], "Round answer")

        player = FakeWebSocket([], credential="player-1-token")
        await rooms_route.room_websocket(player, "ROOM1")
        player_state = next(message["state"] for message in player.sent if message["type"] == "room_state")
        player_snapshot = next(message["snapshot"] for message in player.sent if message["type"] == "room_snapshot")
        self.assertEqual(player_state["jeopardy"]["revealedAnswer"], "Round answer")
        self.assertEqual(player_snapshot["data"]["rounds"][0][0]["questions"][0]["a"], "")

    async def test_jeopardy_final_reveal_exposes_final_answer_after_host_action(self):
        room = jeopardy_room_fixture()
        room["jeopardy"].update({
            "phase": "final-question",
            "finalGiven": {"player-1": "Answer", "player-2": "Nope"},
            "finalAnswers": {"player-1": True, "player-2": False},
        })
        rooms_route.rooms["ROOM1"] = room

        host = FakeWebSocket([json.dumps({"action": "jeopardy_final_reveal"})], credential="host-token")
        await rooms_route.room_websocket(host, "ROOM1")
        state = [message["state"] for message in host.sent if message["type"] == "room_state"][-1]
        self.assertEqual(state["jeopardy"]["phase"], "final-reveal")
        self.assertEqual(state["jeopardy"]["revealedAnswer"], "Answer")

    async def test_answers_credential_cannot_control_room(self):
        room = jeopardy_room_fixture()
        rooms_route.rooms["ROOM1"] = room

        answers = FakeWebSocket([json.dumps({"action": "jeopardy_close_question"})], credential="answers-token")
        await rooms_route.room_websocket(answers, "ROOM1")

        self.assertTrue(any(message["type"] == "error" for message in answers.sent))

    async def test_large_snapshot_room_allows_guest_join(self):
        large_data = {
            "config": {"defaultTime": 30},
            "questions": [
                {
                    "id": f"q-{index}",
                    "type": "choice",
                    "q": "Question " + ("x" * 120),
                    "options": ["A" * 40, "B" * 40, "C" * 40, "D" * 40],
                    "answer": "A",
                    "points": 100,
                    "time": 30,
                }
                for index in range(100)
            ],
        }
        token = issue_snapshot_token("game-1", "quiz", large_data)[1]
        host = FakeWebSocket([json.dumps({
            "action": "create_room",
            "gameKind": "quiz",
            "gameId": "game-1",
            "snapshotToken": token,
        })])

        await rooms_route.room_websocket(host, "ROOM1")

        guest = FakeWebSocket([json.dumps({
            "action": "join",
            "player": {"nickname": "Large Quiz Guest", "avatar": ""},
        })])
        await rooms_route.room_websocket(guest, "ROOM1")

        self.assertIn("ROOM1", rooms_route.rooms)
        identity = next(message for message in guest.sent if message["type"] == "room_identity")
        self.assertEqual(identity["role"], "player")
        self.assertTrue(any(player["nickname"] == "Large Quiz Guest" for player in rooms_route.rooms["ROOM1"]["players"]))

    async def test_room_theme_defaults_to_classic_for_missing_or_invalid_value(self):
        websocket = FakeWebSocket([json.dumps({
            "action": "create_room",
            "gameKind": "quiz",
            "gameId": "game-1",
            "snapshotToken": snapshot_token(),
            "theme": "not-a-world",
        })])

        await rooms_route.room_websocket(websocket, "ROOM1")

        state = next(message["state"] for message in websocket.sent if message["type"] == "room_state")
        self.assertEqual(state["theme"], "classic")

    async def test_room_accepts_all_supported_worlds(self):
        for theme in ("classic", "amber", "ocean", "forest", "midnight"):
            with self.subTest(theme=theme):
                self.assertEqual(rooms_route._room_theme(theme), theme)

    async def test_legacy_color_cloud_theme_normalizes_to_classic(self):
        self.assertEqual(rooms_route._room_theme("color-cloud"), "classic")

    async def test_large_snapshot_create_and_join_keep_both_sockets_connected(self):
        large_data = {
            "config": {"defaultTime": 30},
            "questions": [
                {
                    "id": f"q-{index}",
                    "type": "choice",
                    "q": "Question " + ("x" * 120),
                    "options": ["A" * 40, "B" * 40, "C" * 40, "D" * 40],
                    "answer": "A",
                    "points": 100,
                    "time": 30,
                }
                for index in range(100)
            ],
        }
        token = issue_snapshot_token("game-1", "quiz", large_data)[1]
        host = LiveFakeWebSocket()
        guest = LiveFakeWebSocket()
        host_task = asyncio.create_task(rooms_route.room_websocket(host, "ROOM1"))
        guest_task = asyncio.create_task(rooms_route.room_websocket(guest, "ROOM1"))
        try:
            await host.send({
                "action": "create_room",
                "gameKind": "quiz",
                "gameId": "game-1",
                "snapshotToken": token,
            })
            await asyncio.sleep(0)
            await guest.send({
                "action": "join",
                "player": {"nickname": "Live Guest", "avatar": ""},
            })
            await asyncio.sleep(0)

            states = [
                message["state"]
                for socket in (host, guest)
                for message in socket.sent
                if message["type"] == "room_state"
            ]
            self.assertTrue(states)
            self.assertTrue(all("_snapshot" not in state for state in states))
            self.assertTrue(all(len(json.dumps(state).encode("utf-8")) <= rooms_route.MAX_ROOM_MESSAGE_BYTES for state in states))
            self.assertTrue(any(message["type"] == "room_identity" and message["role"] == "player" for message in guest.sent))
            self.assertTrue(any(player["nickname"] == "Live Guest" for player in rooms_route.rooms["ROOM1"]["players"]))
            self.assertFalse(host_task.done())
            self.assertFalse(guest_task.done())
        finally:
            await host.disconnect()
            await guest.disconnect()
            await asyncio.gather(host_task, guest_task)

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

    async def test_choice_draft_keeps_last_selection_and_reveal_finalizes_it(self):
        room = room_fixture()
        room["status"] = "active"
        room["questionStartAt"] = int(time.time() * 1000)
        rooms_route.rooms["ROOM1"] = room

        draft = FakeWebSocket([json.dumps({"action": "answer_draft", "given": "Paris"})], credential="player-1-token")
        await rooms_route.room_websocket(draft, "ROOM1")
        self.assertEqual(room["players"][0]["currentAnswer"]["given"], "Paris")
        self.assertFalse(any("currentAnswer" in player for message in draft.sent if message["type"] == "room_state" for player in message["state"]["players"]))

        reveal = FakeWebSocket([json.dumps({"action": "reveal"})], credential="host-token")
        await rooms_route.room_websocket(reveal, "ROOM1")
        player = room["players"][0]
        self.assertEqual(player["lastAnswer"]["given"], "Paris")
        self.assertTrue(player["lastAnswer"]["correct"])
        self.assertNotIn("currentAnswer", player)

    async def test_choice_draft_uses_the_last_selection_before_timeout(self):
        room = room_fixture()
        room["status"] = "active"
        room["questionStartAt"] = int(time.time() * 1000)
        rooms_route.rooms["ROOM1"] = room

        draft = FakeWebSocket([
            json.dumps({"action": "answer_draft", "given": "Paris"}),
            json.dumps({"action": "answer_draft", "given": "London"}),
        ], credential="player-1-token")
        await rooms_route.room_websocket(draft, "ROOM1")
        reveal = FakeWebSocket([json.dumps({"action": "reveal"})], credential="host-token")
        await rooms_route.room_websocket(reveal, "ROOM1")

        player = room["players"][0]
        self.assertEqual(player["lastAnswer"]["given"], "London")
        self.assertFalse(player["lastAnswer"]["correct"])

    async def test_all_quiz_types_finalize_valid_drafts_without_submit(self):
        cases = [
            ("choice", ["Paris", "London"], "Paris"),
            ("bool", [], "true"),
            ("text", [], "Москва"),
            ("matching", [], json.dumps({"Россия": "Москва"}, ensure_ascii=False)),
            ("close", [], json.dumps(["Москва"], ensure_ascii=False)),
            ("ordering", [], json.dumps(["B", "A", "C"], ensure_ascii=False)),
        ]
        answers = {
            "choice": "Paris",
            "bool": "true",
            "text": "Москва",
            "matching": json.dumps([{"left": "Россия", "right": "Москва"}], ensure_ascii=False),
            "close": json.dumps(["Москва"], ensure_ascii=False),
            "ordering": json.dumps(["B", "A", "C"], ensure_ascii=False),
        }
        for question_type, options, given in cases:
            with self.subTest(question_type=question_type):
                room = room_fixture()
                room["_snapshot"] = copy.deepcopy(room["_snapshot"])
                room["_snapshot"]["data"]["questions"][0] = {
                    "id": "q1",
                    "type": question_type,
                    "q": "Тестовый вопрос",
                    "options": options,
                    "answer": answers[question_type],
                    "points": 100,
                    "time": 30,
                }
                room["status"] = "active"
                room["questionStartAt"] = int(time.time() * 1000)
                rooms_route.rooms["ROOM1"] = room

                draft = FakeWebSocket(
                    [json.dumps({"action": "answer_draft", "given": given}, ensure_ascii=False)],
                    credential="player-1-token",
                )
                await rooms_route.room_websocket(draft, "ROOM1")
                reveal = FakeWebSocket([json.dumps({"action": "reveal"})], credential="host-token")
                await rooms_route.room_websocket(reveal, "ROOM1")

                player = room["players"][0]
                self.assertEqual(player["lastAnswer"]["given"], given)
                self.assertTrue(player["lastAnswer"]["correct"])
                self.assertEqual(player["score"], player["lastAnswer"]["delta"])
                self.assertEqual(len(player["answerHistory"]), 1)

    async def test_reveal_handles_explicit_null_last_answer(self):
        room = room_fixture()
        room["status"] = "active"
        room["questionStartAt"] = int(time.time() * 1000)
        room["players"][0]["lastAnswer"] = None
        rooms_route.rooms["ROOM1"] = room

        reveal = FakeWebSocket([json.dumps({"action": "reveal"})], credential="host-token")
        await rooms_route.room_websocket(reveal, "ROOM1")

        self.assertEqual(room["status"], "reveal")
        self.assertIsNone(room["players"][0]["lastAnswer"])
        self.assertTrue(
            any(
                message["type"] == "room_state" and message["state"]["status"] == "reveal"
                for message in reveal.sent
            )
        )

    async def test_untouched_ordering_is_not_auto_submitted(self):
        room = room_fixture()
        room["_snapshot"] = copy.deepcopy(room["_snapshot"])
        room["_snapshot"]["data"]["questions"][0] = {
            "id": "q1",
            "type": "ordering",
            "q": "Расположите",
            "options": [],
            "answer": json.dumps(["A", "B", "C"]),
            "points": 100,
            "time": 30,
        }
        room["status"] = "active"
        room["questionStartAt"] = int(time.time() * 1000)
        rooms_route.rooms["ROOM1"] = room

        reveal = FakeWebSocket([json.dumps({"action": "reveal"})], credential="host-token")
        await rooms_route.room_websocket(reveal, "ROOM1")

        self.assertNotIn("lastAnswer", room["players"][0])

    async def test_late_new_answer_is_rejected_but_saved_draft_can_finish(self):
        room = room_fixture()
        room["status"] = "active"
        room["questionStartAt"] = int(time.time() * 1000) - 31_000
        rooms_route.rooms["ROOM1"] = room

        late = FakeWebSocket([json.dumps({"action": "answer", "given": "Paris"})], credential="player-1-token")
        await rooms_route.room_websocket(late, "ROOM1")
        self.assertIn({"type": "error", "error": "Время вышло"}, late.sent)
        self.assertNotIn("lastAnswer", room["players"][0])

        room["players"][0]["currentAnswer"] = {
            "questionIdx": 0,
            "given": "London",
            "receivedAt": room["questionStartAt"] + 1000,
        }
        timeout = FakeWebSocket([json.dumps({"action": "answer", "given": "", "timedOut": True})], credential="player-1-token")
        await rooms_route.room_websocket(timeout, "ROOM1")
        self.assertEqual(room["players"][0]["lastAnswer"]["given"], "London")

    async def test_empty_text_timeout_remains_missing_answer(self):
        room = room_fixture()
        room["_snapshot"] = copy.deepcopy(room["_snapshot"])
        room["_snapshot"]["data"]["questions"][0] = {
            "id": "q1",
            "type": "text",
            "q": "Введите слово",
            "answer": "слово",
            "points": 100,
            "time": 30,
        }
        room["status"] = "active"
        room["questionStartAt"] = int(time.time() * 1000) - 31_000
        rooms_route.rooms["ROOM1"] = room

        timeout = FakeWebSocket([json.dumps({"action": "answer", "given": "", "timedOut": True})], credential="player-1-token")
        await rooms_route.room_websocket(timeout, "ROOM1")

        self.assertNotIn("lastAnswer", room["players"][0])

    async def test_duplicate_final_answer_is_idempotent_for_score(self):
        room = room_fixture()
        room["status"] = "active"
        room["questionStartAt"] = int(time.time() * 1000)
        rooms_route.rooms["ROOM1"] = room
        websocket = FakeWebSocket([
            json.dumps({"action": "answer", "given": "Paris"}),
            json.dumps({"action": "answer", "given": "Paris"}),
        ], credential="player-1-token")

        await rooms_route.room_websocket(websocket, "ROOM1")

        self.assertEqual(room["players"][0]["score"], 1500)
        self.assertEqual(len(room["players"][0]["answerHistory"]), 1)

    async def test_timeout_submit_and_reveal_race_finalize_saved_draft_once(self):
        room = room_fixture()
        room["status"] = "active"
        room["questionStartAt"] = int(time.time() * 1000) - 1_000
        room["players"][0]["currentAnswer"] = {
            "questionIdx": 0,
            "given": "Paris",
            "receivedAt": room["questionStartAt"] + 500,
        }
        rooms_route.rooms["ROOM1"] = room

        submit = FakeWebSocket(
            [json.dumps({"action": "answer", "given": "", "timedOut": True})],
            credential="player-1-token",
        )
        reveal = FakeWebSocket([json.dumps({"action": "reveal"})], credential="host-token")
        # Reveal-first is one possible ordering of the timeout/submit race;
        # the saved draft must be finalized before the late submit is rejected.
        await rooms_route.room_websocket(reveal, "ROOM1")
        await rooms_route.room_websocket(submit, "ROOM1")

        player = room["players"][0]
        self.assertEqual(room["status"], "reveal")
        self.assertEqual(player["lastAnswer"]["given"], "Paris")
        self.assertEqual(player["score"], 1492)
        self.assertEqual(len(player["answerHistory"]), 1)

    async def test_player_cannot_answer_for_another_player(self):
        room = room_fixture()
        room["status"] = "active"
        room["questionStartAt"] = int(time.time() * 1000)
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
        room["questionStartAt"] = int(time.time() * 1000)
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
