import uuid
from typing import Optional, List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import supabase
from routes.auth import get_current_user_optional, get_current_user
from services.trusted_scoring import issue_snapshot_token, result_payload, score_jeopardy, score_millionaire, score_quiz, verify_snapshot_token

router = APIRouter(prefix="/api", tags=["results"])
DB_ERROR_DETAIL = "Ошибка базы данных"


def _db_response(query):
    try:
        response = query.execute()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL) from exc
    if response is None:
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL)
    return response


def _result_rows(response) -> list[dict]:
    rows = getattr(response, "data", None)
    if rows is None or not isinstance(rows, list):
        return []
    return [row for row in rows if isinstance(row, dict)]


def _db_rows(query) -> list[dict]:
    return _result_rows(_db_response(query))


class QuizAnswer(BaseModel):
    qId: str
    given: str = ""


class QuizResultInput(BaseModel):
    playerName: str
    timeSec: int = 0
    snapshotToken: str
    answers: List[QuizAnswer]


class SnapshotRequest(BaseModel):
    kind: str


class QuizResultOut(BaseModel):
    id: str
    gameId: str
    userId: Optional[str] = None
    playerName: str
    avatar: Optional[str] = None
    score: int
    maxScore: int
    correctCount: int
    totalQuestions: int
    timeSec: int
    finishedAt: str
    answers: Optional[List[dict]] = None

    class Config:
        from_attributes = True


class JeopardyTeamResult(BaseModel):
    id: str
    name: str
    score: int
    correct: int
    wrong: int
    finalBet: Optional[int] = None
    finalCorrect: Optional[bool] = None


class JeopardyTeamInput(BaseModel):
    id: str
    name: str


class JeopardyDecision(BaseModel):
    kind: str
    playerId: str
    correct: bool
    round: Optional[int] = None
    catIdx: Optional[int] = None
    qIdx: Optional[int] = None
    bet: Optional[int] = None


class JeopardyResultInput(BaseModel):
    snapshotToken: str
    teams: List[JeopardyTeamInput]
    decisions: List[JeopardyDecision]


class JeopardyResultOut(BaseModel):
    id: str
    gameId: str
    playedAt: str
    teams: List[JeopardyTeamResult]
    winnerId: Optional[str] = None
    hasFinal: bool

    class Config:
        from_attributes = True


class MillionaireAnswerDetail(BaseModel):
    qIdx: int
    selectedIndex: Optional[int] = None


class MillionaireResultInput(BaseModel):
    playerName: str
    timeSec: int = 0
    snapshotToken: str
    answers: List[MillionaireAnswerDetail]


class MillionaireResultOut(BaseModel):
    id: str
    gameId: str
    userId: Optional[str] = None
    playerName: str
    avatar: Optional[str] = None
    outcome: str
    wonAmount: float
    guaranteedAmount: float
    reachedCount: int
    totalQuestions: int
    timeSec: int
    finishedAt: str
    answers: Optional[List[dict]] = None

    class Config:
        from_attributes = True


class OnlineQuizPlayer(BaseModel):
    id: str
    nickname: str
    avatar: str
    score: int
    maxScore: int
    correctCount: int
    totalQuestions: int
    answers: List[dict]


class OnlineQuizResultInput(BaseModel):
    roomCode: str
    durationSec: int
    players: List[OnlineQuizPlayer]


class OnlineQuizResultOut(BaseModel):
    id: str
    gameId: str
    roomCode: str
    playedAt: str
    durationSec: int
    players: List[dict]

    class Config:
        from_attributes = True


# ---------- Helpers ----------

def _can_view_game(game_id: str, user: Optional[dict]) -> bool:
    """Проверяет, можно ли видеть игру (и её результаты)."""
    if not user:
        return False
    game_rows = _db_rows(supabase.table("games").select("owner_id,visibility").eq("id", game_id))
    if not game_rows:
        return False
    g = game_rows[0]
    if g.get("owner_id") == user.get("id") or user.get("role") == "admin":
        return True
    if g.get("visibility") in ("public", "link"):
        return True
    return False


