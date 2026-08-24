import copy
import uuid
from typing import Optional, List, Literal
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator

from database import supabase
from routes.auth import get_current_user, get_current_user_optional
from services.role_limits import get_user_limit
from services.tags import TagValidationError, normalize_game_tags, normalize_legacy_tags

router = APIRouter(prefix="/api/games", tags=["games"])

VALID_KINDS = {"quiz", "jeopardy", "millionaire"}
VALID_VISIBILITY = {"private", "link", "public"}
DB_ERROR_DETAIL = "Ошибка базы данных"


def _without_persisted_theme(data: dict) -> dict:
    cleaned = copy.deepcopy(data)
    config = cleaned.get("config")
    if isinstance(config, dict):
        config.pop("theme", None)
    return cleaned


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


def _db_count(query) -> int:
    response = _db_response(query)
    count = getattr(response, "count", None)
    return count if isinstance(count, int) else len(_response_rows(response))


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
    show_answers: Optional[bool] = None

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

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return None
        try:
            return normalize_game_tags(v)
        except TagValidationError as exc:
            raise ValueError(str(exc)) from exc


def _ensure_tag_dictionary(tags: list[str]) -> None:
    try:
        for tag in tags:
            canonical = tag.casefold()
            rows = _db_rows(supabase.table("tags").select("id").eq("canonical_name", canonical))
            if not rows:
                _db_rows(supabase.table("tags").insert({"name": tag, "canonical_name": canonical, "is_system": False}))
    except HTTPException:
        # The games JSONB field remains the compatibility source until the
        # optional Tag System migration has been applied.
        return


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


def _is_privileged(game: dict, user: Optional[dict]) -> bool:
    return bool(user and (game.get("owner_id") == user.get("id") or user.get("role") == "admin"))


def _permission_config(game: dict) -> dict:
    data = game.get("data") or {}
    config = data.get("config") if isinstance(data, dict) else None
    return config if isinstance(config, dict) else {}


def _allows_preview(game: dict, user: Optional[dict]) -> bool:
    return _is_privileged(game, user) or _permission_config(game).get("allowPreview", True) is not False


def _allows_copy(game: dict, user: Optional[dict]) -> bool:
    return _is_privileged(game, user) or _permission_config(game).get("allowCopy", True) is not False


def _redact_preview_data(game: dict) -> dict:
    """Keep game metadata and shape, but remove playable question content."""
    data = _without_persisted_theme(game.get("data") or {})
    kind = game.get("kind")
    if not isinstance(data, dict):
        return {"config": {}}
    if kind == "quiz":
        data["questions"] = [
            {
                key: value
                for key, value in question.items()
                if key in {"id", "type", "points", "time"}
            }
            for question in data.get("questions", [])
            if isinstance(question, dict)
        ]
        data["variants"] = [
            {**variant, "questions": [
                {key: value for key, value in question.items() if key in {"id", "type", "points", "time"}}
                for question in variant.get("questions", []) if isinstance(question, dict)
            ]}
            for variant in data.get("variants", []) if isinstance(variant, dict)
        ]
    elif kind == "jeopardy":
        data["rounds"] = [
            [
                {
                    "category": category.get("category", ""),
                    "questions": [
                        {"points": q.get("points", 0)}
                        for q in category.get("questions", [])
                        if isinstance(q, dict)
                    ],
                }
                for category in round_items
                if isinstance(category, dict)
            ]
            for round_items in data.get("rounds", [])
            if isinstance(round_items, list)
        ]
        final = data.get("final")
        data["final"] = {"category": final.get("category", "")} if isinstance(final, dict) else {}
    elif kind == "millionaire":
        data["questions"] = [
            {"money": question.get("money", 0)}
            for question in data.get("questions", [])
            if isinstance(question, dict)
        ]
    return data


