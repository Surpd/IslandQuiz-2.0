import uuid
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from database import supabase
from routes.auth import get_current_user_optional

router = APIRouter(prefix="/api", tags=["results"])


class QuizAnswer(BaseModel):
    qId: str
    question: str
    given: str
    correctAnswer: str
    isCorrect: bool
    earned: int
    points: int


class QuizResultInput(BaseModel):
    gameId: str
    playerName: str
    score: int
    maxScore: int
    correctCount: int
    totalQuestions: int
    timeSec: int
    answers: List[QuizAnswer]


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


class JeopardyResultInput(BaseModel):
    gameId: str
    hasFinal: bool
    winnerId: Optional[str] = None
    teams: List[JeopardyTeamResult]


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
    money: float
    question: str
    given: str
    correctAnswer: str
    isCorrect: bool


class MillionaireResultInput(BaseModel):
    gameId: str
    playerName: str
    outcome: str
    wonAmount: float
    guaranteedAmount: float
    reachedCount: int
    totalQuestions: int
    timeSec: int
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
    gameId: str
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


# ---------- Quiz Results ----------

@router.get("/quiz/{gameId}/results", response_model=List[QuizResultOut])
def get_quiz_results(gameId: str):
    res = supabase.table("quiz_results").select("*").eq("game_id", gameId).order("finished_at", desc=True).execute()
    return [
        QuizResultOut(
            id=r["id"], gameId=r["game_id"], userId=r.get("user_id"), playerName=r["player_name"],
            avatar=r.get("avatar"), score=r["score"], maxScore=r["max_score"],
            correctCount=r["correct_count"], totalQuestions=r["total_questions"],
            timeSec=r["time_sec"], finishedAt=r["finished_at"], answers=r.get("answers"),
        )
        for r in (res.data or [])
    ]


@router.post("/quiz/{gameId}/results", response_model=dict)
def submit_quiz_result(gameId: str, payload: QuizResultInput, current_user=Depends(get_current_user_optional)):
    result_id = str(uuid.uuid4())[:8]
    supabase.table("quiz_results").insert({
        "id": result_id, "game_id": gameId,
        "user_id": current_user["id"] if current_user else None,
        "player_name": payload.playerName, "score": payload.score, "max_score": payload.maxScore,
        "correct_count": payload.correctCount, "total_questions": payload.totalQuestions,
        "time_sec": payload.timeSec, "finished_at": datetime.utcnow().isoformat(),
        "answers": [a.model_dump() for a in payload.answers],
    }).execute()

    supabase.table("games").select("play_count").eq("id", gameId).execute()
    supabase.table("games").update({"play_count": supabase.table("games").select("play_count").eq("id", gameId).execute().data[0]["play_count"] + 1}).eq("id", gameId).execute()

    return {"ok": True, "id": result_id}


# ---------- Jeopardy Results ----------

@router.get("/jeopardy/{gameId}/results", response_model=List[JeopardyResultOut])
def get_jeopardy_results(gameId: str):
    res = supabase.table("jeopardy_results").select("*").eq("game_id", gameId).order("played_at", desc=True).execute()
    return [
        JeopardyResultOut(id=r["id"], gameId=r["game_id"], playedAt=r["played_at"],
                          teams=r["teams"], winnerId=r.get("winner_id"), hasFinal=r["has_final"])
        for r in (res.data or [])
    ]


@router.get("/jeopardy/{gameId}/results/{resultId}", response_model=Optional[JeopardyResultOut])
def get_jeopardy_result_detail(gameId: str, resultId: str):
    res = supabase.table("jeopardy_results").select("*").eq("id", resultId).eq("game_id", gameId).execute()
    if not res.data:
        return None
    r = res.data[0]
    return JeopardyResultOut(id=r["id"], gameId=r["game_id"], playedAt=r["played_at"],
                             teams=r["teams"], winnerId=r.get("winner_id"), hasFinal=r["has_final"])


