import base64
import hashlib
import hmac
import json
import os
import time
import uuid
from typing import Any


SNAPSHOT_TTL_SECONDS = 12 * 60 * 60


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def snapshot_version(data: dict) -> str:
    return hashlib.sha256(canonical_json(data).encode("utf-8")).hexdigest()


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def issue_snapshot_token(game_id: str, kind: str, data: dict) -> tuple[dict, str]:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET environment variable is required")

    snapshot = {
        "schema": "islandquiz.snapshot.v1",
        "gameId": game_id,
        "kind": kind,
        "version": snapshot_version(data),
        "data": data,
        "attemptId": str(uuid.uuid4()),
        "issuedAt": int(time.time()),
    }
    encoded = _b64(canonical_json(snapshot).encode("utf-8"))
    signature = _b64(hmac.new(secret.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).digest())
    return snapshot, f"{encoded}.{signature}"


def verify_snapshot_token(token: str, game_id: str, kind: str) -> dict:
    secret = os.getenv("JWT_SECRET")
    if not secret or not isinstance(token, str) or "." not in token:
        raise ValueError("Недействительный snapshot token")

    encoded, signature = token.split(".", 1)
    expected = _b64(hmac.new(secret.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(signature, expected):
        raise ValueError("Недействительный snapshot token")

    try:
        snapshot = json.loads(_unb64(encoded))
    except (ValueError, json.JSONDecodeError):
        raise ValueError("Недействительный snapshot token")

    if (
        not isinstance(snapshot, dict)
        or snapshot.get("schema") != "islandquiz.snapshot.v1"
        or snapshot.get("gameId") != game_id
        or snapshot.get("kind") != kind
        or not isinstance(snapshot.get("data"), dict)
        or not isinstance(snapshot.get("attemptId"), str)
        or not isinstance(snapshot.get("issuedAt"), int)
        or int(time.time()) - snapshot["issuedAt"] > SNAPSHOT_TTL_SECONDS
        or snapshot.get("version") != snapshot_version(snapshot["data"])
    ):
        raise ValueError("Недействительный или устаревший snapshot token")
    return snapshot


def _normalize_answer(value: Any) -> str:
    return str(value or "").strip().lower().replace("ё", "е").replace(",", ".").replace(" ", "")


def quiz_answer_is_correct(question: dict, given: str) -> bool:
    question_type = question.get("type")
    answer = str(question.get("answer") or "")
    if question_type in {"choice", "bool"}:
        return given == answer
    if question_type == "text":
        normalized = _normalize_answer(given)
        return any(_normalize_answer(option) == normalized for option in answer.split(",") if option.strip())
    try:
        if question_type == "matching":
            pairs = json.loads(answer)
            given_map = json.loads(given or "{}")
            return isinstance(pairs, list) and isinstance(given_map, dict) and all(given_map.get(pair.get("left")) == pair.get("right") for pair in pairs if isinstance(pair, dict))
        if question_type in {"close", "ordering"}:
            expected = json.loads(answer or "[]")
            submitted = json.loads(given or "[]")
            if not isinstance(expected, list) or not expected or not isinstance(submitted, list):
                return False
            if question_type == "close":
                return all(_normalize_answer(submitted[index] if index < len(submitted) else "") == _normalize_answer(value) for index, value in enumerate(expected))
            return expected == submitted
    except (TypeError, ValueError, json.JSONDecodeError):
        return False
    return False


def score_quiz(data: dict, submitted_answers: list[dict]) -> tuple[dict, list[dict]]:
    questions = data.get("questions")
    if not isinstance(questions, list):
        raise ValueError("Некорректный Quiz snapshot")
    submitted_by_id = {
        answer.get("qId"): str(answer.get("given") or "")
        for answer in submitted_answers
        if isinstance(answer, dict) and isinstance(answer.get("qId"), str)
    }
    answers = []
    for question in questions:
        if not isinstance(question, dict) or not isinstance(question.get("id"), str):
            continue
        given = submitted_by_id.get(question["id"], "")
        points = max(0, int(question.get("points") or 0))
        correct = quiz_answer_is_correct(question, given)
        answers.append({
            "qId": question["id"], "question": question.get("q", ""), "given": given,
            "correctAnswer": question.get("answer", ""), "isCorrect": correct,
            "earned": points if correct else 0, "points": points,
        })
    return {
        "score": sum(answer["earned"] for answer in answers),
        "maxScore": sum(answer["points"] for answer in answers),
        "correctCount": sum(1 for answer in answers if answer["isCorrect"]),
        "totalQuestions": len(answers),
    }, answers


def result_payload(snapshot: dict, items: list[dict], **extra: Any) -> dict:
    return {
        "schema": "islandquiz.result.v2",
        "snapshot": {key: snapshot[key] for key in ("gameId", "kind", "version", "data")},
        "items": items,
        **extra,
    }
