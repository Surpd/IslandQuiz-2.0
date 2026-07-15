import uuid
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from routes.auth import get_current_user
from database import get_db
from models import User, Game, QuizResult, JeopardyResult, MillionaireResult, OnlineQuizResult

router = APIRouter(prefix="/api", tags=["results"])


# ---------- Schemas ----------

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
    outcome: str  # won, lost
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
def get_quiz_results(gameId: str, db: Session = Depends(get_db)):
    results = db.query(QuizResult).filter(QuizResult.game_id == gameId).order_by(QuizResult.finished_at.desc()).all()
    return [
        QuizResultOut(
            id=r.id,
            gameId=r.game_id,
            userId=r.user_id,
            playerName=r.player_name,
            avatar=r.avatar,
            score=r.score,
            maxScore=r.max_score,
            correctCount=r.correct_count,
            totalQuestions=r.total_questions,
            timeSec=r.time_sec,
            finishedAt=r.finished_at.isoformat(),
            answers=r.answers,
        )
        for r in results
    ]


@router.post("/quiz/{gameId}/results", response_model=dict)
def submit_quiz_result(
    gameId: str,
    payload: QuizResultInput,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    result = QuizResult(
        id=str(uuid.uuid4())[:8],
        game_id=gameId,
        user_id=current_user.id if current_user else None,
        player_name=payload.playerName,
        score=payload.score,
        max_score=payload.maxScore,
        correct_count=payload.correctCount,
        total_questions=payload.totalQuestions,
        time_sec=payload.timeSec,
        finished_at=datetime.utcnow(),
        answers=[a.model_dump() for a in payload.answers],
    )
    db.add(result)

    # Increment play count
    game = db.query(Game).filter(Game.id == gameId).first()
    if game:
        game.play_count = (game.play_count or 0) + 1

    db.commit()
    return {"ok": True, "id": result.id}


# ---------- Jeopardy Results ----------

@router.get("/jeopardy/{gameId}/results", response_model=List[JeopardyResultOut])
def get_jeopardy_results(gameId: str, db: Session = Depends(get_db)):
    results = db.query(JeopardyResult).filter(JeopardyResult.game_id == gameId).order_by(JeopardyResult.played_at.desc()).all()
    return [
        JeopardyResultOut(
            id=r.id,
            gameId=r.game_id,
            playedAt=r.played_at.isoformat(),
            teams=r.teams,
            winnerId=r.winner_id,
            hasFinal=r.has_final,
        )
        for r in results
    ]


@router.get("/jeopardy/{gameId}/results/{resultId}", response_model=Optional[JeopardyResultOut])
def get_jeopardy_result_detail(gameId: str, resultId: str, db: Session = Depends(get_db)):
    r = db.query(JeopardyResult).filter(JeopardyResult.id == resultId, JeopardyResult.game_id == gameId).first()
    if not r:
        return None
    return JeopardyResultOut(
        id=r.id,
        gameId=r.game_id,
        playedAt=r.played_at.isoformat(),
        teams=r.teams,
        winnerId=r.winner_id,
        hasFinal=r.has_final,
    )


@router.post("/jeopardy/{gameId}/results", response_model=dict)
def submit_jeopardy_result(gameId: str, payload: JeopardyResultInput, db: Session = Depends(get_db)):
    result = JeopardyResult(
        id=str(uuid.uuid4())[:8],
        game_id=gameId,
        played_at=datetime.utcnow(),
        teams=[t.model_dump() for t in payload.teams],
        winner_id=payload.winnerId,
        has_final=payload.hasFinal,
    )
    db.add(result)

    # Increment play count
    game = db.query(Game).filter(Game.id == gameId).first()
    if game:
        game.play_count = (game.play_count or 0) + 1

    db.commit()
    return {"ok": True, "id": result.id}


# ---------- Millionaire Results ----------

@router.get("/millionaire/{gameId}/results", response_model=List[MillionaireResultOut])
def get_millionaire_results(gameId: str, db: Session = Depends(get_db)):
    results = db.query(MillionaireResult).filter(MillionaireResult.game_id == gameId).order_by(MillionaireResult.finished_at.desc()).all()
    return [
        MillionaireResultOut(
            id=r.id,
            gameId=r.game_id,
            userId=r.user_id,
            playerName=r.player_name,
            avatar=r.avatar,
            outcome=r.outcome,
            wonAmount=r.won_amount,
            guaranteedAmount=r.guaranteed_amount,
            reachedCount=r.reached_count,
            totalQuestions=r.total_questions,
            timeSec=r.time_sec,
            finishedAt=r.finished_at.isoformat(),
            answers=r.answers,
        )
        for r in results
    ]


@router.post("/millionaire/{gameId}/results", response_model=dict)
def submit_millionaire_result(
    gameId: str,
    payload: MillionaireResultInput,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    result = MillionaireResult(
        id=str(uuid.uuid4())[:8],
        game_id=gameId,
        user_id=current_user.id if current_user else None,
        player_name=payload.playerName,
        outcome=payload.outcome,
        won_amount=payload.wonAmount,
        guaranteed_amount=payload.guaranteedAmount,
        reached_count=payload.reachedCount,
        total_questions=payload.totalQuestions,
        time_sec=payload.timeSec,
        finished_at=datetime.utcnow(),
        answers=[a.model_dump() for a in payload.answers],
    )
    db.add(result)

    # Increment play count
    game = db.query(Game).filter(Game.id == gameId).first()
    if game:
        game.play_count = (game.play_count or 0) + 1

    db.commit()
    return {"ok": True, "id": result.id}


# ---------- Online Quiz Results ----------

@router.get("/quiz/{gameId}/online-results", response_model=List[OnlineQuizResultOut])
def get_online_results(gameId: str, db: Session = Depends(get_db)):
    results = db.query(OnlineQuizResult).filter(OnlineQuizResult.game_id == gameId).order_by(OnlineQuizResult.played_at.desc()).all()
    return [
        OnlineQuizResultOut(
            id=r.id,
            gameId=r.game_id,
            roomCode=r.room_code,
            playedAt=r.played_at.isoformat(),
            durationSec=r.duration_sec,
            players=r.players,
        )
        for r in results
    ]


@router.post("/quiz/{gameId}/online-results", response_model=dict)
def submit_online_result(gameId: str, payload: OnlineQuizResultInput, db: Session = Depends(get_db)):
    result = OnlineQuizResult(
        id=str(uuid.uuid4())[:8],
        game_id=gameId,
        room_code=payload.roomCode,
        played_at=datetime.utcnow(),
        duration_sec=payload.durationSec,
        players=[p.model_dump() for p in payload.players],
    )
    db.add(result)

    # Increment play count
    game = db.query(Game).filter(Game.id == gameId).first()
    if game:
        game.play_count = (game.play_count or 0) + 1

    db.commit()
    return {"ok": True, "id": result.id}