@router.post("/jeopardy/{gameId}/results", response_model=dict)
def submit_jeopardy_result(gameId: str, payload: JeopardyResultInput):
    result_id = str(uuid.uuid4())[:8]
    supabase.table("jeopardy_results").insert({
        "id": result_id, "game_id": gameId, "played_at": datetime.utcnow().isoformat(),
        "teams": [t.model_dump() for t in payload.teams],
        "winner_id": payload.winnerId, "has_final": payload.hasFinal,
    }).execute()
    return {"ok": True, "id": result_id}


# ---------- Millionaire Results ----------

@router.get("/millionaire/{gameId}/results", response_model=List[MillionaireResultOut])
def get_millionaire_results(gameId: str):
    res = supabase.table("millionaire_results").select("*").eq("game_id", gameId).order("finished_at", desc=True).execute()
    return [
        MillionaireResultOut(id=r["id"], gameId=r["game_id"], userId=r.get("user_id"),
                             playerName=r["player_name"], avatar=r.get("avatar"),
                             outcome=r["outcome"], wonAmount=r["won_amount"],
                             guaranteedAmount=r["guaranteed_amount"], reachedCount=r["reached_count"],
                             totalQuestions=r["total_questions"], timeSec=r["time_sec"],
                             finishedAt=r["finished_at"], answers=r.get("answers"))
        for r in (res.data or [])
    ]


@router.post("/millionaire/{gameId}/results", response_model=dict)
def submit_millionaire_result(gameId: str, payload: MillionaireResultInput, current_user=Depends(get_current_user_optional)):
    result_id = str(uuid.uuid4())[:8]
    supabase.table("millionaire_results").insert({
        "id": result_id, "game_id": gameId,
        "user_id": current_user["id"] if current_user else None,
        "player_name": payload.playerName, "outcome": payload.outcome,
        "won_amount": payload.wonAmount, "guaranteed_amount": payload.guaranteedAmount,
        "reached_count": payload.reachedCount, "total_questions": payload.totalQuestions,
        "time_sec": payload.timeSec, "finished_at": datetime.utcnow().isoformat(),
        "answers": [a.model_dump() for a in payload.answers],
    }).execute()
    return {"ok": True, "id": result_id}


# ---------- Online Quiz Results ----------

@router.get("/quiz/{gameId}/online-results", response_model=List[OnlineQuizResultOut])
def get_online_results(gameId: str):
    res = supabase.table("online_quiz_results").select("*").eq("game_id", gameId).order("played_at", desc=True).execute()
    return [
        OnlineQuizResultOut(id=r["id"], gameId=r["game_id"], roomCode=r["room_code"],
                            playedAt=r["played_at"], durationSec=r["duration_sec"], players=r["players"])
        for r in (res.data or [])
    ]


    @router.post("/quiz/{gameId}/online-results", response_model=dict)
    def submit_online_result(gameId: str, payload: OnlineQuizResultInput):
        result_id = str(uuid.uuid4())[:8]
        supabase.table("online_quiz_results").insert({
            "id": result_id, "game_id": gameId, "room_code": payload.roomCode,
            "played_at": datetime.utcnow().isoformat(), "duration_sec": payload.durationSec,
            "players": [p.model_dump() for p in payload.players],
        }).execute()
        return {"ok": True, "id": result_id}


@router.get("/played-games/{user_id}")
def get_played_game_ids(user_id: str):
    game_ids = set()
    
    # Quiz results
    quiz = supabase.table("quiz_results").select("game_id").eq("user_id", user_id).execute()
    for r in (quiz.data or []):
        game_ids.add(r["game_id"])
    
    # Online quiz results
    online = supabase.table("online_quiz_results").select("game_id, players").execute()
    for r in (online.data or []):
        players = r.get("players") or []
        if any(p.get("userId") == user_id or p.get("user_id") == user_id for p in players):
            game_ids.add(r["game_id"])
    
    # Millionaire results
    millionaire = supabase.table("millionaire_results").select("game_id").eq("user_id", user_id).execute()
    for r in (millionaire.data or []):
        game_ids.add(r["game_id"])
    
    # Jeopardy results
    jeopardy = supabase.table("jeopardy_results").select("game_id, teams").execute()
    for r in (jeopardy.data or []):
        teams = r.get("teams") or []
        if any(t.get("id") == user_id for t in teams):
            game_ids.add(r["game_id"])
    
    return list(game_ids)