def _safe_preview_display(display: object) -> dict | None:
    if not isinstance(display, dict):
        return None
    safe: dict = {}
    matching = display.get("matching")
    if isinstance(matching, dict):
        left = sorted(value for value in matching.get("left", []) if isinstance(value, str))
        right = sorted(value for value in matching.get("right", []) if isinstance(value, str))
        if left or right:
            safe["matching"] = {"left": left, "right": right}
    ordering = sorted(value for value in display.get("ordering", []) if isinstance(value, str))
    if ordering:
        safe["ordering"] = ordering
    return safe or None


def _redact_preview_answers(game: dict) -> dict:
    """Keep preview questions while removing correct-answer data."""
    data = _without_persisted_theme(game.get("data") or {})
    kind = game.get("kind")
    if not isinstance(data, dict):
        return {"config": {}}
    if kind == "quiz":
        questions = []
        for question in data.get("questions", []):
            if not isinstance(question, dict):
                continue
            safe_question = {key: value for key, value in question.items() if key != "answer"}
            safe_display = _safe_preview_display(safe_question.get("display"))
            if safe_display is None:
                safe_question.pop("display", None)
            else:
                safe_question["display"] = safe_display
            questions.append(safe_question)
        data["questions"] = questions
        safe_variants = []
        for variant in data.get("variants", []):
            if not isinstance(variant, dict):
                continue
            safe_questions = []
            for question in variant.get("questions", []):
                if not isinstance(question, dict):
                    continue
                safe_question = {key: value for key, value in question.items() if key != "answer"}
                safe_display = _safe_preview_display(safe_question.get("display"))
                if safe_display is None:
                    safe_question.pop("display", None)
                else:
                    safe_question["display"] = safe_display
                safe_questions.append(safe_question)
            safe_variants.append({**variant, "questions": safe_questions})
        data["variants"] = safe_variants
    elif kind == "jeopardy":
        data["rounds"] = [
            [
                {
                    "category": category.get("category", ""),
                    "questions": [
                        {key: value for key, value in question.items() if key != "a"}
                        for question in category.get("questions", [])
                        if isinstance(question, dict)
                    ],
                }
                for category in round_items
                if isinstance(category, dict)
            ]
            for round_items in data.get("rounds", [])
            if isinstance(round_items, list)
        ]
        final = data.get("final")
        if isinstance(final, dict):
            data["final"] = {key: value for key, value in final.items() if key != "a"}
    elif kind == "millionaire":
        data["questions"] = [
            {
                **{key: value for key, value in question.items() if key != "options"},
                "options": [
                    {key: value for key, value in option.items() if key != "correct"}
                    for option in question.get("options", [])
                    if isinstance(option, dict)
                ],
            }
            for question in data.get("questions", [])
            if isinstance(question, dict)
        ]
        data["variants"] = [
            {**variant, "questions": [
                {key: value for key, value in question.items() if key in {"id", "type", "points", "time"}}
                for question in variant.get("questions", []) if isinstance(question, dict)
            ]}
            for variant in data.get("variants", []) if isinstance(variant, dict)
        ]
    return data


def _preview_data(game: dict, user: Optional[dict]) -> dict:
    if not _allows_preview(game, user):
        return _redact_preview_data(game)
    if not _is_privileged(game, user) and not bool(game.get("show_answers")):
        return _redact_preview_answers(game)
    return _without_persisted_theme(game.get("data") or {})


def _normalized_game_data(game: dict, data: dict) -> dict:
    data = _without_persisted_theme(data)
    if not data.get("config"):
        return {}
    if game.get("kind") == "jeopardy" and not isinstance(data.get("rounds"), list):
        data["rounds"] = []
    if game.get("kind") in ("quiz", "millionaire") and not isinstance(data.get("questions"), list):
        data["questions"] = []
    return data


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


