import asyncio
import copy
import json
import secrets
import time
import uuid
import hashlib
import hmac
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from services.trusted_scoring import quiz_answer_is_correct, verify_snapshot_token

router = APIRouter(tags=["rooms"])

# Хранилище комнат и соединений (в памяти)
rooms: dict[str, dict] = {}
connections: dict[str, list[WebSocket]] = {}
connection_identities: dict[int, dict] = {}
room_cleanup_tasks: dict[str, asyncio.Task] = {}
ROOM_RECONNECT_GRACE_SECONDS = 60
ROOM_PERSISTENCE_TTL_SECONDS = 30 * 60
ROOM_TABLE = "online_rooms"
MAX_ROOM_MESSAGE_BYTES = 16 * 1024
# create_room carries the signed snapshot, which can be much larger than actions.
MAX_ROOM_CREATE_MESSAGE_BYTES = 256 * 1024
MAX_ANSWER_LENGTH = 2000
ROOM_RESULT_DB_ERROR = "Не удалось сохранить результат комнаты"
ROOM_THEMES = frozenset({"classic", "amber", "ocean", "forest", "midnight"})


def _room_theme(value: object) -> str:
    if value == "color-cloud":
        return "classic"
    return value if isinstance(value, str) and value in ROOM_THEMES else "classic"

HOST_ACTIONS = {
    "start", "timeout", "reveal", "leaderboard", "next_question", "finish", "restart", "kick", "adjust_score",
    "jeopardy_set_mode", "jeopardy_start", "jeopardy_select", "jeopardy_accept",
    "jeopardy_turn_wrong_finalize", "jeopardy_close_question", "jeopardy_skip",
    "jeopardy_back_to_board", "jeopardy_end_round", "jeopardy_final_start",
    "jeopardy_final_mark", "jeopardy_final_reveal", "jeopardy_final_advance",
    "jeopardy_finish", "jeopardy_adjust_score",
}
PLAYER_ACTIONS = {"answer", "answer_draft", "jeopardy_buzz", "jeopardy_buzz_answer", "jeopardy_final_bet", "jeopardy_final_answer"}


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def validate_quiz_action(room: dict, action: str, data: dict, identity: dict | None) -> str | None:
    """Reject malformed or out-of-order Quiz actions before mutating room state."""
    if room.get("gameKind") != "quiz":
        return None

    status = room.get("status")
    questions = room.get("_snapshot", {}).get("data", {}).get("questions", [])
    question_idx = room.get("questionIdx")
    question_count = len(questions) if isinstance(questions, list) else 0

    question = _quiz_question(room)
    deadline_ms = _quiz_deadline_ms(room, question)
    now_ms = int(time.time() * 1000)

    if action == "start" and status != "waiting":
        return "Игру можно начать только из лобби"
    if action == "answer_draft":
        if status != "active" or question is None:
            return "Сейчас нельзя сохранять выбор"
        given = data.get("given", "")
        if not isinstance(given, str) or len(given) > MAX_ANSWER_LENGTH or not _valid_quiz_draft(question, given):
            return "Некорректный текущий выбор"
        if deadline_ms is not None and now_ms >= deadline_ms:
            return "Время вышло"
    if action == "answer":
        if status != "active":
            return "Сейчас нельзя отвечать"
        if not _is_int(question_idx) or question_idx < 0 or question_idx >= question_count:
            return "Вопрос комнаты не найден"
        given = data.get("given", "")
        if not isinstance(given, str) or len(given) > MAX_ANSWER_LENGTH:
            return "Некорректный ответ"
        if not isinstance(data.get("timedOut", False), bool):
            return "Некорректный статус таймера"
        player_id = identity.get("playerId") if identity else None
        player = next((p for p in room.get("players", []) if p.get("id") == player_id), None)
        if player and (player.get("lastAnswer") or {}).get("questionIdx") == question_idx:
            return "На этот вопрос уже отвечали"
        draft = _quiz_draft(player, question_idx, deadline_ms) if player else None
        if deadline_ms is not None and now_ms >= deadline_ms and draft is None and not (data.get("timedOut") and given == ""):
            return "Время вышло"
    elif action == "timeout":
        if status != "active":
            return "Время уже остановлено"
        if deadline_ms is None or now_ms < deadline_ms:
            return "Время ещё не вышло"
    elif action == "reveal" and status not in {"active", "timeout"}:
        return "Ответы можно открыть только после вопроса"
    elif action == "leaderboard" and status != "reveal":
        return "Таблицу лидеров можно открыть после ответов"
    elif action == "next_question":
        if status != "leaderboard":
            return "Следующий вопрос недоступен на этой фазе"
        if not _is_int(question_idx) or question_idx + 1 >= question_count:
            return "Следующего вопроса нет"
    elif action == "finish" and status not in {"active", "timeout", "reveal", "leaderboard"}:
        return "Игру нельзя завершить на этой фазе"
    elif action == "restart" and status != "finished":
        return "Перезапуск доступен после завершения игры"
    elif action == "kick":
        player_id = data.get("playerId")
        if not isinstance(player_id, str) or not any(p.get("id") == player_id for p in room.get("players", [])):
            return "Игрок комнаты не найден"

    return None


