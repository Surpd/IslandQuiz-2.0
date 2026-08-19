import asyncio
import json
import secrets
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from services.trusted_scoring import quiz_answer_is_correct, verify_snapshot_token

router = APIRouter(tags=["rooms"])

# Хранилище комнат и соединений (в памяти)
rooms: dict[str, dict] = {}
connections: dict[str, list[WebSocket]] = {}
room_cleanup_tasks: dict[str, asyncio.Task] = {}
ROOM_RECONNECT_GRACE_SECONDS = 60

HOST_ACTIONS = {
    "start", "reveal", "leaderboard", "next_question", "finish", "restart", "kick", "adjust_score",
    "jeopardy_set_mode", "jeopardy_start", "jeopardy_select", "jeopardy_accept",
    "jeopardy_turn_wrong_finalize", "jeopardy_close_question", "jeopardy_skip",
    "jeopardy_back_to_board", "jeopardy_end_round", "jeopardy_final_start",
    "jeopardy_final_mark", "jeopardy_final_reveal", "jeopardy_final_advance",
    "jeopardy_finish", "jeopardy_adjust_score",
}
PLAYER_ACTIONS = {"answer", "jeopardy_buzz", "jeopardy_buzz_answer", "jeopardy_final_bet", "jeopardy_final_answer"}


def public_room_state(room: dict) -> dict:
    """Never expose in-memory room credentials in a state broadcast."""
    return {key: value for key, value in room.items() if key not in {"_credentials", "_snapshot"}}


def _kahoot_score(correct: bool, elapsed_ms: int, total_ms: int, streak_before: int) -> tuple[int, int]:
    if not correct:
        return 0, 0
    ratio = max(0, 1 - elapsed_ms / max(1, total_ms))
    streak_after = streak_before + 1
    return 1000 + round(500 * ratio) + (0 if streak_after <= 1 else min(400, (streak_after - 1) * 100)), streak_after


async def send_error(websocket: WebSocket, error: str):
    await websocket.send_json({"type": "error", "error": error})


def room_identity(code: str, credential: str | None) -> dict | None:
    if not credential or code not in rooms:
        return None
    return rooms[code].get("_credentials", {}).get(credential)


def issue_credential(room: dict, role: str, player_id: str | None = None) -> tuple[str, dict]:
    credential = secrets.token_urlsafe(32)
    identity = {"role": role, "playerId": player_id}
    room["_credentials"][credential] = identity
    return credential, identity


async def cleanup_empty_room_after_grace(code: str):
    await asyncio.sleep(ROOM_RECONNECT_GRACE_SECONDS)
    if not connections.get(code):
        connections.pop(code, None)
        rooms.pop(code, None)
    room_cleanup_tasks.pop(code, None)


async def broadcast(code: str, message: dict):
    """Отправить сообщение всем в комнате."""
    if code not in connections:
        return
    if message.get("type") == "room_state" and isinstance(message.get("state"), dict):
        message = {**message, "state": public_room_state(message["state"])}
    dead = []
    for ws in connections[code]:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        connections[code].remove(ws)


