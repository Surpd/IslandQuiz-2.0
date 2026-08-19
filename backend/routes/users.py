from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from datetime import datetime
from database import supabase
from routes.auth import get_current_user

router = APIRouter(prefix="/api/users", tags=["users"])
DB_ERROR_DETAIL = "Ошибка базы данных"


def _db_response(query):
    try:
        response = query.execute()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL) from exc
    if response is None:
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL)
    return response


def _response_rows(response) -> list[dict]:
    rows = getattr(response, "data", None)
    if rows is None:
        return []
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL)
    return rows


def _db_rows(query) -> list[dict]:
    return _response_rows(_db_response(query))


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
    email: Optional[str] = None
    telegram_id: Optional[str] = None
    name: str
    avatar: Optional[str] = None
    bio: Optional[str] = None
    subject: Optional[str] = None
    role: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ProfileUpdateInput(BaseModel):
    name: Optional[str] = None
    avatar: Optional[str] = None
    bio: Optional[str] = None
    subject: Optional[str] = None


class PublicProfile(BaseModel):
    user: UserOut
    games: List[GameOut]
    stats: dict


@router.get("/me", response_model=Optional[UserOut])
def get_me(current_user=Depends(get_current_user)):
    return UserOut(**current_user)


@router.patch("/me", response_model=Optional[UserOut])
def update_me(
    input: ProfileUpdateInput,
    current_user=Depends(get_current_user),
):
    updates = {}
    if input.name is not None:
        updates["name"] = input.name
    if input.avatar is not None:
        updates["avatar"] = input.avatar
    if input.bio is not None:
        updates["bio"] = input.bio
    if input.subject is not None:
        updates["subject"] = input.subject

    if updates:
        _db_rows(supabase.table("users").update(updates).eq("id", current_user["id"]))

    rows = _db_rows(supabase.table("users").select("*").eq("id", current_user["id"]))
    return UserOut(**rows[0]) if rows else None


@router.delete("/me", status_code=204)
def delete_me(
    response: Response,
    current_user=Depends(get_current_user),
):
    _db_rows(supabase.table("games").delete().eq("owner_id", current_user["id"]))
    _db_rows(supabase.table("users").delete().eq("id", current_user["id"]))
    response.status_code = 204


@router.get("/{user_id}", response_model=Optional[PublicProfile])
def get_user_profile(user_id: str, current_user=Depends(get_current_user)):
    user_rows = _db_rows(supabase.table("users").select("*").eq("id", user_id))
    if not user_rows:
        return None
    user = user_rows[0]

    all_games = _db_rows(supabase.table("games").select("*").eq("owner_id", user_id))

    is_me = current_user and current_user["id"] == user_id
    visible = all_games if is_me else [g for g in all_games if g.get("visibility") == "public"]

    total_ratings = 0
    rating_sum = 0
    for g in all_games:
        if g.get("ratings_data"):
            if not isinstance(g["ratings_data"], dict) or any(not isinstance(value, (int, float)) for value in g["ratings_data"].values()):
                raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL)
            values = list(g["ratings_data"].values())
            if values:
                total_ratings += len(values)
                rating_sum += sum(values)
    avg_rating = rating_sum / total_ratings if total_ratings else 0

    return {
        "user": UserOut(**user),
        "games": [
            GameOut(**{**g, "data": g.get("data") or {}})
            for g in visible
            if g.get("data") and g["data"].get("config")
        ],
        "stats": {
            "gamesCount": len(all_games),
            "avgRating": round(avg_rating, 1),
            "totalRatings": total_ratings,
        },
    }


@router.get("/{user_id}/games", response_model=dict)
def get_user_games(
    user_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user=Depends(get_current_user),
):
    query = supabase.table("games").select("*", count="exact").eq("owner_id", user_id).order("updated_at", desc=True)
    query = query.range(offset, offset + limit - 1)
    response = _db_response(query)
    all_games = _response_rows(response)
    total = response.count if isinstance(getattr(response, "count", None), int) else len(all_games)

    is_me = current_user and current_user["id"] == user_id
    visible = all_games if is_me else [g for g in all_games if g.get("visibility") == "public"]

    return {
        "games": [
            GameOut(**{**g, "data": g.get("data") or {}})
            for g in visible
            if g.get("data") and g["data"].get("config")
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
