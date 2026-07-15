import uuid
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User, Game, Rating

router = APIRouter(prefix="/api/games", tags=["games"])


# ---------- Schemas ----------

class GameOut(BaseModel):
    id: str
    kind: str
    data: dict
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    visibility: str = "private"
    forked_from: Optional[str] = None
    forked_owner_name: Optional[str] = None
    tags: Optional[List[str]] = None
    ratings: Optional[dict] = None
    play_count: int = 0
    show_answers: bool = False
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class SaveGameInput(BaseModel):
    id: Optional[str] = None
    kind: str
    data: dict
    title: Optional[str] = None
    tags: Optional[List[str]] = None
    visibility: Optional[str] = "private"


# ---------- Routes ----------

@router.post("/", response_model=dict)
def save_game(input: SaveGameInput, db: Session = Depends(get_db), user: Optional[User] = Depends(get_current_user)):
    game_id = input.id or str(uuid.uuid4())[:8]

    existing = db.query(Game).filter(Game.id == game_id).first()

    if existing:
        existing.data = input.data
        existing.tags = input.tags
        existing.updated_at = __import__("datetime").datetime.utcnow()
    else:
        game = Game(
            id=game_id,
            kind=input.kind,
            data=input.data,
            owner_id=user.id if user else None,
            owner_name=user.name if user else None,
            visibility="private" if user else "link",
            tags=input.tags,
        )
        db.add(game)

    db.commit()
    return {"id": game_id, "play_url": f"/play/{input.kind}/{game_id}"}


@router.get("/{game_id}", response_model=Optional[GameOut])
def get_game(game_id: str, db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        return None

    # Fix missing fields (like frontend findGame)
    data = game.data or {}
    if not data.get("config"):
        return None
    if game.kind == "jeopardy" and not isinstance(data.get("rounds"), list):
        data["rounds"] = []
    if game.kind in ("quiz", "millionaire") and not isinstance(data.get("questions"), list):
        data["questions"] = []

    return GameOut(
        id=game.id,
        kind=game.kind,
        data=data,
        owner_id=game.owner_id,
        owner_name=game.owner_name,
        visibility=game.visibility,
        forked_from=game.forked_from,
        forked_owner_name=game.forked_owner_name,
        tags=game.tags,
        ratings=game.ratings_data,
        play_count=game.play_count,
        show_answers=game.show_answers,
        created_at=game.created_at.isoformat(),
        updated_at=game.updated_at.isoformat(),
    )


@router.get("/", response_model=List[GameOut])
def list_games(kind: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Game)
    if kind:
        query = query.filter(Game.kind == kind)
    games = query.order_by(Game.updated_at.desc()).all()

    return [
        GameOut(
            id=g.id,
            kind=g.kind,
            data=g.data,
            owner_id=g.owner_id,
            owner_name=g.owner_name,
            visibility=g.visibility,
            forked_from=g.forked_from,
            forked_owner_name=g.forked_owner_name,
            tags=g.tags,
            ratings=g.ratings_data,
            play_count=g.play_count,
            show_answers=g.show_answers,
            created_at=g.created_at.isoformat(),
            updated_at=g.updated_at.isoformat(),
        )
        for g in games
        if g.data and g.data.get("config")
    ]


@router.delete("/{game_id}")
def delete_game(game_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    game = db.query(Game).filter(Game.id == game_id, Game.owner_id == user.id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Игра не найдена")
    db.delete(game)
    db.commit()
    return {"ok": True}


@router.post("/{game_id}/fork")
def fork_game(game_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    src = db.query(Game).filter(Game.id == game_id).first()
    if not src:
        return None

    new_id = str(uuid.uuid4())[:8]
    new_game = Game(
        id=new_id,
        kind=src.kind,
        data=src.data,
        owner_id=user.id,
        owner_name=user.name,
        visibility="private",
        forked_from=src.id,
        forked_owner_name=src.owner_name or "неизвестный автор",
        tags=src.tags,
    )
    db.add(new_game)
    db.commit()
    return {"id": new_id}


@router.patch("/{game_id}/visibility")
def set_visibility(
    game_id: str,
    visibility: str = "private",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    game = db.query(Game).filter(Game.id == game_id, Game.owner_id == user.id).first()
    if not game:
        return {"ok": False}
    game.visibility = visibility
    db.commit()
    return {"ok": True}


@router.patch("/{game_id}/show-answers")
def set_show_answers(
    game_id: str,
    show_answers: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    game = db.query(Game).filter(Game.id == game_id, Game.owner_id == user.id).first()
    if not game:
        return {"ok": False}
    game.show_answers = show_answers
    db.commit()
    return {"ok": True}


@router.post("/{game_id}/rate")
def rate_game(
    game_id: str,
    rating: int = 1,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rating = max(1, min(5, rating))
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        return {"ok": False}

    # Upsert rating
    existing = db.query(Rating).filter(Rating.game_id == game_id, Rating.user_id == user.id).first()
    if existing:
        existing.value = rating
    else:
        db.add(Rating(game_id=game_id, user_id=user.id, value=rating))

    # Update ratings_data cache
    all_ratings = db.query(Rating).filter(Rating.game_id == game_id).all()
    game.ratings_data = {r.user_id: r.value for r in all_ratings}
    db.commit()
    return {"ok": True}


@router.patch("/{game_id}/play-count")
def increment_play_count(game_id: str, db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id).first()
    if game:
        game.play_count = (game.play_count or 0) + 1
        db.commit()
    return {"ok": True}