def validate_jeopardy_action(room: dict, action: str, data: dict, identity: dict | None) -> str | None:
    """Reject malformed or out-of-order Jeopardy actions before state mutation."""
    if room.get("gameKind") != "jeopardy":
        return "Действие доступно только для Jeopardy"
    j = room.get("jeopardy")
    if not isinstance(j, dict):
        return "Состояние Jeopardy не найдено"

    phase = j.get("phase")
    players = room.get("players", [])
    player_ids = {player.get("id") for player in players if isinstance(player, dict)}
    rounds = room.get("_snapshot", {}).get("data", {}).get("rounds", [])
    round_idx = j.get("round")
    current_round = rounds[round_idx] if isinstance(rounds, list) and _is_int(round_idx) and 0 <= round_idx < len(rounds) else None

    if action == "jeopardy_set_mode":
        if phase not in {"lobby", "board"} or data.get("mode") not in {"buzz", "turn"}:
            return "Режим Jeopardy недоступен на этой фазе"
    elif action == "jeopardy_start":
        if phase != "lobby":
            return "Игру Jeopardy можно начать только из лобби"
    elif action == "jeopardy_select":
        cat_idx, q_idx = data.get("catIdx"), data.get("qIdx")
        if phase != "board" or not _is_int(cat_idx) or not _is_int(q_idx):
            return "Вопрос Jeopardy недоступен на этой фазе"
        if not isinstance(current_round, list) or cat_idx < 0 or cat_idx >= len(current_round):
            return "Некорректная категория Jeopardy"
        category = current_round[cat_idx]
        questions = category.get("questions", []) if isinstance(category, dict) else []
        if not isinstance(questions, list) or q_idx < 0 or q_idx >= len(questions):
            return "Некорректный вопрос Jeopardy"
        if f"{round_idx}-{cat_idx}-{q_idx}" in (j.get("usedKeys") or []):
            return "Вопрос Jeopardy уже использован"
        total_ms, start_at = data.get("questionTotalMs"), data.get("questionStartAt")
        if not _is_int(total_ms) or total_ms < 5000 or total_ms > 300000 or not _is_int(start_at):
            return "Некорректные параметры таймера"
    elif action == "jeopardy_buzz":
        player_id = identity.get("playerId") if identity else None
        if phase != "question" or j.get("mode") != "buzz":
            return "Сейчас нельзя нажать на кнопку"
        if player_id in (j.get("buzzedPlayerIds") or []):
            return "Игрок уже отвечал на этот вопрос"
        if not _is_int(data.get("buzzStartAt")):
            return "Некорректное время ответа"
    elif action == "jeopardy_buzz_answer":
        given = data.get("given")
        if phase != "answering" or j.get("buzzedPlayerId") != (identity or {}).get("playerId"):
            return "Ответ может отправить только выбранный игрок"
        if not isinstance(given, str) or not given.strip() or len(given) > MAX_ANSWER_LENGTH:
            return "Некорректный ответ Jeopardy"
        if j.get("buzzedAnswer") is not None:
            return "Ответ на этот вопрос уже отправлен"
    elif action == "jeopardy_accept":
        expected_phase = "answering" if j.get("mode") == "buzz" else "question"
        if phase != expected_phase or not isinstance(data.get("correct"), bool):
            return "Оценка ответа недоступна на этой фазе"
    elif action == "jeopardy_turn_wrong_finalize":
        if phase != "answering" or j.get("mode") != "turn" or not j.get("awaitingBonus"):
            return "Нельзя завершить неверный ответ на этой фазе"
    elif action in {"jeopardy_close_question", "jeopardy_skip", "jeopardy_back_to_board"}:
        if phase not in {"question", "answering", "reveal"}:
            return "Действие над вопросом недоступно на этой фазе"
        if j.get("selectedCat") is None or j.get("selectedQ") is None:
            return "Вопрос Jeopardy не выбран"
    elif action == "jeopardy_end_round":
        total_rounds = data.get("totalRounds")
        if phase != "board" or not _is_int(total_rounds) or total_rounds < 1 or total_rounds > len(rounds):
            return "Раунд Jeopardy нельзя завершить сейчас"
    elif action == "jeopardy_final_bet":
        player_id = (identity or {}).get("playerId")
        bet = data.get("bet")
        player = next((item for item in players if item.get("id") == player_id), None)
        if phase != "final-bets" or player_id not in player_ids or not _is_int(bet) or bet < 0:
            return "Ставка Jeopardy недоступна на этой фазе"
        if player is not None and bet > max(0, int(player.get("score", 0))):
            return "Ставка не может превышать счёт игрока"
        if player_id in (j.get("finalBets") or {}):
            return "Ставка игрока уже отправлена"
    elif action == "jeopardy_final_start":
        if phase != "final-bets":
            return "Финальный вопрос ещё недоступен"
    elif action == "jeopardy_final_answer":
        given = data.get("given")
        player_id = (identity or {}).get("playerId")
        if phase != "final-question" or player_id not in player_ids:
            return "Финальный ответ недоступен на этой фазе"
        if not isinstance(given, str) or not given.strip() or len(given) > MAX_ANSWER_LENGTH:
            return "Некорректный финальный ответ"
        if player_id in (j.get("finalGiven") or {}):
            return "Финальный ответ уже отправлен"
    elif action == "jeopardy_final_mark":
        if phase != "final-question" or data.get("playerId") not in player_ids or not isinstance(data.get("correct"), bool):
            return "Оценка финального ответа недоступна на этой фазе"
        if data["playerId"] not in (j.get("finalGiven") or {}):
            return "Игрок ещё не отправил финальный ответ"
        if data["playerId"] in (j.get("finalAnswers") or {}):
            return "Финальный ответ уже оценён"
    elif action == "jeopardy_final_reveal":
        if phase != "final-question" or not all(player_id in (j.get("finalAnswers") or {}) for player_id in player_ids):
            return "Сначала нужно оценить все финальные ответы"
    elif action == "jeopardy_final_advance":
        if phase != "final-reveal":
            return "Финальная таблица ещё не открыта"
    elif action == "jeopardy_finish":
        if phase != "final-reveal" or j.get("finalRevealStep") != "done":
            return "Jeopardy нельзя завершить на этой фазе"
    elif action == "jeopardy_adjust_score":
        player_id, delta = data.get("playerId"), data.get("delta")
        if phase not in {"board", "answering", "reveal"} or player_id not in player_ids or not _is_int(delta) or abs(delta) > 1000000:
            return "Некорректная корректировка счёта"

    return None


