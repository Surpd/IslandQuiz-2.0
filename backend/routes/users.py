from typing import Optional, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from routes.auth import get_current_user
from database import get_db
from models import User, Game, Rating

router = APIRouter(prefix="/api/users", tags=["users"])


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


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    avatar: Optional[str] = None
    bio: Optional[str] = None
    subject: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True


class PublicProfile(BaseModel):
    user: UserOut
    games: List[GameOut]
    stats: dict


# ---------- Routes ----------

@router.get("/me", response_model=Optional[UserOut])
def get_me(current_user: User = Depends(get_current_user)):
    return UserOut(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        avatar=current_user.avatar,
        bio=current_user.bio,
        subject=current_user.subject,
        created_at=current_user.created_at.isoformat(),
    )


@router.patch("/me", response_model=Optional[UserOut])
def update_me(
    name: Optional[str] = None,
    avatar: Optional[str] = None,
    bio: Optional[str] = None,
    subject: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if name is not None:
        current_user.name = name
    if avatar is not None:
        current_user.avatar = avatar
    if bio is not None:
        current_user.bio = bio
    if subject is not None:
        current_user.subject = subject

    db.commit()
    db.refresh(current_user)
    return UserOut(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        avatar=current_user.avatar,
        bio=current_user.bio,
        subject=current_user.subject,
        created_at=current_user.created_at.isoformat(),
    )


@router.get("/{user_id}", response_model=Optional[PublicProfile])
def get_user_profile(user_id: str, db: Session = Depends(get_db), current_user: Optional[User] = Depends(get_current_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None

    # Get user's games
    all_games = db.query(Game).filter(Game.owner_id == user_id).all()

    # Filter visibility
    is_me = current_user and current_user.id == user_id
    visible = all_games if is_me else [g for g in all_games if g.visibility == "public"]

    # Calculate rating stats
    total_ratings = 0
    rating_sum = 0
    for g in all_games:
        if g.ratings_data:
            values = list(g.ratings_data.values())
            if values:
                total_ratings += len(values)
                rating_sum += sum(values)
    avg_rating = rating_sum / total_ratings if total_ratings else 0

    return {
        "user": UserOut(
            id=user.id,
            email=user.email,
            name=user.name,
            avatar=user.avatar,
            bio=user.bio,
            subject=user.subject,
            created_at=user.created_at.isoformat(),
        ),
        "games": [
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
            for g in visible
            if g.data and g.data.get("config")
        ],
        "stats": {
            "gamesCount": len(all_games),
            "avgRating": round(avg_rating, 1),
            "totalRatings": total_ratings,
        },
    }


@router.get("/{user_id}/games", response_model=List[GameOut])
def get_user_games(user_id: str, db: Session = Depends(get_db), current_user: Optional[User] = Depends(get_current_user)):
    games = db.query(Game).filter(Game.owner_id == user_id).all()
    is_me = current_user and current_user.id == user_id
    visible = games if is_me else [g for g in games if g.visibility == "public"]

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
        for g in visible
        if g.data and g.data.get("config")
    ]