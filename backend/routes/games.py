import uuid
from typing import Optional, List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator

from database import supabase
from routes.auth import get_current_user, get_current_user_optional

router = APIRouter(prefix="/api/games", tags=["games"])

VALID_KINDS = {"quiz", "jeopardy", "millionaire"}
VALID_VISIBILITY = {"private", "link", "public"}


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

    @field_validator("kind")
    @classmethod
    def validate_kind(cls, v: str) -> str:
        if v not in VALID_KINDS:
            raise ValueError(f"Недопустимый тип игры: {v}")
        return v

    @field_validator("visibility")
    @classmethod
    def validate_visibility(cls, v: str) -> str:
        if v not in VALID_VISIBILITY:
            raise ValueError(f"Недопустимая видимость: {v}")
        return v


def _can_view(game: dict, user: Optional[dict]) -> bool:
    """Проверяет, может ли пользователь видеть игру."""
    if not game:
        return False
    if user and game.get("owner_id") == user["id"]:
        return True
    if game.get("visibility") == "public":
        return True
    if game.get("visibility") == "link":
        return True
    return False


@router.post("/", response_model=dict)
def save_game(input: SaveGameInput, user=Depends(get_current_user)):
    game_id = input.id or str(uuid.uuid4())

    res = supabase.table("games").select("*").eq("id", game_id).execute()

    if res.data:
        existing = res.data[0]
        if existing.get("owner_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Нет доступа к редактированию этой игры")
        
        supabase.table("games").update({
            "data": input.data,
            "tags": input.tags,
            "visibility": input.visibility,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", game_id).execute()
    else:
        supabase.table("games").insert({
            "id": game_id,
            "kind": input.kind,
            "data": input.data,
            "owner_id": user["id"] if user else None,
            "owner_name": user["name"] if user else None,
            "visibility": input.visibility or ("private" if user else "link"),
        }).execute()

    return {"id": game_id, "play_url": f"/play/{input.kind}/{game_id}"}


@router.get("/{game_id}", response_model=Optional[GameOut])
def get_game(game_id: str, user=Depends(get_current_user_optional)):
    res = supabase.table("games").select("*").eq("id", game_id).execute()
    if not res.data:
        return None

    game = res.data[0]
    
    if not _can_view(game, user):
        return None
    
    data = game.get("data") or {}
    if not data.get("config"):
        return None
    if game.get("kind") == "jeopardy" and not isinstance(data.get("rounds"), list):
        data["rounds"] = []
    if game.get("kind") in ("quiz", "millionaire") and not isinstance(data.get("questions"), list):
        data["questions"] = []

    ratings_res = supabase.table("ratings").select("*").eq("game_id", game_id).execute()
    if ratings_res.data:
        game["ratings"] = {str(r["user_id"]): r["value"] for r in ratings_res.data}

    return GameOut(**{**game, "data": data})


@router.get("/", response_model=dict)
def list_games(
    kind: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(get_current_user_optional),
):
    query = supabase.table("games").select("*", count="exact").order("updated_at", desc=True)
    
    if user:
        query = query.or_(f"owner_id.eq.{user['id']},visibility.eq.public")
    else:
        query = query.eq("visibility", "public")
    
    if kind:
        if kind not in VALID_KINDS:
            kind = None
        else:
            query = query.eq("kind", kind)
    
    query = query.range(offset, offset + limit - 1)
    res = query.execute()
    
    total = res.count if hasattr(res, 'count') else len(res.data or [])
    
    result = []
    for g in (res.data or []):
        if g.get("data") and g["data"].get("config"):
            g["ratings"] = g.pop("ratings_data", None)
            result.append(GameOut(**{**g, "data": g.get("data") or {}}))
    
    return {
        "games": result,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.delete("/{game_id}")
def delete_game(game_id: str, user=Depends(get_current_user)):
    res = supabase.table("games").select("*").eq("id", game_id).eq("owner_id", user["id"]).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Игра не найдена")
    supabase.table("games").delete().eq("id", game_id).execute()
    return {"ok": True}


@router.post("/{game_id}/fork")
def fork_game(game_id: str, user=Depends(get_current_user)):
    res = supabase.table("games").select("*").eq("id", game_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Игра не найдена")

    src = res.data[0]
    
    if src.get("visibility") not in ("public", "link") and src.get("owner_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Эту игру нельзя форкнуть")
    
    new_id = str(uuid.uuid4())
    supabase.table("games").insert({
        "id": new_id,
        "kind": src["kind"],
        "data": src["data"],
        "owner_id": user["id"],
        "owner_name": user["name"],
        "visibility": "private",
        "forked_from": src["id"],
        "forked_owner_name": src.get("owner_name") or "неизвестный автор",
        "tags": src.get("tags"),
    }).execute()
    return {"id": new_id}


@router.patch("/{game_id}/visibility")
def set_visibility(game_id: str, visibility: str = "private", user=Depends(get_current_user)):
    if visibility not in VALID_VISIBILITY:
        raise HTTPException(status_code=400, detail="Недопустимая видимость")
    res = supabase.table("games").update({"visibility": visibility}).eq("id", game_id).eq("owner_id", user["id"]).execute()
    return {"ok": bool(res.data)}


@router.patch("/{game_id}/show-answers")
def set_show_answers(game_id: str, show_answers: bool = False, user=Depends(get_current_user)):
    res = supabase.table("games").update({"show_answers": show_answers}).eq("id", game_id).eq("owner_id", user["id"]).execute()
    return {"ok": bool(res.data)}


@router.post("/{game_id}/rate")
def rate_game(game_id: str, rating: int = 1, user=Depends(get_current_user)):
    rating = max(1, min(5, rating))

    res = supabase.table("ratings").select("*").eq("game_id", game_id).eq("user_id", user["id"]).execute()
    if res.data:
        supabase.table("ratings").update({"value": rating}).eq("game_id", game_id).eq("user_id", user["id"]).execute()
    else:
        supabase.table("ratings").insert({
            "game_id": game_id,
            "user_id": user["id"],
            "value": rating,
        }).execute()

    return {"ok": True}


@router.patch("/{game_id}/play-count")
def increment_play_count(game_id: str):
    res = supabase.table("games").select("play_count").eq("id", game_id).execute()
    if res.data:
        count = (res.data[0].get("play_count") or 0) + 1
        supabase.table("games").update({"play_count": count}).eq("id", game_id).execute()
    return {"ok": True}