def public_room_state(room: dict, identity: dict | None = None) -> dict:
    """Return role-scoped state without credentials, drafts, or premature feedback."""
    state = {key: value for key, value in room.items() if key not in {"_credentials", "_credential_hashes", "_snapshot"}}
    current_idx = room.get("questionIdx")
    can_reveal = room.get("status") in {"reveal", "leaderboard", "finished"}
    is_player = identity and identity.get("role") == "player"
    players = []
    own_answer_submitted = False
    own_draft = None
    for player in room.get("players", []):
        if not isinstance(player, dict):
            continue
        item = {key: value for key, value in player.items() if key not in {"currentAnswer", "answerHistory"}}
        is_own = is_player and player.get("id") == identity.get("playerId")
        if is_player:
            if is_own and can_reveal:
                if isinstance(player.get("lastAnswer"), dict):
                    item["lastAnswer"] = copy.deepcopy(player["lastAnswer"])
            else:
                item.pop("lastAnswer", None)
            draft = player.get("currentAnswer")
            if is_own and isinstance(draft, dict) and draft.get("questionIdx") == current_idx:
                own_draft = draft.get("given") if isinstance(draft.get("given"), str) else None
            own_answer_submitted = own_answer_submitted or (
                is_own and isinstance(player.get("lastAnswer"), dict)
                and player["lastAnswer"].get("questionIdx") == current_idx
            )
        else:
            if "lastAnswer" in player:
                item["lastAnswer"] = copy.deepcopy(player["lastAnswer"])
        players.append(item)
    state["players"] = players
    if is_player:
        state["playerAnswerSubmitted"] = own_answer_submitted
        state["playerAnswerDraft"] = own_draft
    return state