def _check_can_submit(game_id: str, expected_kind: str, user: Optional[dict]) -> dict:
    """Проверяет, можно ли отправить результат для игры. Возвращает игру или кидает HTTPException."""
    game_rows = _db_rows(supabase.table("games").select("*").eq("id", game_id))
    if not game_rows:
        raise HTTPException(status_code=404, detail="Игра не найдена")
    
    g = game_rows[0]
    
    # Проверка типа игры
    if g.get("kind") != expected_kind:
        raise HTTPException(status_code=400, detail=f"Неверный тип игры: ожидается {expected_kind}")
    
    # Проверка доступа
    if g.get("visibility") == "private":
        if not user or g.get("owner_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Нет доступа к этой игре")
    
    return g


def _result_items(payload):
    if isinstance(payload, dict) and payload.get("schema") == "islandquiz.result.v2":
        items = payload.get("items")
        payload = items
    if not isinstance(payload, list):
        return []
    return [item for item in payload if isinstance(item, dict)]


def _result_fields(payload, allowed):
    return [{key: item[key] for key in allowed if key in item} for item in _result_items(payload)]


def _online_result_players(payload):
    allowed = ("id", "nickname", "avatar", "score", "maxScore", "correctCount", "totalQuestions", "answers")
    answer_allowed = ("questionIdx", "correct", "delta", "timeMs", "given")
    return [
        {key: item[key] for key in allowed if key in item and key != "answers"}
        | ({"answers": _result_fields(item.get("answers"), answer_allowed)} if "answers" in item else {})
        for item in _result_items(payload)
    ]


def _jeopardy_result_teams(payload):
    allowed = ("id", "name", "score", "correct", "wrong", "finalBet", "finalCorrect")
    required = ("id", "name", "score", "correct", "wrong")
    return [
        {key: item[key] for key in allowed if key in item}
        for item in _result_items(payload)
        if all(key in item for key in required)
    ]


@router.post("/games/{gameId}/play-snapshot", response_model=dict)
def create_play_snapshot(gameId: str, payload: SnapshotRequest, current_user=Depends(get_current_user_optional)):
    game = _check_can_submit(gameId, payload.kind, current_user)
    data = game.get("data")
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Некорректные данные игры")
    snapshot, token = issue_snapshot_token(gameId, payload.kind, data)
    return {"data": data, "version": snapshot["version"], "snapshotToken": token}


# ---------- Quiz Results ----------

@router.get("/quiz/{gameId}/results", response_model=List[QuizResultOut])
def get_quiz_results(gameId: str, user=Depends(get_current_user)):
    if not _can_view_game(gameId, user):
        raise HTTPException(status_code=403, detail="Нет доступа к результатам")
    
    rows = _db_rows(supabase.table("quiz_results").select("*").eq("game_id", gameId).order("finished_at", desc=True))
    return [
        QuizResultOut(
            id=r.get("id") or "", gameId=r.get("game_id") or "", userId=r.get("user_id"), playerName=r.get("player_name") or "",
            avatar=r.get("avatar"), score=r.get("score") or 0, maxScore=r.get("max_score") or 0,
            correctCount=r.get("correct_count") or 0, totalQuestions=r.get("total_questions") or 0,
            timeSec=r.get("time_sec") or 0, finishedAt=r.get("finished_at") or "", answers=_result_fields(r.get("answers"), ("qId", "question", "given", "correctAnswer", "isCorrect", "earned", "points")),
        )
        for r in rows
    ]


@router.post("/quiz/{gameId}/results", response_model=dict)
def submit_quiz_result(gameId: str, payload: QuizResultInput, current_user=Depends(get_current_user_optional)):
    _check_can_submit(gameId, "quiz", current_user)
    try:
        snapshot = verify_snapshot_token(payload.snapshotToken, gameId, "quiz")
        totals, answers = score_quiz(snapshot["data"], [answer.model_dump() for answer in payload.answers])
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    result_id = snapshot["attemptId"]
    _db_rows(supabase.table("quiz_results").insert({
        "id": result_id, "game_id": gameId,
        "user_id": current_user["id"] if current_user else None,
        "player_name": payload.playerName.strip()[:100] or "Аноним",
        "score": totals["score"], "max_score": totals["maxScore"],
        "correct_count": totals["correctCount"], "total_questions": totals["totalQuestions"],
        "time_sec": max(0, payload.timeSec), "finished_at": datetime.now(timezone.utc).isoformat(),
        "answers": result_payload(snapshot, answers),
    }))
    return {"ok": True, "id": result_id}


# ---------- Jeopardy Results ----------

