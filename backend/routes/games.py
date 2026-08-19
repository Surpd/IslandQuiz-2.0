import uuid
from typing import Optional, List, Literal
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator

from database import supabase
from routes.auth import get_current_user, get_current_user_optional

router = APIRouter(prefix="/api/games", tags=["games"])

VALID_KINDS = {"quiz", "jeopardy", "millionaire"}
VALID_VISIBILITY = {"private", "link", "public"}
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


class SaveGameInput(BaseModel):
    id: Optional[str] = None
    kind: str
    data: dict
    title: Optional[str] = None
    tags: Optional[List[str]] = None
    visibility: Optional[Literal["private", "link", "public"]] = None

    @field_validator("kind")
    @classmethod
    def validate_kind(cls, v: str) -> str:
        if v not in VALID_KINDS:
            raise ValueError(f"Недопустимый тип игры: {v}")
        return v

    @field_validator("visibility")
    @classmethod
    def validate_visibility(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_VISIBILITY:
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


def _attach_play_counts(games: list[dict]) -> list[dict]:
    game_ids = [g["id"] for g in games if g.get("id")]
    if not game_ids:
        return games

    counts = {game_id: 0 for game_id in game_ids}
    for table in ("quiz_results", "millionaire_results", "jeopardy_results", "online_quiz_results"):
        rows = _db_rows(supabase.table(table).select("game_id").in_("game_id", game_ids))
        for row in rows:
            if row.get("game_id") in counts:
                counts[row["game_id"]] += 1

    for game in games:
        game["play_count"] = counts.get(game.get("id"), 0)
    return games


@router.post("/", response_model=dict)
def save_game(input: SaveGameInput, user=Depends(get_current_user)):
    game_id = input.id or str(uuid.uuid4())

    existing_rows = _db_rows(supabase.table("games").select("*").eq("id", game_id))

    if existing_rows:
        existing = existing_rows[0]
        if existing.get("owner_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Нет доступа к редактированию этой игры")
        
        update = {
            "data": input.data,
            "tags": input.tags,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if input.visibility is not None:
            update["visibility"] = input.visibility
        _db_rows(supabase.table("games").update(update).eq("id", game_id))
    else:
        _db_rows(supabase.table("games").insert({
            "id": game_id,
            "kind": input.kind,
            "data": input.data,
            "owner_id": user["id"] if user else None,
            "owner_name": user["name"] if user else None,
            "visibility": input.visibility or ("private" if user else "link"),
        }))

    return {"id": game_id, "play_url": f"/play/{input.kind}/{game_id}"}


@router.get("/{game_id}", response_model=Optional[GameOut])
def get_game(game_id: str, user=Depends(get_current_user_optional)):
    game_rows = _db_rows(supabase.table("games").select("*").eq("id", game_id))
    if not game_rows:
        return None

    game = game_rows[0]
    
    if not _can_view(game, user):
        return None
    
    data = game.get("data") or {}
    if not data.get("config"):
        return None
    if game.get("kind") == "jeopardy" and not isinstance(data.get("rounds"), list):
        data["rounds"] = []
    if game.get("kind") in ("quiz", "millionaire") and not isinstance(data.get("questions"), list):
        data["questions"] = []

    rating_rows = _db_rows(supabase.table("ratings").select("*").eq("game_id", game_id))
    if rating_rows:
        game["ratings"] = {str(r["user_id"]): r["value"] for r in rating_rows}

    game = _attach_play_counts([game])[0]
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
    res = _db_response(query)
    rows = _response_rows(res)

    total = getattr(res, "count", None)
    total = total if isinstance(total, int) else len(rows)
    
    # Получаем все game_id из результата
    game_ids = [g["id"] for g in rows if g.get("data") and g["data"].get("config")]
    
    # Загружаем рейтинги для всех игр одним запросом
    ratings_map = {}
    if game_ids:
        rating_rows = _db_rows(supabase.table("ratings").select("*").in_("game_id", game_ids))
        for r in rating_rows:
            gid = r["game_id"]
            if gid not in ratings_map:
                ratings_map[gid] = {}
            ratings_map[gid][str(r["user_id"])] = r["value"]
    
    result = []
    visible_games = _attach_play_counts(rows)
    for g in visible_games:
        if g.get("data") and g["data"].get("config"):
            g["ratings"] = ratings_map.get(g["id"], None)
            result.append(GameOut(**{**g, "data": g.get("data") or {}}))
    
    return {
        "games": result,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.delete("/{game_id}")
def delete_game(game_id: str, user=Depends(get_current_user)):
    game_rows = _db_rows(supabase.table("games").select("*").eq("id", game_id).eq("owner_id", user["id"]))
    if not game_rows:
        raise HTTPException(status_code=404, detail="Игра не найдена")
    _db_rows(supabase.table("games").delete().eq("id", game_id))
    return {"ok": True}


@router.post("/{game_id}/fork")
def fork_game(game_id: str, user=Depends(get_current_user)):
    game_rows = _db_rows(supabase.table("games").select("*").eq("id", game_id))
    if not game_rows:
        raise HTTPException(status_code=404, detail="Игра не найдена")

    src = game_rows[0]
    
    if src.get("visibility") not in ("public", "link") and src.get("owner_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Эту игру нельзя форкнуть")
    
    new_id = str(uuid.uuid4())
    _db_rows(supabase.table("games").insert({
        "id": new_id,
        "kind": src["kind"],
        "data": src["data"],
        "owner_id": user["id"],
        "owner_name": user["name"],
        "visibility": "private",
        "forked_from": src["id"],
        "forked_owner_name": src.get("owner_name") or "неизвестный автор",
        "tags": src.get("tags"),
    }))
    return {"id": new_id}


@router.patch("/{game_id}/visibility")
def set_visibility(game_id: str, visibility: str = "private", user=Depends(get_current_user)):
    if visibility not in VALID_VISIBILITY:
        raise HTTPException(status_code=400, detail="Недопустимая видимость")
    rows = _db_rows(supabase.table("games").update({"visibility": visibility}).eq("id", game_id).eq("owner_id", user["id"]))
    return {"ok": bool(rows)}


@router.patch("/{game_id}/show-answers")
def set_show_answers(game_id: str, show_answers: bool = False, user=Depends(get_current_user)):
    rows = _db_rows(supabase.table("games").update({"show_answers": show_answers}).eq("id", game_id).eq("owner_id", user["id"]))
    return {"ok": bool(rows)}


@router.post("/{game_id}/rate")
def rate_game(game_id: str, rating: int = 1, user=Depends(get_current_user)):
    rating = max(1, min(5, rating))

    rating_rows = _db_rows(supabase.table("ratings").select("*").eq("game_id", game_id).eq("user_id", user["id"]))
    if rating_rows:
        _db_rows(supabase.table("ratings").update({"value": rating}).eq("game_id", game_id).eq("user_id", user["id"]))
    else:
        _db_rows(supabase.table("ratings").insert({
            "game_id": game_id,
            "user_id": user["id"],
            "value": rating,
        }))

    return {"ok": True}


@router.patch("/{game_id}/play-count")
def increment_play_count(game_id: str):
    # Атомарный инкремент через SQL
    _db_rows(supabase.rpc("increment_play_count", {"game_id": game_id}))
    return {"ok": True}