def public_room_snapshot(room: dict, identity: dict | None = None) -> dict | None:
    """Return only the selected runtime game data, never the editor variants."""
    snapshot = room.get("_snapshot")
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("data"), dict):
        return None
    data = copy.deepcopy({key: value for key, value in snapshot["data"].items() if key != "variants"})
    if identity and identity.get("role") == "player" and snapshot.get("kind") == "quiz":
        current_idx = room.get("questionIdx")
        can_reveal = room.get("status") in {"reveal", "leaderboard", "finished"}
        questions = data.get("questions", [])
        source_questions = snapshot["data"].get("questions", [])
        for index, question in enumerate(questions if isinstance(questions, list) else []):
            if not isinstance(question, dict):
                continue
            source = source_questions[index] if isinstance(source_questions, list) and index < len(source_questions) and isinstance(source_questions[index], dict) else question
            if not (can_reveal and index == current_idx):
                question.pop("answer", None)
                question["answer"] = ""
                if question.get("type") == "matching":
                    raw_pairs = source.get("answer", "")
                    try:
                        pairs = json.loads(raw_pairs or "[]")
                    except (TypeError, ValueError, json.JSONDecodeError):
                        pairs = []
                    display = question.get("display") if isinstance(question.get("display"), dict) else {}
                    matching = display.get("matching") if isinstance(display.get("matching"), dict) else {}
                    left = matching.get("left") if isinstance(matching.get("left"), list) else []
                    right = matching.get("right") if isinstance(matching.get("right"), list) else []
                    if not left or not right:
                        left = [pair.get("left") for pair in pairs if isinstance(pair, dict) and isinstance(pair.get("left"), str)]
                        right = [pair.get("right") for pair in pairs if isinstance(pair, dict) and isinstance(pair.get("right"), str)]
                    question["display"] = {"matching": {"left": left, "right": right}}
                elif question.get("type") == "ordering":
                    display = question.get("display") if isinstance(question.get("display"), dict) else {}
                    values = display.get("ordering") if isinstance(display.get("ordering"), list) else []
                    if not values:
                        try:
                            values = json.loads(source.get("answer", "[]") or "[]")
                        except (TypeError, ValueError, json.JSONDecodeError):
                            values = []
                    values = [value for value in values if isinstance(value, str) and value.strip()]
                    question["display"] = {"ordering": values[1:] + values[:1] if len(values) > 1 else values}
    if identity and identity.get("role") == "player" and snapshot.get("kind") == "jeopardy":
        for round_data in data.get("rounds", []):
            for category in round_data if isinstance(round_data, list) else []:
                for question in category.get("questions", []) if isinstance(category, dict) else []:
                    if isinstance(question, dict):
                        question["a"] = ""
        if isinstance(data.get("final"), dict):
            data["final"]["a"] = ""
    return {
        "gameId": snapshot.get("gameId"),
        "kind": snapshot.get("kind"),
        "data": data,
    }


async def send_room_snapshot(websocket: WebSocket, room: dict, identity: dict | None = None) -> None:
    snapshot = public_room_snapshot(room, identity)
    if snapshot is not None:
        await websocket.send_json({"type": "room_snapshot", "snapshot": snapshot})


def _credential_digest(credential: str) -> str:
    from routes.auth import SECRET_KEY

    return hmac.new(
        SECRET_KEY.encode("utf-8"),
        credential.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _jeopardy_answer(room: dict, j: dict) -> str:
    snapshot = room.get("_snapshot")
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("data"), dict):
        return ""
    snapshot = snapshot["data"]
    if j.get("selectedCat") is not None and j.get("selectedQ") is not None:
        try:
            question = snapshot["rounds"][j["round"]][j["selectedCat"]]["questions"][j["selectedQ"]]
            return question.get("a", "") if isinstance(question, dict) else ""
        except (IndexError, KeyError, TypeError):
            return ""
    return ""


def _room_persistence_state(room: dict) -> dict:
    state = {
        key: value
        for key, value in room.items()
        if key != "_credential_hashes"
    }
    state["_credentials"] = dict(room.get("_credential_hashes", {}))
    return state


def _persist_room_state(room: dict) -> bool:
    """Persist resumable state without storing raw reconnect credentials."""
    from database import supabase

    payload = {
        "code": room["code"],
        "game_kind": room["gameKind"],
        "game_id": room["gameId"],
        "state": _room_persistence_state(room),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (
            datetime.now(timezone.utc)
            + timedelta(seconds=ROOM_PERSISTENCE_TTL_SECONDS)
        ).isoformat(),
    }
    try:
        response = supabase.table(ROOM_TABLE).upsert(payload).execute()
    except Exception:
        return False
    return response is not None


def _load_persisted_room(code: str) -> dict | None:
    from database import supabase

    try:
        response = (
            supabase
            .table(ROOM_TABLE)
            .select("state,expires_at")
            .eq("code", code)
            .gt("expires_at", datetime.now(timezone.utc).isoformat())
            .limit(1)
            .execute()
        )
    except Exception:
        return None
    rows = getattr(response, "data", None)
    if not isinstance(rows, list) or not rows or not isinstance(rows[0], dict):
        return None
    state = rows[0].get("state")
    if not isinstance(state, dict):
        return None
    persisted_credentials = state.get("_credentials", {})
    if not isinstance(persisted_credentials, dict):
        return None
    state = dict(state)
    state["theme"] = _room_theme(state.get("theme"))
    state["_credentials"] = {}
    state["_credential_hashes"] = persisted_credentials
    return state


