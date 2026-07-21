import uuid
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import supabase
from routes.auth import get_current_user

router = APIRouter(prefix="/api/games", tags=["games"])


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


@router.post("/", response_model=dict)
def save_game(input: SaveGameInput, user=Depends(get_current_user)):
    game_id = input.id or str(uuid.uuid4())[:8]

    res = supabase.table("games").select("*").eq("id", game_id).execute()

    if res.data:
        supabase.table("games").update({
            "data": input.data,
            "tags": input.tags,
            "visibility": input.visibility,  # ← добавить
            "updated_at": datetime.utcnow().isoformat(),
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
def get_game(game_id: str):
    res = supabase.table("games").select("*").eq("id", game_id).execute()
    if not res.data:
        return None

    game = res.data[0]
    data = game.get("data") or {}
    if not data.get("config"):
        return None
    if game.get("kind") == "jeopardy" and not isinstance(data.get("rounds"), list):
        data["rounds"] = []
    if game.get("kind") in ("quiz", "millionaire") and not isinstance(data.get("questions"), list):
        data["questions"] = []

    return GameOut(**{**game, "data": data})


@router.get("/", response_model=List[GameOut])
def list_games(kind: Optional[str] = None):
    query = supabase.table("games").select("*").order("updated_at", desc=True)
    if kind:
        query = query.eq("kind", kind)
    res = query.execute()

    return [
        GameOut(**{**g, "data": g.get("data") or {}})
        for g in (res.data or [])
        if g.get("data") and g["data"].get("config")
    ]


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
        return None

    src = res.data[0]
    new_id = str(uuid.uuid4())[:8]
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
    res = supabase.table("games").update({"visibility": visibility}).eq("id", game_id).eq("owner_id", user["id"]).execute()
    return {"ok": bool(res.data)}


@router.patch("/{game_id}/show-answers")
def set_show_answers(game_id: str, show_answers: bool = False, user=Depends(get_current_user)):
    res = supabase.table("games").update({"show_answers": show_answers}).eq("id", game_id).eq("owner_id", user["id"]).execute()
    return {"ok": bool(res.data)}


@router.post("/{game_id}/rate")
def rate_game(game_id: str, rating: int = 1, user=Depends(get_current_user)):
    rating = max(1, min(5, rating))

    # Upsert rating
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