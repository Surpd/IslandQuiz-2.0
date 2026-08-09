from typing import Optional, List

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel
from datetime import datetime
from database import supabase
from routes.auth import get_current_user

router = APIRouter(prefix="/api/users", tags=["users"])


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


class PublicProfile(BaseModel):
    user: UserOut
    games: List[GameOut]
    stats: dict


@router.get("/me", response_model=Optional[UserOut])
def get_me(current_user=Depends(get_current_user)):
    return UserOut(**current_user)


@router.patch("/me", response_model=Optional[UserOut])
def update_me(
    name: Optional[str] = None,
    avatar: Optional[str] = None,
    bio: Optional[str] = None,
    subject: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    updates = {}
    if name is not None:
        updates["name"] = name
    if avatar is not None:
        updates["avatar"] = avatar
    if bio is not None:
        updates["bio"] = bio
    if subject is not None:
        updates["subject"] = subject

    if updates:
        supabase.table("users").update(updates).eq("id", current_user["id"]).execute()

    res = supabase.table("users").select("*").eq("id", current_user["id"]).execute()
    return UserOut(**res.data[0]) if res.data else None


@router.delete("/me", status_code=204)
def delete_me(
    response: Response,
    current_user=Depends(get_current_user),
):
    supabase.table("games").delete().eq("owner_id", current_user["id"]).execute()
    supabase.table("users").delete().eq("id", current_user["id"]).execute()
    response.status_code = 204


@router.get("/{user_id}", response_model=Optional[PublicProfile])
def get_user_profile(user_id: str, current_user=Depends(get_current_user)):
    user_res = supabase.table("users").select("*").eq("id", user_id).execute()
    if not user_res.data:
        return None
    user = user_res.data[0]

    games_res = supabase.table("games").select("*").eq("owner_id", user_id).execute()
    all_games = games_res.data or []

    is_me = current_user and current_user["id"] == user_id
    visible = all_games if is_me else [g for g in all_games if g.get("visibility") == "public"]

    total_ratings = 0
    rating_sum = 0
    for g in all_games:
        if g.get("ratings_data"):
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
    res = query.execute()
    
    total = res.count if hasattr(res, 'count') else len(res.data or [])
    all_games = res.data or []

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