def _delete_persisted_room(code: str) -> None:
    from database import supabase

    try:
        supabase.table(ROOM_TABLE).delete().eq("code", code).execute()
    except Exception:
        return


def _kahoot_score(correct: bool, elapsed_ms: int, total_ms: int, streak_before: int) -> tuple[int, int]:
    if not correct:
        return 0, 0
    ratio = max(0, 1 - elapsed_ms / max(1, total_ms))
    streak_after = streak_before + 1
    return 1000 + round(500 * ratio) + (0 if streak_after <= 1 else min(400, (streak_after - 1) * 100)), streak_after


def _quiz_question(room: dict) -> dict | None:
    questions = room.get("_snapshot", {}).get("data", {}).get("questions", [])
    question_idx = room.get("questionIdx")
    if not isinstance(questions, list) or not _is_int(question_idx) or question_idx < 0 or question_idx >= len(questions):
        return None
    question = questions[question_idx]
    return question if isinstance(question, dict) else None


def _quiz_deadline_ms(room: dict, question: dict | None) -> int | None:
    started_at = room.get("questionStartAt")
    if not _is_int(started_at) or not isinstance(question, dict):
        return None
    return started_at + max(1, int(question.get("time") or 30)) * 1000


def _valid_quiz_draft(question: dict, given: str) -> bool:
    if not given.strip():
        return True
    if question.get("type") == "choice":
        options = question.get("options", [])
        return isinstance(options, list) and given in options
    if question.get("type") == "bool":
        return given in {"true", "false"}
    if question.get("type") == "text":
        return True
    try:
        parsed = json.loads(given)
    except (TypeError, ValueError, json.JSONDecodeError):
        return False
    if question.get("type") == "matching":
        try:
            expected = json.loads(question.get("answer") or "[]")
        except (TypeError, ValueError, json.JSONDecodeError):
            return False
        pairs = expected if isinstance(expected, list) else []
        lefts = {pair.get("left") for pair in pairs if isinstance(pair, dict)}
        rights = {pair.get("right") for pair in pairs if isinstance(pair, dict)}
        return isinstance(parsed, dict) and all(
            left in lefts and right in rights
            for left, right in parsed.items()
        ) and len(set(parsed.values())) == len(parsed) and all(
            isinstance(left, str) and isinstance(right, str)
            for left, right in parsed.items()
        )
    if question.get("type") in {"close", "ordering"}:
        try:
            expected = json.loads(question.get("answer") or "[]")
        except (TypeError, ValueError, json.JSONDecodeError):
            return False
        if not isinstance(parsed, list) or not isinstance(expected, list) or len(parsed) != len(expected):
            return False
        if not all(isinstance(item, str) for item in parsed):
            return False
        return question.get("type") == "close" or sorted(parsed) == sorted(expected)
    return False


def _quiz_draft(player: dict, question_idx: int, deadline_ms: int | None) -> dict | None:
    draft = player.get("currentAnswer")
    if not isinstance(draft, dict) or draft.get("questionIdx") != question_idx:
        return None
    received_at = draft.get("receivedAt")
    given = draft.get("given")
    if not _is_int(received_at) or not isinstance(given, str):
        return None
    if not given.strip():
        return None
    if deadline_ms is not None and received_at > deadline_ms:
        return None
    return draft


def _finalize_quiz_answer(room: dict, player: dict, given: str, received_at: int) -> None:
    question = _quiz_question(room)
    question_idx = room.get("questionIdx")
    if not isinstance(question, dict) or not _is_int(question_idx):
        return
    total_ms = max(1, int(question.get("time") or 30) * 1000)
    started_at = room.get("questionStartAt") if _is_int(room.get("questionStartAt")) else received_at
    elapsed_ms = max(0, min(total_ms, received_at - started_at))
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
    history = player.setdefault("answerHistory", [])
    player["answerHistory"] = [answer for answer in history if answer.get("questionIdx") != question_idx]
    player["answerHistory"].append(player["lastAnswer"])
    player.pop("currentAnswer", None)


def _finalize_quiz_drafts(room: dict) -> None:
    question_idx = room.get("questionIdx")
    question = _quiz_question(room)
    if not _is_int(question_idx) or not isinstance(question, dict):
        return
    deadline_ms = _quiz_deadline_ms(room, question)
    for player in room.get("players", []):
        if not isinstance(player, dict) or (player.get("lastAnswer") or {}).get("questionIdx") == question_idx:
            continue
        draft = _quiz_draft(player, question_idx, deadline_ms)
        if draft:
            _finalize_quiz_answer(room, player, draft["given"], draft["receivedAt"])