def _enforce_game_limits(user: dict, visibility: str, *, creating: bool, was_public: bool = False) -> None:
    if creating:
        total_limit = get_user_limit(user, "saved_games")
        if total_limit is not None:
            total = _db_count(supabase.table("games").select("id", count="exact").eq("owner_id", user["id"]))
            if total >= total_limit:
                raise HTTPException(status_code=429, detail="Вы достигли лимита сохранённых игр.")

    if visibility == "public" and (creating or not was_public):
        public_limit = get_user_limit(user, "public_games")
        if public_limit is not None:
            total = _db_count(
                supabase.table("games").select("id", count="exact").eq("owner_id", user["id"]).eq("visibility", "public")
            )
            if total >= public_limit:
                raise HTTPException(status_code=429, detail="Вы достигли лимита публичных игр.")


@router.post("/", response_model=dict)
def save_game(input: SaveGameInput, user=Depends(get_current_user)):
    game_id = input.id or str(uuid.uuid4())
    data = _without_persisted_theme(input.data)

    existing_rows = _db_rows(supabase.table("games").select("*").eq("id", game_id))

    if existing_rows:
        existing = existing_rows[0]
        if existing.get("owner_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Нет доступа к редактированию этой игры")
        
        update = {
            "data": data,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if input.show_answers is not None:
            update["show_answers"] = input.show_answers
        if input.tags is not None:
            _ensure_tag_dictionary(input.tags)
            update["tags"] = input.tags
        if input.visibility is not None:
            _enforce_game_limits(
                user,
                input.visibility,
                creating=False,
                was_public=existing.get("visibility") == "public",
            )
            update["visibility"] = input.visibility
        _db_rows(supabase.table("games").update(update).eq("id", game_id))
    else:
        visibility = input.visibility or "private"
        _enforce_game_limits(user, visibility, creating=True)
        if input.tags is not None:
            _ensure_tag_dictionary(input.tags)
        _db_rows(supabase.table("games").insert({
            "id": game_id,
            "kind": input.kind,
            "data": data,
            "owner_id": user["id"] if user else None,
            "owner_name": user["name"] if user else None,
            "visibility": visibility,
            "show_answers": input.show_answers if input.show_answers is not None else False,
            "tags": input.tags,
        }))

    return {"id": game_id, "play_url": f"/play/{input.kind}/{game_id}"}


@router.get("/{game_id}/preview", response_model=Optional[GameOut])
def get_game_preview(game_id: str, user=Depends(get_current_user_optional)):
    game_rows = _db_rows(supabase.table("games").select("*").eq("id", game_id))
    if not game_rows:
        return None
    game = game_rows[0]
    if not _can_view(game, user):
        return None
    data = _preview_data(game, user)
    data = _normalized_game_data(game, data)
    if not data:
        return None
    return GameOut(**{**game, "data": data})


@router.get("/{game_id}/play", response_model=Optional[GameOut])
def get_game_for_play(game_id: str, user=Depends(get_current_user_optional)):
    """Return playable content after the caller has accessed the game."""
    game_rows = _db_rows(supabase.table("games").select("*").eq("id", game_id))
    if not game_rows:
        return None
    game = game_rows[0]
    if not _can_view(game, user):
        return None
    data = _normalized_game_data(game, game.get("data") or {})
    if not data:
        return None
    return GameOut(**{**game, "data": data})


@router.get("/{game_id}", response_model=Optional[GameOut])
def get_game(game_id: str, user=Depends(get_current_user_optional)):
    game_rows = _db_rows(supabase.table("games").select("*").eq("id", game_id))
    if not game_rows:
        return None

    game = game_rows[0]
    
    if not _can_view(game, user):
        return None
    
    data = _normalized_game_data(game, _preview_data(game, user))
    if not data:
        return None

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
            data = _preview_data(g, user)
            result.append(GameOut(**{**g, "data": data}))
    
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
    if not _allows_copy(src, user):
        raise HTTPException(status_code=403, detail="Автор запретил копирование этой игры")
    
    new_id = str(uuid.uuid4())
    _db_rows(supabase.table("games").insert({
        "id": new_id,
        "kind": src["kind"],
        "data": _without_persisted_theme(src["data"]),
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
