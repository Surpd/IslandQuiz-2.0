import uuid
from typing import Optional, List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import supabase
from routes.auth import get_current_user_optional, get_current_user
from services.trusted_scoring import issue_snapshot_token, result_payload, score_jeopardy, score_millionaire, score_quiz, verify_snapshot_token

router = APIRouter(prefix="/api", tags=["results"])


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
    game = supabase.table("games").select("owner_id,visibility").eq("id", game_id).execute()
    if not game.data:
        return False
    g = game.data[0]
    if g["owner_id"] == user["id"]:
        return True
    if g["visibility"] in ("public", "link"):
        return True
    return False


def _check_can_submit(game_id: str, expected_kind: str, user: Optional[dict]) -> dict:
    """Проверяет, можно ли отправить результат для игры. Возвращает игру или кидает HTTPException."""
    game = supabase.table("games").select("*").eq("id", game_id).execute()
    if not game.data:
        raise HTTPException(status_code=404, detail="Игра не найдена")
    
    g = game.data[0]
    
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
        return payload.get("items") or []
    return payload or []


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
    
    res = supabase.table("quiz_results").select("*").eq("game_id", gameId).order("finished_at", desc=True).execute()
    return [
        QuizResultOut(
            id=r["id"], gameId=r["game_id"], userId=r.get("user_id"), playerName=r["player_name"],
            avatar=r.get("avatar"), score=r["score"], maxScore=r["max_score"],
            correctCount=r["correct_count"], totalQuestions=r["total_questions"],
            timeSec=r["time_sec"], finishedAt=r["finished_at"], answers=_result_items(r.get("answers")),
        )
        for r in (res.data or [])
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
    supabase.table("quiz_results").insert({
        "id": result_id, "game_id": gameId,
        "user_id": current_user["id"] if current_user else None,
        "player_name": payload.playerName.strip()[:100] or "Аноним",
        "score": totals["score"], "max_score": totals["maxScore"],
        "correct_count": totals["correctCount"], "total_questions": totals["totalQuestions"],
        "time_sec": max(0, payload.timeSec), "finished_at": datetime.now(timezone.utc).isoformat(),
        "answers": result_payload(snapshot, answers),
    }).execute()
    return {"ok": True, "id": result_id}


# ---------- Jeopardy Results ----------

@router.get("/jeopardy/{gameId}/results", response_model=List[JeopardyResultOut])
def get_jeopardy_results(gameId: str, user=Depends(get_current_user)):
    if not _can_view_game(gameId, user):
        raise HTTPException(status_code=403, detail="Нет доступа к результатам")
    
    res = supabase.table("jeopardy_results").select("*").eq("game_id", gameId).order("played_at", desc=True).execute()
    return [
        JeopardyResultOut(id=r["id"], gameId=r["game_id"], playedAt=r["played_at"],
                          teams=_result_items(r["teams"]), winnerId=r.get("winner_id"), hasFinal=r["has_final"])
        for r in (res.data or [])
    ]


@router.get("/jeopardy/{gameId}/results/{resultId}", response_model=Optional[JeopardyResultOut])
def get_jeopardy_result_detail(gameId: str, resultId: str, user=Depends(get_current_user)):
    if not _can_view_game(gameId, user):
        raise HTTPException(status_code=403, detail="Нет доступа к результатам")
    
    res = supabase.table("jeopardy_results").select("*").eq("id", resultId).eq("game_id", gameId).execute()
    if not res.data:
        return None
    r = res.data[0]
    return JeopardyResultOut(id=r["id"], gameId=r["game_id"], playedAt=r["played_at"],
                             teams=_result_items(r["teams"]), winnerId=r.get("winner_id"), hasFinal=r["has_final"])


@router.post("/jeopardy/{gameId}/results", response_model=dict)
def submit_jeopardy_result(gameId: str, payload: JeopardyResultInput):
    _check_can_submit(gameId, "jeopardy", None)
    try:
        snapshot = verify_snapshot_token(payload.snapshotToken, gameId, "jeopardy")
        teams, decisions = score_jeopardy(snapshot["data"], [team.model_dump() for team in payload.teams], [decision.model_dump() for decision in payload.decisions])
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    winner = max(teams, key=lambda team: team["score"], default=None)
    result_id = snapshot["attemptId"]
    supabase.table("jeopardy_results").insert({
        "id": result_id, "game_id": gameId, "played_at": datetime.now(timezone.utc).isoformat(),
        "teams": result_payload(snapshot, teams, decisions=decisions),
        "winner_id": winner["id"] if winner else None, "has_final": bool(decisions and any(decision["kind"] == "final" for decision in decisions)),
    }).execute()
    return {"ok": True, "id": result_id}


# ---------- Millionaire Results ----------

@router.get("/millionaire/{gameId}/results", response_model=List[MillionaireResultOut])
def get_millionaire_results(gameId: str, user=Depends(get_current_user)):
    if not _can_view_game(gameId, user):
        raise HTTPException(status_code=403, detail="Нет доступа к результатам")
    
    res = supabase.table("millionaire_results").select("*").eq("game_id", gameId).order("finished_at", desc=True).execute()
    return [
        MillionaireResultOut(id=r["id"], gameId=r["game_id"], userId=r.get("user_id"),
                             playerName=r["player_name"], avatar=r.get("avatar"),
                             outcome=r["outcome"], wonAmount=r["won_amount"],
                             guaranteedAmount=r["guaranteed_amount"], reachedCount=r["reached_count"],
                             totalQuestions=r["total_questions"], timeSec=r["time_sec"],
                             finishedAt=r["finished_at"], answers=_result_items(r.get("answers")))
        for r in (res.data or [])
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
    supabase.table("millionaire_results").insert({
        "id": result_id, "game_id": gameId,
        "user_id": current_user["id"] if current_user else None,
        "player_name": payload.playerName.strip()[:100] or "Аноним", "outcome": totals["outcome"],
        "won_amount": totals["wonAmount"], "guaranteed_amount": totals["guaranteedAmount"],
        "reached_count": totals["reachedCount"], "total_questions": totals["totalQuestions"],
        "time_sec": max(0, payload.timeSec), "finished_at": datetime.now(timezone.utc).isoformat(),
        "answers": result_payload(snapshot, answers),
    }).execute()
    return {"ok": True, "id": result_id}


# ---------- Online Quiz Results ----------

@router.get("/quiz/{gameId}/online-results", response_model=List[OnlineQuizResultOut])
def get_online_results(gameId: str, user=Depends(get_current_user)):
    if not _can_view_game(gameId, user):
        raise HTTPException(status_code=403, detail="Нет доступа к результатам")
    
    res = supabase.table("online_quiz_results").select("*").eq("game_id", gameId).order("played_at", desc=True).execute()
    return [
        OnlineQuizResultOut(id=r["id"], gameId=r["game_id"], roomCode=r["room_code"],
                            playedAt=r["played_at"], durationSec=r["duration_sec"], players=_result_items(r["players"]))
        for r in (res.data or [])
    ]


@router.post("/quiz/{gameId}/online-results", response_model=dict)
def submit_online_result(gameId: str, payload: OnlineQuizResultInput):
    raise HTTPException(status_code=410, detail="Legacy online result submit отключён: результат сохраняет room backend")


@router.get("/played-games/me")
def get_my_played_game_ids(user=Depends(get_current_user)):
    game_ids = set()
    user_id = user["id"]
    
    quiz = supabase.table("quiz_results").select("game_id").eq("user_id", user_id).execute()
    for r in (quiz.data or []):
        game_ids.add(r["game_id"])
    
    online = supabase.table("online_quiz_results").select("game_id, players").execute()
    for r in (online.data or []):
        players = _result_items(r.get("players"))
        if any(p.get("userId") == user_id or p.get("user_id") == user_id for p in players):
            game_ids.add(r["game_id"])
    
    millionaire = supabase.table("millionaire_results").select("game_id").eq("user_id", user_id).execute()
    for r in (millionaire.data or []):
        game_ids.add(r["game_id"])
    
    jeopardy = supabase.table("jeopardy_results").select("game_id, teams").execute()
    for r in (jeopardy.data or []):
        teams = _result_items(r.get("teams"))
        if any(t.get("id") == user_id for t in teams):
            game_ids.add(r["game_id"])
    
    return list(game_ids)


@router.get("/played-games/{user_id}")
def get_played_game_ids(user_id: str):
    game_ids = set()
    
    quiz = supabase.table("quiz_results").select("game_id").eq("user_id", user_id).execute()
    for r in (quiz.data or []):
        game_ids.add(r["game_id"])
    
    online = supabase.table("online_quiz_results").select("game_id, players").execute()
    for r in (online.data or []):
        players = _result_items(r.get("players"))
        if any(p.get("userId") == user_id or p.get("user_id") == user_id for p in players):
            game_ids.add(r["game_id"])
    
    millionaire = supabase.table("millionaire_results").select("game_id").eq("user_id", user_id).execute()
    for r in (millionaire.data or []):
        game_ids.add(r["game_id"])
    
    jeopardy = supabase.table("jeopardy_results").select("game_id, teams").execute()
    for r in (jeopardy.data or []):
        teams = _result_items(r.get("teams"))
        if any(t.get("id") == user_id for t in teams):
            game_ids.add(r["game_id"])
    
    return list(game_ids)
