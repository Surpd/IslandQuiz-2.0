import json
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["rooms"])

# Хранилище комнат и соединений (в памяти)
rooms: dict[str, dict] = {}
connections: dict[str, list[WebSocket]] = {}


async def broadcast(code: str, message: dict):
    """Отправить сообщение всем в комнате."""
    if code not in connections:
        return
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

    if code not in connections:
        connections[code] = []
    connections[code].append(websocket)

    # Отправить текущее состояние комнаты новому игроку
    if code in rooms:
        await websocket.send_json({"type": "room_state", "state": rooms[code]})

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            action = data.get("action")

            # ==================== ОБЩИЕ ДЕЙСТВИЯ ====================

            if action == "create_room":
                game_kind = data.get("gameKind", "quiz")
                game_id = data.get("gameId", "")
                rooms[code] = {
                    "code": code,
                    "gameKind": game_kind,
                    "gameId": game_id,
                    "hostId": data.get("hostId", ""),
                    "status": "waiting",
                    "questionIdx": 0,
                    "questionStartAt": None,
                    "players": [],
                    "fastestPlayerId": None,
                    "createdAt": data.get("createdAt", 0),
                }
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
                player = data.get("player")
                if code not in rooms:
                    await websocket.send_json({"type": "error", "error": "Комната не найдена"})
                    continue
                # Проверяем дубликат по нику
                existing = next((p for p in rooms[code]["players"] if p["nickname"] == player["nickname"]), None)
                if existing:
                    existing["connected"] = True
                    existing["avatar"] = player.get("avatar", existing.get("avatar", ""))
                else:
                    rooms[code]["players"].append(player)
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "start":
                if code not in rooms:
                    continue
                rooms[code]["status"] = "active"
                rooms[code]["questionIdx"] = 0
                rooms[code]["questionStartAt"] = data.get("questionStartAt")
                for p in rooms[code]["players"]:
                    p["score"] = 0
                    p["streak"] = 0
                    p["lastAnswer"] = None
                    p["answerHistory"] = []
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "answer":
                player_id = data.get("playerId")
                if code not in rooms:
                    continue
                player = next((p for p in rooms[code]["players"] if p["id"] == player_id), None)
                if player:
                    # Не даём ответить дважды на один вопрос
                    if player.get("lastAnswer") and player["lastAnswer"].get("questionIdx") == rooms[code].get("questionIdx"):
                        continue
                    player["lastAnswer"] = {
                        "questionIdx": rooms[code].get("questionIdx", 0),
                        "correct": data.get("correct"),
                        "delta": data.get("delta", 0),
                        "timeMs": data.get("timeMs", 0),
                        "given": data.get("given", ""),
                    }
                    player["score"] = (player.get("score", 0) + data.get("delta", 0))
                    player["streak"] = data.get("streak", 0)
                    # Добавить в историю
                    if "answerHistory" not in player:
                        player["answerHistory"] = []
                    player["answerHistory"] = [a for a in player["answerHistory"] if a["questionIdx"] != rooms[code].get("questionIdx")]
                    player["answerHistory"].append(player["lastAnswer"])
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "reveal":
                if code not in rooms:
                    continue
                rooms[code]["status"] = "reveal"
                rooms[code]["fastestPlayerId"] = data.get("fastestPlayerId")
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
                rooms[code]["questionStartAt"] = data.get("questionStartAt")
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
                    j["buzzedPlayerId"] = data.get("playerId")
                    j["buzzedAnswer"] = None
                    j["buzzStartAt"] = data.get("buzzStartAt")
                    j["phase"] = "answering"
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_buzz_answer":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
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
                    player_id = data.get("playerId")
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
                    j["finalGiven"][data.get("playerId")] = data.get("given", "")
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
            rooms.pop(code, None)   