def _room_db_insert(query):
    try:
        return query.execute()
    except Exception:
        return None


def _persist_room_result(room: dict) -> bool:
    if room.get("_resultSaved"):
        return True
    from database import supabase
    from services.trusted_scoring import result_payload

    snapshot = room["_snapshot"]
    if room["gameKind"] == "quiz":
        questions = snapshot["data"].get("questions", [])
        players = []
        for player in room["players"]:
            answers = player.get("answerHistory", [])
            players.append({
                "id": player["id"], "nickname": player["nickname"], "avatar": player.get("avatar", ""),
                "score": player.get("score", 0), "correctCount": sum(1 for answer in answers if answer.get("correct")),
                "totalQuestions": len(questions), "maxScore": sum(max(0, int(question.get("points") or 0)) for question in questions if isinstance(question, dict)),
                "answers": answers,
            })
        response = _room_db_insert(supabase.table("online_quiz_results").insert({
            "id": str(uuid.uuid4()), "game_id": room["gameId"], "room_code": room["code"],
            "played_at": datetime.now(timezone.utc).isoformat(),
            "duration_sec": max(0, int((time.time() * 1000 - room["createdAt"]) / 1000)),
            "players": result_payload(snapshot, players),
        }))
    elif room["gameKind"] == "jeopardy":
        j = room["jeopardy"]
        teams = [{"id": player["id"], "name": player["nickname"], "score": player.get("score", 0), "correct": player.get("jCorrect", 0), "wrong": player.get("jWrong", 0)} for player in room["players"]]
        winner = max(teams, key=lambda team: team["score"], default=None)
        response = _room_db_insert(supabase.table("jeopardy_results").insert({
            "id": str(uuid.uuid4()), "game_id": room["gameId"],
            "played_at": datetime.now(timezone.utc).isoformat(),
            "teams": result_payload(snapshot, teams, decisions=j.get("decisions", [])),
            "winner_id": winner["id"] if winner else None, "has_final": bool(j.get("finalBets")),
        }))
    else:
        return False
    if response is None or not isinstance(getattr(response, "data", None), list) or not response.data:
        return False
    room["_resultSaved"] = True
    return True


async def send_error(websocket: WebSocket, error: str):
    await websocket.send_json({"type": "error", "error": error})


def room_identity(code: str, credential: str | None) -> dict | None:
    if not credential or code not in rooms:
        return None
    room = rooms[code]
    identity = room.get("_credentials", {}).get(credential)
    if identity:
        return identity
    identity = room.get("_credential_hashes", {}).get(_credential_digest(credential))
    if identity:
        room.setdefault("_credentials", {})[credential] = identity
    return identity


def issue_credential(room: dict, role: str, player_id: str | None = None) -> tuple[str, dict]:
    credential = secrets.token_urlsafe(32)
    identity = {"role": role, "playerId": player_id}
    room.setdefault("_credential_hashes", {})[_credential_digest(credential)] = identity
    room["_credentials"][credential] = identity
    return credential, identity


async def cleanup_empty_room_after_grace(code: str):
    await asyncio.sleep(ROOM_RECONNECT_GRACE_SECONDS)
    if not connections.get(code):
        connections.pop(code, None)
        rooms.pop(code, None)
        _delete_persisted_room(code)
    room_cleanup_tasks.pop(code, None)


async def broadcast(code: str, message: dict):
    """Отправить сообщение всем в комнате."""
    if code not in connections:
        return
    dead = []
    for ws in connections[code]:
        try:
            identity = connection_identities.get(id(ws))
            outgoing = message
            if message.get("type") == "room_state" and isinstance(message.get("state"), dict):
                _persist_room_state(rooms[code])
                outgoing = {**message, "state": public_room_state(message["state"], identity)}
            await ws.send_json(outgoing)
            if message.get("type") == "room_state":
                await send_room_snapshot(ws, rooms[code], identity)
        except Exception:
            dead.append(ws)
    for ws in dead:
        connections[code].remove(ws)