@router.get("/jeopardy/{gameId}/results", response_model=List[JeopardyResultOut])
def get_jeopardy_results(gameId: str, user=Depends(get_current_user)):
    if not _can_view_game(gameId, user):
        raise HTTPException(status_code=403, detail="Нет доступа к результатам")
    
    rows = _db_rows(supabase.table("jeopardy_results").select("*").eq("game_id", gameId).order("played_at", desc=True))
    return [
        JeopardyResultOut(id=r.get("id") or "", gameId=r.get("game_id") or "", playedAt=r.get("played_at") or "",
                          teams=_jeopardy_result_teams(r.get("teams")), winnerId=r.get("winner_id"), hasFinal=bool(r.get("has_final")))
        for r in rows
    ]


@router.get("/jeopardy/{gameId}/results/{resultId}", response_model=Optional[JeopardyResultOut])
def get_jeopardy_result_detail(gameId: str, resultId: str, user=Depends(get_current_user)):
    if not _can_view_game(gameId, user):
        raise HTTPException(status_code=403, detail="Нет доступа к результатам")
    
    rows = _db_rows(supabase.table("jeopardy_results").select("*").eq("id", resultId).eq("game_id", gameId))
    if not rows:
        return None
    r = rows[0]
    return JeopardyResultOut(id=r.get("id") or "", gameId=r.get("game_id") or "", playedAt=r.get("played_at") or "",
                             teams=_jeopardy_result_teams(r.get("teams")), winnerId=r.get("winner_id"), hasFinal=bool(r.get("has_final")))


@router.post("/jeopardy/{gameId}/results", response_model=dict)
def submit_jeopardy_result(gameId: str, payload: JeopardyResultInput, current_user=Depends(get_current_user_optional)):
    _check_can_submit(gameId, "jeopardy", current_user)
    try:
        snapshot = verify_snapshot_token(payload.snapshotToken, gameId, "jeopardy")
        teams, decisions = score_jeopardy(snapshot["data"], [team.model_dump() for team in payload.teams], [decision.model_dump() for decision in payload.decisions])
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    winner = max(teams, key=lambda team: team["score"], default=None)
    result_id = snapshot["attemptId"]
    _db_rows(supabase.table("jeopardy_results").insert({
        "id": result_id, "game_id": gameId, "played_at": datetime.now(timezone.utc).isoformat(),
        "teams": result_payload(snapshot, teams, decisions=decisions),
        "winner_id": winner["id"] if winner else None, "has_final": bool(decisions and any(decision["kind"] == "final" for decision in decisions)),
    }))
    return {"ok": True, "id": result_id}


# ---------- Millionaire Results ----------

@router.get("/millionaire/{gameId}/results", response_model=List[MillionaireResultOut])
def get_millionaire_results(gameId: str, user=Depends(get_current_user)):
    if not _can_view_game(gameId, user):
        raise HTTPException(status_code=403, detail="Нет доступа к результатам")
    
    rows = _db_rows(supabase.table("millionaire_results").select("*").eq("game_id", gameId).order("finished_at", desc=True))
    return [
        MillionaireResultOut(id=r.get("id") or "", gameId=r.get("game_id") or "", userId=r.get("user_id"),
                             playerName=r.get("player_name") or "", avatar=r.get("avatar"),
                             outcome=r.get("outcome") or "", wonAmount=r.get("won_amount") or 0,
                             guaranteedAmount=r.get("guaranteed_amount") or 0, reachedCount=r.get("reached_count") or 0,
                             totalQuestions=r.get("total_questions") or 0, timeSec=r.get("time_sec") or 0,
                             finishedAt=r.get("finished_at") or "", answers=_result_fields(r.get("answers"), ("qIdx", "money", "question", "selectedIndex", "isCorrect")))
        for r in rows
    ]


@router.post("/millionaire/{gameId}/results", response_model=dict)
def submit_millionaire_result(gameId: str, payload: MillionaireResultInput, current_user=Depends(get_current_user_optional)):
    _check_can_submit(gameId, "millionaire", current_user)
    try:
        snapshot = verify_snapshot_token(payload.snapshotToken, gameId, "millionaire")
        totals, answers = score_millionaire(snapshot["data"], [answer.model_dump() for answer in payload.answers])
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    result_id = snapshot["attemptId"]
    _db_rows(supabase.table("millionaire_results").insert({
        "id": result_id, "game_id": gameId,
        "user_id": current_user["id"] if current_user else None,
        "player_name": payload.playerName.strip()[:100] or "Аноним", "outcome": totals["outcome"],
        "won_amount": totals["wonAmount"], "guaranteed_amount": totals["guaranteedAmount"],
        "reached_count": totals["reachedCount"], "total_questions": totals["totalQuestions"],
        "time_sec": max(0, payload.timeSec), "finished_at": datetime.now(timezone.utc).isoformat(),
        "answers": result_payload(snapshot, answers),
    }))
    return {"ok": True, "id": result_id}