@router.websocket("/ws/room/{code}")
async def room_websocket(websocket: WebSocket, code: str):
    await websocket.accept()

    identity = room_identity(code, websocket.query_params.get("credential"))
    cleanup_task = room_cleanup_tasks.pop(code, None)
    if cleanup_task:
        cleanup_task.cancel()

    if code not in connections:
        connections[code] = []
    connections[code].append(websocket)

    # Unbound sockets may join by room code, but do not receive live game state.
    if code in rooms:
        if identity:
            await websocket.send_json({"type": "room_state", "state": public_room_state(rooms[code])})
        else:
            await websocket.send_json({"type": "room_available"})

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "error",
                    "error": "Неверный формат сообщения",
                })
                continue

            if not isinstance(data, dict):
                await websocket.send_json({
                    "type": "error",
                    "error": "Неверный формат сообщения",
                })
                continue

            action = data.get("action")
            if not isinstance(action, str):
                await send_error(websocket, "Неизвестное действие комнаты")
                continue

            # ==================== ОБЩИЕ ДЕЙСТВИЯ ====================

            if action == "create_room":
                if code in rooms:
                    await send_error(websocket, "Комната с таким кодом уже существует")
                    continue
                game_kind = data.get("gameKind", "quiz")
                game_id = data.get("gameId", "")
                if game_kind not in {"quiz", "jeopardy", "millionaire"} or not isinstance(game_id, str) or not game_id:
                    await send_error(websocket, "Некорректные параметры комнаты")
                    continue
                try:
                    snapshot = verify_snapshot_token(data.get("snapshotToken"), game_id, game_kind)
                except ValueError as error:
                    await send_error(websocket, str(error))
                    continue
                rooms[code] = {
                    "code": code,
                    "gameKind": game_kind,
                    "gameId": game_id,
                    "hostId": f"host-{secrets.token_urlsafe(12)}",
                    "status": "waiting",
                    "questionIdx": 0,
                    "questionStartAt": None,
                    "players": [],
                    "fastestPlayerId": None,
                    "createdAt": int(time.time() * 1000),
                    "_credentials": {},
                    "_snapshot": snapshot,
                }
                credential, identity = issue_credential(rooms[code], "host")
                await websocket.send_json({"type": "room_identity", "credential": credential, "role": "host"})
                # Если Jeopardy — добавить начальное состояние
                if game_kind == "jeopardy":
                    rooms[code]["jeopardy"] = {
                        "phase": "lobby",
                        "mode": "buzz",
                        "round": 0,
                        "currentPlayerIdx": 0,
                        "usedKeys": [],
                        "selectedCat": None,
                        "selectedQ": None,
                        "buzzedPlayerId": None,
                        "buzzedPlayerIds": [],
                        "buzzedAnswer": None,
                        "buzzStartAt": None,
                        "buzzTimeoutMs": 30000,
                        "questionTotalMs": 30000,
                        "questionElapsedMs": 0,
                        "showAnswer": False,
                        "awaitingBonus": False,
                        "finalBets": {},
                        "finalAnswers": {},
                        "finalGiven": {},
                        "finalRevealOrder": [],
                        "finalRevealIdx": -1,
                        "finalRevealStep": "done",
                        "finalRevealAt": None,
                        "lastDelta": None,
                    }
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "join":
                if code not in rooms:
                    await send_error(websocket, "Комната не найдена")
                    continue
                if identity:
                    await send_error(websocket, "Игрок уже определён для этого соединения")
                    continue
                player_data = data.get("player")
                nickname = player_data.get("nickname", "").strip() if isinstance(player_data, dict) else ""
                avatar = player_data.get("avatar", "") if isinstance(player_data, dict) else ""
                if not nickname or len(nickname) > 64 or not isinstance(avatar, str):
                    await send_error(websocket, "Некорректные данные игрока")
                    continue
                player_id = f"player-{secrets.token_urlsafe(12)}"
                player = {"id": player_id, "nickname": nickname, "avatar": avatar, "score": 0, "streak": 0, "connected": True}
                rooms[code]["players"].append(player)
                credential, identity = issue_credential(rooms[code], "player", player_id)
                await websocket.send_json({"type": "room_identity", "credential": credential, "role": "player", "playerId": player_id})
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif code not in rooms:
                await send_error(websocket, "Комната не найдена")
                continue

            elif action in HOST_ACTIONS and (not identity or identity["role"] != "host"):
                await send_error(websocket, "Действие доступно только ведущему")
                continue

            elif action in PLAYER_ACTIONS and (not identity or identity["role"] != "player"):
                await send_error(websocket, "Действие доступно только игроку комнаты")
                continue

            elif action not in HOST_ACTIONS | PLAYER_ACTIONS:
                await send_error(websocket, "Неизвестное действие комнаты")
                continue

            elif action == "start":
                if code not in rooms:
                    continue
                rooms[code]["status"] = "active"
                rooms[code]["questionIdx"] = 0
                rooms[code]["questionStartAt"] = int(time.time() * 1000)
                for p in rooms[code]["players"]:
                    p["score"] = 0
                    p["streak"] = 0
                    p["lastAnswer"] = None
                    p["answerHistory"] = []
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "answer":
                player_id = identity["playerId"]
                player = next((p for p in rooms[code]["players"] if p["id"] == player_id), None)
                if player:
                    # Не даём ответить дважды на один вопрос
                    if player.get("lastAnswer") and player["lastAnswer"].get("questionIdx") == rooms[code].get("questionIdx"):
                        continue
                    questions = rooms[code]["_snapshot"]["data"].get("questions", [])
                    question_idx = rooms[code].get("questionIdx", 0)
                    question = questions[question_idx] if isinstance(questions, list) and question_idx < len(questions) else None
                    if not isinstance(question, dict):
                        await send_error(websocket, "Вопрос комнаты не найден")
                        continue
                    given = data.get("given", "")
                    given = given if isinstance(given, str) else ""
                    total_ms = max(1, int(question.get("time") or 30) * 1000)
                    started_at = rooms[code].get("questionStartAt") or int(time.time() * 1000)
                    elapsed_ms = max(0, min(total_ms, int(time.time() * 1000) - started_at))
                    correct = quiz_answer_is_correct(question, given)
                    delta, streak = _kahoot_score(correct, elapsed_ms, total_ms, int(player.get("streak", 0)))
                    player["lastAnswer"] = {
                        "questionIdx": question_idx,
                        "correct": correct,
                        "delta": delta,
                        "timeMs": elapsed_ms,
                        "given": given,
                    }
                    player["score"] = player.get("score", 0) + delta
                    player["streak"] = streak
                    # Добавить в историю
                    if "answerHistory" not in player:
                        player["answerHistory"] = []
                    player["answerHistory"] = [a for a in player["answerHistory"] if a["questionIdx"] != rooms[code].get("questionIdx")]
                    player["answerHistory"].append(player["lastAnswer"])
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "reveal":
                rooms[code]["status"] = "reveal"
                answered = [
                    p for p in rooms[code]["players"]
                    if p.get("lastAnswer", {}).get("questionIdx") == rooms[code].get("questionIdx")
                    and p["lastAnswer"].get("correct")
                ]
                fastest = min(answered, key=lambda p: p["lastAnswer"].get("timeMs", 0), default=None)
                rooms[code]["fastestPlayerId"] = fastest["id"] if fastest else None
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "leaderboard":
                if code in rooms:
                    rooms[code]["status"] = "leaderboard"
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "next_question":
                if code not in rooms:
                    continue
                rooms[code]["questionIdx"] += 1
                rooms[code]["status"] = "active"
                rooms[code]["questionStartAt"] = int(time.time() * 1000)
                rooms[code]["fastestPlayerId"] = None
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "finish":
                if code in rooms:
                    rooms[code]["status"] = "finished"
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "restart":
                if code in rooms:
                    rooms[code]["status"] = "waiting"
                    rooms[code]["questionIdx"] = 0
                    rooms[code]["questionStartAt"] = None
                    rooms[code]["fastestPlayerId"] = None
                    for p in rooms[code]["players"]:
                        p["score"] = 0
                        p["streak"] = 0
                        p["lastAnswer"] = None
                        p["answerHistory"] = []
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "kick":
                player_id = data.get("playerId")
                if code in rooms:
                    rooms[code]["players"] = [p for p in rooms[code]["players"] if p["id"] != player_id]
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "adjust_score":
                player_id = data.get("playerId")
                delta = data.get("delta", 0)
                if code in rooms:
                    player = next((p for p in rooms[code]["players"] if p["id"] == player_id), None)
                    if player:
                        player["score"] = max(0, player.get("score", 0) + delta)
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            # ==================== JEOPARDY ДЕЙСТВИЯ ====================

            elif action == "jeopardy_set_mode":
                if code in rooms and "jeopardy" in rooms[code]:
                    rooms[code]["jeopardy"]["mode"] = data.get("mode", "buzz")
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_start":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    j["phase"] = "board"
                    j["round"] = 0
                    j["usedKeys"] = []
                    j["currentPlayerIdx"] = 0
                    j["selectedCat"] = None
                    j["selectedQ"] = None
                    j["buzzedPlayerId"] = None
                    j["buzzedPlayerIds"] = []
                    j["showAnswer"] = False
                    j["lastDelta"] = None
                    rooms[code]["status"] = "active"
                    for p in rooms[code]["players"]:
                        p["score"] = 0
                        p["jCorrect"] = 0
                        p["jWrong"] = 0
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_select":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    j["selectedCat"] = data.get("catIdx")
                    j["selectedQ"] = data.get("qIdx")
                    j["buzzedPlayerId"] = None
                    j["buzzedPlayerIds"] = []
                    j["buzzedAnswer"] = None
                    j["buzzStartAt"] = None
                    j["awaitingBonus"] = False
                    j["showAnswer"] = False
                    j["phase"] = "question"
                    j["questionTotalMs"] = data.get("questionTotalMs", 30000)
                    j["questionElapsedMs"] = 0
                    rooms[code]["questionStartAt"] = data.get("questionStartAt")
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_buzz":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    if j["phase"] != "question":
                        await send_error(websocket, "Сейчас нельзя нажать на кнопку")
                        continue
                    player_id = identity["playerId"]
                    if player_id in j["buzzedPlayerIds"]:
                        await send_error(websocket, "Игрок уже отвечал на этот вопрос")
                        continue
                    j["buzzedPlayerId"] = player_id
                    j["buzzedAnswer"] = None
                    j["buzzStartAt"] = data.get("buzzStartAt")
                    j["phase"] = "answering"
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_buzz_answer":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    if j["buzzedPlayerId"] != identity["playerId"]:
                        await send_error(websocket, "Ответ может отправить только выбранный игрок")
                        continue
                    j["buzzedAnswer"] = data.get("given")
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_accept":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    correct = data.get("correct", False)
                    target_id = j["buzzedPlayerId"] if j["mode"] == "buzz" else rooms[code]["players"][j["currentPlayerIdx"]]["id"]
                    player = next((p for p in rooms[code]["players"] if p["id"] == target_id), None)

                    if player:
                        points = data.get("points", 0)
                        delta = points if correct else -points
                        player["score"] += delta
                        if correct:
                            player["jCorrect"] = (player.get("jCorrect", 0) + 1)
                        else:
                            player["jWrong"] = (player.get("jWrong", 0) + 1)
                        j["lastDelta"] = {"playerId": target_id, "delta": delta}

                    # TURN mode
                    if j["mode"] == "turn":
                        if correct:
                            j["currentPlayerIdx"] = (j["currentPlayerIdx"] + 1) % max(1, len(rooms[code]["players"]))
                            j["showAnswer"] = True
                            j["phase"] = "reveal"
                            key = f"{j['round']}-{j['selectedCat']}-{j['selectedQ']}"
                            if key not in j["usedKeys"]:
                                j["usedKeys"].append(key)
                        else:
                            j["awaitingBonus"] = True
                    # BUZZ mode
                    elif j["mode"] == "buzz":
                        if not correct:
                            if target_id and target_id not in j["buzzedPlayerIds"]:
                                j["buzzedPlayerIds"].append(target_id)
                            j["buzzedPlayerId"] = None
                            j["buzzedAnswer"] = None
                            j["buzzStartAt"] = None
                            j["phase"] = "question"
                            if len(j["buzzedPlayerIds"]) >= len(rooms[code]["players"]):
                                j["showAnswer"] = True
                                j["phase"] = "reveal"
                                key = f"{j['round']}-{j['selectedCat']}-{j['selectedQ']}"
                                if key not in j["usedKeys"]:
                                    j["usedKeys"].append(key)
                        else:
                            j["showAnswer"] = True
                            j["phase"] = "reveal"
                            key = f"{j['round']}-{j['selectedCat']}-{j['selectedQ']}"
                            if key not in j["usedKeys"]:
                                j["usedKeys"].append(key)
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_turn_wrong_finalize":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    j["awaitingBonus"] = False
                    j["currentPlayerIdx"] = (j["currentPlayerIdx"] + 1) % max(1, len(rooms[code]["players"]))
                    j["showAnswer"] = True
                    j["phase"] = "reveal"
                    key = f"{j['round']}-{j['selectedCat']}-{j['selectedQ']}"
                    if key not in j["usedKeys"]:
                        j["usedKeys"].append(key)
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_close_question":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    key = f"{j['round']}-{j['selectedCat']}-{j['selectedQ']}"
                    if key not in j["usedKeys"]:
                        j["usedKeys"].append(key)
                    j["showAnswer"] = True
                    j["phase"] = "reveal"
                    j["buzzedPlayerId"] = None
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_skip":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    key = f"{j['round']}-{j['selectedCat']}-{j['selectedQ']}"
                    if key not in j["usedKeys"]:
                        j["usedKeys"].append(key)
                    j["selectedCat"] = None
                    j["selectedQ"] = None
                    j["buzzedPlayerId"] = None
                    j["buzzedPlayerIds"] = []
                    j["showAnswer"] = False
                    j["phase"] = "board"
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_back_to_board":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    j["selectedCat"] = None
                    j["selectedQ"] = None
                    j["buzzedPlayerId"] = None
                    j["buzzedPlayerIds"] = []
                    j["showAnswer"] = False
                    j["lastDelta"] = None
                    j["phase"] = "board"
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_end_round":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    total_rounds = data.get("totalRounds", 1)
                    if j["round"] + 1 < total_rounds:
                        j["round"] += 1
                        j["usedKeys"] = []
                        j["selectedCat"] = None
                        j["selectedQ"] = None
                        j["buzzedPlayerId"] = None
                        j["showAnswer"] = False
                        j["phase"] = "board"
                    else:
                        j["phase"] = "final-bets"
                        j["finalBets"] = {}
                        j["finalAnswers"] = {}
                        j["finalGiven"] = {}
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_final_bet":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    player_id = identity["playerId"]
                    bet = data.get("bet", 0)
                    player = next((p for p in rooms[code]["players"] if p["id"] == player_id), None)
                    cap = max(0, player.get("score", 0)) if player else 0
                    j["finalBets"][player_id] = max(0, min(cap, int(bet)))
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_final_start":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    for p in rooms[code]["players"]:
                        if p["id"] not in j["finalBets"]:
                            j["finalBets"][p["id"]] = 0
                    j["phase"] = "final-question"
                    j["showAnswer"] = False
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_final_answer":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    j["finalGiven"][identity["playerId"]] = data.get("given", "")
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_final_mark":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    j["finalAnswers"][data.get("playerId")] = data.get("correct", False)
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_final_reveal":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    j["showAnswer"] = True
                    j["phase"] = "final-reveal"
                    players = rooms[code]["players"]
                    j["finalRevealOrder"] = [p["id"] for p in sorted(players, key=lambda x: x.get("score", 0))]
                    j["finalRevealIdx"] = -1
                    j["finalRevealStep"] = "done"
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_final_advance":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    if j["phase"] != "final-reveal":
                        continue
                    if j["finalRevealIdx"] < 0:
                        j["finalRevealIdx"] = 0
                        j["finalRevealStep"] = "bet"
                        continue

                    steps = ["bet", "answer", "score"]
                    cur = steps.index(j["finalRevealStep"]) if j["finalRevealStep"] in steps else -1
                    if cur >= 0 and cur < 2:
                        j["finalRevealStep"] = steps[cur + 1]
                        continue

                    # apply score
                    pid = j["finalRevealOrder"][j["finalRevealIdx"]]
                    player = next((p for p in rooms[code]["players"] if p["id"] == pid), None)
                    if player:
                        bet = j["finalBets"].get(pid, 0)
                        ok = j["finalAnswers"].get(pid, False)
                        delta = bet if ok else -bet
                        player["score"] += delta
                        j["lastDelta"] = {"playerId": pid, "delta": delta}

                    if j["finalRevealIdx"] + 1 >= len(j["finalRevealOrder"]):
                        j["finalRevealStep"] = "done"
                    else:
                        j["finalRevealIdx"] += 1
                        j["finalRevealStep"] = "bet"
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_finish":
                if code in rooms and "jeopardy" in rooms[code]:
                    rooms[code]["jeopardy"]["phase"] = "podium"
                    rooms[code]["status"] = "finished"
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_adjust_score":
                player_id = data.get("playerId")
                delta = data.get("delta", 0)
                if code in rooms:
                    player = next((p for p in rooms[code]["players"] if p["id"] == player_id), None)
                    if player:
                        player["score"] += delta
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

    except WebSocketDisconnect:
        pass
    finally:
        connections[code] = [ws for ws in connections.get(code, []) if ws != websocket]
        if not connections.get(code):
            connections.pop(code, None)
            # C2 reconnect bridge: keep only in-memory identity/state briefly.
            # D4 persistence and restart recovery remain explicitly out of scope.
            room_cleanup_tasks[code] = asyncio.create_task(cleanup_empty_room_after_grace(code))