@router.websocket("/ws/room/{code}")
async def room_websocket(websocket: WebSocket, code: str):
    await websocket.accept()

    if code not in rooms:
        recovered_room = _load_persisted_room(code)
        if recovered_room:
            rooms[code] = recovered_room

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
            connection_identities[id(websocket)] = identity
            await websocket.send_json({"type": "room_state", "state": public_room_state(rooms[code], identity)})
            if identity.get("role") == "host":
                answers_credential, _ = issue_credential(rooms[code], "answers")
                await websocket.send_json({"type": "room_identity", "role": "host", "answersCredential": answers_credential})
            await send_room_snapshot(websocket, rooms[code], identity)
        else:
            await websocket.send_json({"type": "room_available"})

    try:
        while True:
            raw = await websocket.receive_text()
            raw_size = len(raw.encode("utf-8"))
            if raw_size > MAX_ROOM_CREATE_MESSAGE_BYTES:
                await send_error(websocket, "Сообщение комнаты слишком большое")
                continue
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
            if raw_size > MAX_ROOM_MESSAGE_BYTES and action != "create_room":
                await send_error(websocket, "Сообщение комнаты слишком большое")
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
                    "theme": _room_theme(data.get("theme")),
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
                answers_credential, _ = issue_credential(rooms[code], "answers")
                await websocket.send_json({"type": "room_identity", "credential": credential, "role": "host", "answersCredential": answers_credential})
                connection_identities[id(websocket)] = identity
                await send_room_snapshot(websocket, rooms[code], identity)
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
                        "revealedAnswer": None,
                        "decisions": [],
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
                connection_identities[id(websocket)] = identity
                await websocket.send_json({"type": "room_identity", "credential": credential, "role": "player", "playerId": player_id})
                await send_room_snapshot(websocket, rooms[code], identity)
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

            validation_error = validate_quiz_action(rooms[code], action, data, identity)
            if not validation_error and action.startswith("jeopardy_"):
                validation_error = validate_jeopardy_action(rooms[code], action, data, identity)
            if validation_error:
                await send_error(websocket, validation_error)
                continue

            if action == "start":
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
                    p.pop("currentAnswer", None)
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "answer_draft":
                player_id = identity["playerId"]
                player = next((p for p in rooms[code]["players"] if p["id"] == player_id), None)
                if player:
                    if data["given"].strip():
                        player["currentAnswer"] = {
                            "questionIdx": rooms[code]["questionIdx"],
                            "given": data["given"],
                            "receivedAt": int(time.time() * 1000),
                        }
                    else:
                        player.pop("currentAnswer", None)
                await websocket.send_json({
                    "type": "answer_draft_saved",
                    "questionIdx": rooms[code]["questionIdx"],
                })

            elif action == "answer":
                player_id = identity["playerId"]
                player = next((p for p in rooms[code]["players"] if p["id"] == player_id), None)
                if player:
                    question_idx = rooms[code].get("questionIdx", 0)
                    question = _quiz_question(rooms[code])
                    if not isinstance(question, dict):
                        await send_error(websocket, "Вопрос комнаты не найден")
                        continue
                    draft = _quiz_draft(player, question_idx, _quiz_deadline_ms(rooms[code], question))
                    received_at = int(time.time() * 1000)
                    if draft:
                        given = draft["given"]
                        received_at = draft["receivedAt"]
                    else:
                        given = data.get("given", "")
                        given = given if isinstance(given, str) else ""
                    if not draft and (not given or (question.get("type") == "text" and not given.strip())):
                        if data.get("timedOut") and _quiz_deadline_ms(rooms[code], question) is not None and int(time.time() * 1000) >= _quiz_deadline_ms(rooms[code], question):
                            rooms[code]["status"] = "timeout"
                        await broadcast(code, {"type": "room_state", "state": rooms[code]})
                        continue
                    _finalize_quiz_answer(rooms[code], player, given, received_at)
                    if data.get("timedOut") and _quiz_deadline_ms(rooms[code], question) is not None and int(time.time() * 1000) >= _quiz_deadline_ms(rooms[code], question):
                        rooms[code]["status"] = "timeout"
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "timeout":
                _finalize_quiz_drafts(rooms[code])
                rooms[code]["status"] = "timeout"
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "reveal":
                _finalize_quiz_drafts(rooms[code])
                rooms[code]["status"] = "reveal"
                answered = [
                    p for p in rooms[code]["players"]
                    if (p.get("lastAnswer") or {}).get("questionIdx") == rooms[code].get("questionIdx")
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
                for player in rooms[code]["players"]:
                    player.pop("currentAnswer", None)
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "finish":
                if code in rooms:
                    if rooms[code].get("status") == "active":
                        _finalize_quiz_drafts(rooms[code])
                    rooms[code]["status"] = "finished"
                    if not _persist_room_result(rooms[code]):
                        await send_error(websocket, ROOM_RESULT_DB_ERROR)
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
                        p.pop("currentAnswer", None)
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "kick":
                player_id = data.get("playerId")
                if code in rooms:
                    rooms[code]["players"] = [p for p in rooms[code]["players"] if p["id"] != player_id]
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "adjust_score":
                await send_error(websocket, "Ручная корректировка Quiz score отключена")

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
                    j["revealedAnswer"] = None
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
                    j["revealedAnswer"] = None
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
                    correct = bool(data.get("correct", False))
                    target_id = j["buzzedPlayerId"] if j["mode"] == "buzz" else rooms[code]["players"][j["currentPlayerIdx"]]["id"]
                    player = next((p for p in rooms[code]["players"] if p["id"] == target_id), None)

                    if player:
                        snapshot = rooms[code]["_snapshot"]["data"]
                        question = snapshot.get("rounds", [])[j["round"]][j["selectedCat"]]["questions"][j["selectedQ"]]
                        points = max(0, int(question.get("points", 0))) if isinstance(question, dict) else 0
                        delta = points if correct else -points
                        player["score"] += delta
                        if correct:
                            player["jCorrect"] = (player.get("jCorrect", 0) + 1)
                        else:
                            player["jWrong"] = (player.get("jWrong", 0) + 1)
                        j["decisions"].append({"kind": "question", "playerId": target_id, "round": j["round"], "catIdx": j["selectedCat"], "qIdx": j["selectedQ"], "given": j.get("buzzedAnswer"), "correct": correct, "points": points, "host": True})
                        j["lastDelta"] = {"playerId": target_id, "delta": delta}

                    # TURN mode
                    if j["mode"] == "turn":
                        if correct:
                            j["currentPlayerIdx"] = (j["currentPlayerIdx"] + 1) % max(1, len(rooms[code]["players"]))
                            j["showAnswer"] = True
                            j["revealedAnswer"] = _jeopardy_answer(rooms[code], j)
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
                                j["revealedAnswer"] = _jeopardy_answer(rooms[code], j)
                                j["phase"] = "reveal"
                                key = f"{j['round']}-{j['selectedCat']}-{j['selectedQ']}"
                                if key not in j["usedKeys"]:
                                    j["usedKeys"].append(key)
                        else:
                            j["showAnswer"] = True
                            j["revealedAnswer"] = _jeopardy_answer(rooms[code], j)
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
                    j["revealedAnswer"] = _jeopardy_answer(rooms[code], j)
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
                    j["revealedAnswer"] = _jeopardy_answer(rooms[code], j)
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
                    j["revealedAnswer"] = None
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
                    j["revealedAnswer"] = None
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
                        j["revealedAnswer"] = None
                        j["phase"] = "board"
                    else:
                        j["phase"] = "final-bets"
                        j["finalBets"] = {}
                        j["finalAnswers"] = {}
                        j["finalGiven"] = {}
                        j["revealedAnswer"] = None
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
                    j["revealedAnswer"] = None
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_final_answer":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    j["finalGiven"][identity["playerId"]] = data.get("given", "")
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_final_mark":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    player_id = data.get("playerId")
                    correct = bool(data.get("correct", False))
                    if any(player["id"] == player_id for player in rooms[code]["players"]):
                        j["finalAnswers"][player_id] = correct
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_final_reveal":
                if code in rooms and "jeopardy" in rooms[code]:
                    j = rooms[code]["jeopardy"]
                    j["showAnswer"] = True
                    final_data = rooms[code]["_snapshot"].get("data", {}).get("final", {})
                    j["revealedAnswer"] = final_data.get("a", "") if isinstance(final_data, dict) else ""
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
                        j["decisions"].append({"kind": "final", "playerId": pid, "given": j["finalGiven"].get(pid, ""), "correct": ok, "bet": bet, "host": True})
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
                    if not _persist_room_result(rooms[code]):
                        await send_error(websocket, ROOM_RESULT_DB_ERROR)
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

            elif action == "jeopardy_adjust_score":
                player_id = data.get("playerId")
                delta = data.get("delta", 0)
                if code in rooms:
                    player = next((p for p in rooms[code]["players"] if p["id"] == player_id), None)
                    if player and isinstance(delta, int):
                        player["score"] += delta
                        rooms[code]["jeopardy"]["decisions"].append({"kind": "adjustment", "playerId": player_id, "delta": delta, "host": True})
                await broadcast(code, {"type": "room_state", "state": rooms[code]})

    except WebSocketDisconnect:
        pass
    finally:
        connection_identities.pop(id(websocket), None)
        connections[code] = [ws for ws in connections.get(code, []) if ws != websocket]
        if not connections.get(code):
            connections.pop(code, None)
            # C2 reconnect bridge: keep only in-memory identity/state briefly.
            # D4 persistence and restart recovery remain explicitly out of scope.
            room_cleanup_tasks[code] = asyncio.create_task(cleanup_empty_room_after_grace(code))