# ---------- Online Quiz Results ----------

@router.get("/quiz/{gameId}/online-results", response_model=List[OnlineQuizResultOut])
def get_online_results(gameId: str, user=Depends(get_current_user)):
    if not _can_view_game(gameId, user):
        raise HTTPException(status_code=403, detail="Нет доступа к результатам")
    
    rows = _db_rows(supabase.table("online_quiz_results").select("*").eq("game_id", gameId).order("played_at", desc=True))
    return [
        OnlineQuizResultOut(id=r.get("id") or "", gameId=r.get("game_id") or "", roomCode=r.get("room_code") or "",
                            playedAt=r.get("played_at") or "", durationSec=r.get("duration_sec") or 0, players=_online_result_players(r.get("players")))
        for r in rows
    ]


@router.post("/quiz/{gameId}/online-results", response_model=dict)
def submit_online_result(gameId: str, payload: OnlineQuizResultInput):
    raise HTTPException(status_code=410, detail="Legacy online result submit отключён: результат сохраняет room backend")


@router.get("/played-games/me")
def get_my_played_game_ids(user=Depends(get_current_user)):
    game_ids = set()
    user_id = user["id"]
    
    quiz_rows = _db_rows(supabase.table("quiz_results").select("game_id").eq("user_id", user_id))
    for r in quiz_rows:
        if r.get("game_id"):
            game_ids.add(r.get("game_id"))
    
    online_rows = _db_rows(supabase.table("online_quiz_results").select("game_id, players"))
    for r in online_rows:
        players = _result_items(r.get("players"))
        if any(p.get("userId") == user_id or p.get("user_id") == user_id for p in players):
            if r.get("game_id"):
                game_ids.add(r.get("game_id"))
    
    millionaire_rows = _db_rows(supabase.table("millionaire_results").select("game_id").eq("user_id", user_id))
    for r in millionaire_rows:
        if r.get("game_id"):
            game_ids.add(r.get("game_id"))
    
    jeopardy_rows = _db_rows(supabase.table("jeopardy_results").select("game_id, teams"))
    for r in jeopardy_rows:
        teams = _result_items(r.get("teams"))
        if any(t.get("id") == user_id for t in teams):
            if r.get("game_id"):
                game_ids.add(r.get("game_id"))
    
    return list(game_ids)


@router.get("/played-games/{user_id}")
def get_played_game_ids(user_id: str, user=Depends(get_current_user)):
    if user.get("role") != "admin" and user_id != user.get("id"):
        raise HTTPException(status_code=403, detail="Нет доступа к истории другого пользователя")

    game_ids = set()
    target_user_id = user_id
    
    quiz_rows = _db_rows(supabase.table("quiz_results").select("game_id").eq("user_id", target_user_id))
    for r in quiz_rows:
        if r.get("game_id"):
            game_ids.add(r.get("game_id"))
    
    online_rows = _db_rows(supabase.table("online_quiz_results").select("game_id, players"))
    for r in online_rows:
        players = _result_items(r.get("players"))
        if any(p.get("userId") == target_user_id or p.get("user_id") == target_user_id for p in players):
            if r.get("game_id"):
                game_ids.add(r.get("game_id"))
    
    millionaire_rows = _db_rows(supabase.table("millionaire_results").select("game_id").eq("user_id", target_user_id))
    for r in millionaire_rows:
        if r.get("game_id"):
            game_ids.add(r.get("game_id"))
    
    jeopardy_rows = _db_rows(supabase.table("jeopardy_results").select("game_id, teams"))
    for r in jeopardy_rows:
        teams = _result_items(r.get("teams"))
        if any(t.get("id") == target_user_id for t in teams):
            if r.get("game_id"):
                game_ids.add(r.get("game_id"))
    
    return list(game_ids)
