from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Any, Literal, Optional, List
from datetime import datetime, timedelta, timezone
import json
import asyncio
import time
import os

from database import supabase
from routes.auth import get_current_user
from services.error_logging import parse_error_log
from services.role_limits import get_role_limits, normalize_limits, save_role_limits
from services.official_content import validate_pack

router = APIRouter(prefix="/api/admin", tags=["admin"])

DEFAULT_GROQ_MODEL = os.getenv(
    "GROQ_MODEL",
    "qwen/qwen3.6-27b",
)
DB_ERROR_DETAIL = "Ошибка базы данных"
AI_ERROR_DETAIL = "Ошибка AI-провайдера"


# ==================== HELPERS ====================

def require_admin(user):
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")


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
    if isinstance(count, int):
        return count
    return len(_response_rows(response))


def _call_ai(model: str, prompt: str, temperature: float = 0.8) -> tuple[str, int]:
    """Use the same Groq client and JSON-mode settings as production generation."""
    from routes.ai import call_openai

    started_at = time.perf_counter()
    raw = asyncio.run(call_openai(prompt, model=model, temperature=temperature))
    return raw, round((time.perf_counter() - started_at) * 1000)


def clean_json(raw: str) -> str:
    cleaned = raw.strip()
    if "```" in cleaned:
        if "```json" in cleaned:
            cleaned = cleaned.split("```json")[1].split("```")[0]
        else:
            cleaned = cleaned.split("```")[1].split("```")[0]
    return cleaned.strip()


# ==================== SCHEMAS ====================

class AITestRequest(BaseModel):
    topic: str
    type: str = "choice"
    format: str = "quiz-choice"
    wishes: Optional[str] = None
    model: Optional[str] = DEFAULT_GROQ_MODEL
    temperature: float = 0.8


class AITestQuizRequest(BaseModel):
    topic: str
    count: int = 10
    wishes: Optional[str] = None
    model: Optional[str] = DEFAULT_GROQ_MODEL


class AITestJeopardyCategoriesRequest(BaseModel):
    topic: str
    wishes: Optional[str] = None
    model: Optional[str] = DEFAULT_GROQ_MODEL


class AITestJeopardyQuestionsRequest(BaseModel):
    category: str
    empty_slots: List[int] = [100, 200, 300, 400, 500]
    wishes: Optional[str] = None
    model: Optional[str] = DEFAULT_GROQ_MODEL


class OfficialContentImportInput(BaseModel):
    owner_id: str = Field(min_length=1, max_length=100)
    pack: dict[str, Any]


# ==================== AI LAB ====================

@router.post("/ai/test")
def ai_test(req: AITestRequest, user=Depends(get_current_user)):
    require_admin(user)
    from services.ai_prompts import generate_question_prompt

    prompt = generate_question_prompt(
        topic=req.topic, question_type=req.type,
        difficulty="mixed", wishes=req.wishes, count=3,
    )
    raw, duration_ms = _call_ai(req.model, prompt, req.temperature)

    parsed = None
    error = None
    try:
        result = json.loads(clean_json(raw))
        variants = None
        if isinstance(result, dict):
            if "variants" in result:
                variants = result["variants"]
                if isinstance(variants, dict) and "questions" in variants:
                    variants = variants["questions"]
            elif "questions" in result:
                variants = result["questions"]
            else:
                variants = [result]
        elif isinstance(result, list):
            variants = result
        parsed = {"variants": variants}
    except Exception as e:
        error = str(e)

    return {"prompt": prompt, "raw": raw, "parsed": parsed, "error": error, "model": req.model, "duration_ms": duration_ms}


@router.post("/ai/test-quiz")
def ai_test_quiz(req: AITestQuizRequest, user=Depends(get_current_user)):
    require_admin(user)
    from services.ai_prompts import generate_quiz_prompt
    prompt = generate_quiz_prompt(topic=req.topic, count=req.count, wishes=req.wishes)
    raw, duration_ms = _call_ai(req.model, prompt)
    parsed = None
    error = None
    try:
        parsed = json.loads(clean_json(raw))
    except Exception as e:
        error = str(e)
    return {"prompt": prompt, "raw": raw, "parsed": parsed, "error": error, "model": req.model, "duration_ms": duration_ms}


@router.post("/ai/test-jeopardy-categories")
def ai_test_jeopardy_categories(req: AITestJeopardyCategoriesRequest, user=Depends(get_current_user)):
    require_admin(user)
    from services.ai_prompts import generate_jeopardy_categories_prompt
    prompt = generate_jeopardy_categories_prompt(topic=req.topic, wishes=req.wishes)
    raw, duration_ms = _call_ai(req.model, prompt)
    parsed = None
    error = None
    try:
        parsed = json.loads(clean_json(raw))
    except Exception as e:
        error = str(e)
    return {"prompt": prompt, "raw": raw, "parsed": parsed, "error": error, "model": req.model, "duration_ms": duration_ms}


@router.post("/ai/test-jeopardy-questions")
def ai_test_jeopardy_questions(req: AITestJeopardyQuestionsRequest, user=Depends(get_current_user)):
    require_admin(user)
    from services.ai_prompts import generate_jeopardy_questions_prompt
    prompt = generate_jeopardy_questions_prompt(category=req.category, empty_slots=req.empty_slots, wishes=req.wishes)
    raw, duration_ms = _call_ai(req.model, prompt)
    parsed = None
    error = None
    try:
        parsed = json.loads(clean_json(raw))
    except Exception as e:
        error = str(e)
    return {"prompt": prompt, "raw": raw, "parsed": parsed, "error": error, "model": req.model, "duration_ms": duration_ms}


# ==================== USERS ====================

@router.get("/users")
def list_users(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(get_current_user),
):
    require_admin(user)
    query = supabase.table("users").select("*", count="exact").order("created_at", desc=True) \
        .range(offset, offset + limit - 1)
    response = _db_response(query)
    rows = _response_rows(response)
    total = response.count if isinstance(getattr(response, "count", None), int) else len(rows)
    return {"users": rows, "total": total, "limit": limit, "offset": offset}


@router.post("/users/{user_id}/ban")
def toggle_ban(user_id: str, user=Depends(get_current_user)):
    require_admin(user)
    rows = _db_rows(supabase.table("users").select("banned").eq("id", user_id))
    if rows:
        new_status = not rows[0].get("banned", False)
        _db_rows(supabase.table("users").update({"banned": new_status}).eq("id", user_id))
    return {"ok": True}


@router.post("/users/{user_id}/make-admin")
def make_admin(user_id: str, user=Depends(get_current_user)):
    require_admin(user)
    _db_rows(supabase.table("users").update({"role": "admin"}).eq("id", user_id))
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(user_id: str, user=Depends(get_current_user)):
    require_admin(user)
    _db_rows(supabase.table("users").delete().eq("id", user_id))
    return {"ok": True}


# ==================== GAMES ====================

@router.get("/games")
def list_all_games(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(get_current_user),
):
    require_admin(user)
    query = supabase.table("games").select("*", count="exact").order("updated_at", desc=True) \
        .range(offset, offset + limit - 1)
    response = _db_response(query)
    rows = _response_rows(response)
    total = response.count if isinstance(getattr(response, "count", None), int) else len(rows)
    return {"games": rows, "total": total, "limit": limit, "offset": offset}


@router.delete("/games/{game_id}")
def admin_delete_game(game_id: str, user=Depends(get_current_user)):
    require_admin(user)
    _db_rows(supabase.table("games").delete().eq("id", game_id))
    return {"ok": True}


def _official_import_context(owner_id: str, content_ids: list[str]) -> tuple[dict[str, Any] | None, dict[str, str], dict[str, str]]:
    owner_rows = _db_rows(supabase.table("users").select("id,name").eq("id", owner_id))
    owner = owner_rows[0] if owner_rows else None
    canonical_tags: dict[str, str] = {}
    for row in _db_rows(supabase.table("tags").select("name,canonical_name")):
        name = row.get("name")
        canonical = row.get("canonical_name")
        if isinstance(name, str) and isinstance(canonical, str):
            canonical_tags[canonical] = name
    existing: dict[str, str] = {}
    if content_ids:
        for row in _db_rows(supabase.table("games").select("id,official_content_id").in_("official_content_id", content_ids)):
            content_id = row.get("official_content_id")
            game_id = row.get("id")
            if isinstance(content_id, str) and isinstance(game_id, str):
                existing[content_id] = game_id
    return owner, canonical_tags, existing


def _official_preview(input: OfficialContentImportInput) -> tuple[dict[str, Any], dict[str, Any] | None]:
    raw_games = input.pack.get("games")
    if not isinstance(raw_games, list):
        raw_games = []
    content_ids = [
        game.get("content_id")
        for game in raw_games
        if isinstance(game, dict) and isinstance(game.get("content_id"), str)
    ]
    owner, canonical_tags, existing = _official_import_context(input.owner_id, content_ids)
    preview = validate_pack(input.pack, canonical_tags, existing)
    if owner is None:
        preview["errors"].insert(0, {"path": "$.owner_id", "message": "Автор не найден."})
        preview["valid"] = False
    preview["owner"] = {"id": owner.get("id"), "name": owner.get("name") or "Без имени"} if owner else None
    return preview, owner


@router.post("/content/import/validate")
def validate_official_content_import(input: OfficialContentImportInput, user=Depends(get_current_user)):
    require_admin(user)
    preview, _ = _official_preview(input)
    preview.pop("normalized_games", None)
    return preview


@router.post("/content/import/apply")
def apply_official_content_import(input: OfficialContentImportInput, user=Depends(get_current_user)):
    require_admin(user)
    preview, owner = _official_preview(input)
    if not preview["valid"] or owner is None:
        raise HTTPException(status_code=422, detail={"message": "Импорт заблокирован ошибками валидации.", "errors": preview["errors"]})
    games_to_create = [
        game for game in preview["normalized_games"]
        if game["content_id"] not in {item.get("content_id") for item in preview["games"] if item.get("status") == "already_imported"}
    ]
    rpc_rows: list[dict[str, Any]] = []
    if games_to_create:
        response = _db_response(supabase.rpc("apply_official_content_import", {
            "p_owner_id": input.owner_id,
            "p_owner_name": owner.get("name") or "Без имени",
            "p_games": games_to_create,
        }))
        rpc_rows = _response_rows(response)
    created = sum(1 for row in rpc_rows if row.get("status") == "created")
    skipped = len(preview["games"]) - created
    return {
        "created": created,
        "skipped": skipped,
        "games": rpc_rows or [
            {"content_id": item["content_id"], "game_id": item.get("game_id"), "status": item["status"]}
            for item in preview["games"]
        ],
    }


@router.patch("/games/{game_id}/visibility")
def admin_set_visibility(game_id: str, visibility: str = "public", user=Depends(get_current_user)):
    require_admin(user)
    _db_rows(supabase.table("games").update({"visibility": visibility}).eq("id", game_id))
    return {"ok": True}


# ==================== STATS ====================

@router.get("/stats")
def get_stats(user=Depends(get_current_user)):
    require_admin(user)
    users = _db_count(supabase.table("users").select("id", count="exact"))
    games = _db_count(supabase.table("games").select("id", count="exact"))
    quiz_results = _db_count(supabase.table("quiz_results").select("id", count="exact"))
    online_results = _db_count(supabase.table("online_quiz_results").select("id", count="exact"))
    return {
        "users": users,
        "games": games,
        "quizResults": quiz_results,
        "onlineResults": online_results,
    }


# ==================== LOGS ====================

@router.get("/logs/errors")
def get_error_logs(limit: int = 50, user=Depends(get_current_user)):
    require_admin(user)
    return _db_rows(supabase.table("error_logs").select("*").order("created_at", desc=True).limit(limit))


@router.get("/logs/ai")
def get_ai_logs(limit: int = 50, user=Depends(get_current_user)):
    require_admin(user)
    return _db_rows(supabase.table("ai_logs").select("*").order("created_at", desc=True).limit(limit))


# ==================== LIMITS ====================

@router.get("/limits")
def get_limits(user=Depends(get_current_user)):
    require_admin(user)
    rows = _db_rows(supabase.table("settings").select("*"))
    return {s["key"]: s["value"] for s in rows if "key" in s and "value" in s}


@router.post("/limits")
def set_limit(key: str, value: str, user=Depends(get_current_user)):
    require_admin(user)
    _db_rows(supabase.table("settings").upsert({"key": key, "value": value}))
    return {"ok": True}

@router.post("/users/{user_id}/set-plan")
def set_plan(user_id: str, plan: str = "free", user=Depends(get_current_user)):
    require_admin(user)
    _db_rows(supabase.table("users").update({"plan": plan}).eq("id", user_id))
    return {"ok": True}


# ==================== ADMIN WORKSPACE ====================

class BulkVisibilityInput(BaseModel):
    ids: List[str] = Field(min_length=1, max_length=100)
    visibility: Literal["public", "private", "link"]


class BulkDeleteInput(BaseModel):
    ids: List[str] = Field(min_length=1, max_length=100)


class UserRoleInput(BaseModel):
    role: Literal["user", "admin"]


class LimitsInput(BaseModel):
    user: dict[str, Any]
    admin: dict[str, Any]


def _cutoff(period: str) -> datetime | None:
    days = {"7d": 7, "30d": 30, "90d": 90}.get(period)
    return datetime.now(timezone.utc) - timedelta(days=days) if days else None


def _is_after(value: Any, cutoff: datetime | None) -> bool:
    if cutoff is None:
        return True
    if not isinstance(value, str):
        return False
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")) >= cutoff
    except ValueError:
        return False


def _paginate(rows: list[dict], limit: int, offset: int, key: str) -> dict[str, Any]:
    return {key: rows[offset : offset + limit], "total": len(rows), "limit": limit, "offset": offset}


def _game_title(game: dict[str, Any]) -> str:
    data = game.get("data")
    if isinstance(data, dict):
        config = data.get("config")
        if isinstance(config, dict) and isinstance(config.get("title"), str):
            return config["title"]
    return "Без названия"


def _result_count_by_game(cutoff: datetime | None = None) -> dict[str, int]:
    counts: dict[str, int] = {}
    for table, timestamp in (
        ("quiz_results", "finished_at"),
        ("jeopardy_results", "played_at"),
        ("millionaire_results", "finished_at"),
        ("online_quiz_results", "played_at"),
    ):
        for row in _db_rows(supabase.table(table).select(f"game_id,{timestamp}")):
            if not _is_after(row.get(timestamp), cutoff):
                continue
            game_id = row.get("game_id")
            if isinstance(game_id, str):
                counts[game_id] = counts.get(game_id, 0) + 1
    return counts


def _assert_not_self(target_id: str, user: dict, action: str) -> None:
    if target_id == user.get("id"):
        raise HTTPException(status_code=400, detail=f"Нельзя {action} текущего администратора.")


@router.get("/dashboard")
def get_admin_dashboard(period: Literal["7d", "30d", "90d", "all"] = "30d", user=Depends(get_current_user)):
    require_admin(user)
    cutoff = _cutoff(period)
    users = _db_rows(supabase.table("users").select("id,created_at"))
    games = _db_rows(supabase.table("games").select("id,kind,visibility,created_at,play_count,data"))
    usage = _db_rows(supabase.table("ai_usage").select("id,created_at,request_type"))
    errors = _db_rows(supabase.table("error_logs").select("id,created_at"))
    result_counts = _result_count_by_game(cutoff)
    result_total = sum(result_counts.values())
    filtered_games = [row for row in games if _is_after(row.get("created_at"), cutoff)]
    filtered_usage = [row for row in usage if _is_after(row.get("created_at"), cutoff)]
    filtered_errors = [row for row in errors if _is_after(row.get("created_at"), cutoff)]
    activity: dict[str, dict[str, int]] = {}
    for name, rows in (("users", users), ("games", filtered_games), ("ai", filtered_usage)):
        for row in rows:
            value = row.get("created_at")
            if not isinstance(value, str) or not _is_after(value, cutoff):
                continue
            day = value[:10]
            activity.setdefault(day, {"users": 0, "games": 0, "plays": 0, "ai": 0})[name] += 1
    distribution = {"types": {}, "visibility": {}}
    for game in games:
        distribution["types"][game.get("kind") or "unknown"] = distribution["types"].get(game.get("kind") or "unknown", 0) + 1
        visibility = game.get("visibility") or "private"
        distribution["visibility"][visibility] = distribution["visibility"].get(visibility, 0) + 1
    top_games = sorted(
        [{"id": game.get("id"), "title": _game_title(game), "plays": result_counts.get(game.get("id"), game.get("play_count") or 0)} for game in games],
        key=lambda row: row["plays"],
        reverse=True,
    )[:5]
    return {
        "period": period,
        "kpis": {
            "users": len(users),
            "new_users": sum(1 for row in users if _is_after(row.get("created_at"), cutoff)),
            "active_users": None,
            "games": len(games),
            "plays": result_total,
            "online_sessions": _db_count(supabase.table("online_quiz_results").select("id", count="exact")),
            "ai_requests": len(filtered_usage),
            "errors": len(filtered_errors),
        },
        "activity": [{"date": day, **values} for day, values in sorted(activity.items())],
        "distribution": distribution,
        "top_games": top_games,
    }


@router.get("/analytics/ai")
def get_ai_analytics(period: Literal["7d", "30d", "90d", "all"] = "30d", user=Depends(get_current_user)):
    require_admin(user)
    cutoff = _cutoff(period)
    usage = [row for row in _db_rows(supabase.table("ai_usage").select("id,request_type,created_at")) if _is_after(row.get("created_at"), cutoff)]
    logs = [row for row in _db_rows(supabase.table("ai_logs").select("id,model,prompt_tokens,completion_tokens,success,error,created_at")) if _is_after(row.get("created_at"), cutoff)]
    by_type: dict[str, int] = {}
    daily: dict[str, int] = {}
    for row in usage:
        request_type = row.get("request_type") or "other"
        by_type[request_type] = by_type.get(request_type, 0) + 1
        date = str(row.get("created_at") or "")[:10]
        if date:
            daily[date] = daily.get(date, 0) + 1
    models: dict[str, int] = {}
    for row in logs:
        model = row.get("model") or "unknown"
        models[model] = models.get(model, 0) + 1
    completed = sum(max(0, int(row.get("completion_tokens") or 0)) for row in logs)
    prompted = sum(max(0, int(row.get("prompt_tokens") or 0)) for row in logs)
    successes = sum(1 for row in logs if row.get("success") is True)
    return {
        "period": period,
        "requests": len(usage),
        "successful": successes,
        "errors": sum(1 for row in logs if row.get("success") is False),
        "success_rate": round(successes / len(logs) * 100, 1) if logs else None,
        "prompt_tokens": prompted,
        "completion_tokens": completed,
        "total_tokens": prompted + completed,
        "daily": [{"date": day, "requests": count} for day, count in sorted(daily.items())],
        "by_type": by_type,
        "by_model": models,
        "recent_errors": [row for row in logs if row.get("success") is False][:20],
    }


@router.get("/workspace/games")
def list_workspace_games(
    search: str = "", kind: Optional[str] = None, visibility: Optional[str] = None, author: str = "",
    limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0), user=Depends(get_current_user),
):
    require_admin(user)
    games = _db_rows(supabase.table("games").select("*").order("created_at", desc=True))
    ratings = _db_rows(supabase.table("ratings").select("game_id,value"))
    rating_values: dict[str, list[int]] = {}
    for rating in ratings:
        if isinstance(rating.get("game_id"), str) and isinstance(rating.get("value"), int):
            rating_values.setdefault(rating["game_id"], []).append(rating["value"])
    needle = search.strip().lower()
    author_needle = author.strip().lower()
    rows = []
    for game in games:
        title = _game_title(game)
        if needle and needle not in title.lower():
            continue
        if kind and game.get("kind") != kind:
            continue
        if visibility and game.get("visibility") != visibility:
            continue
        if author_needle and author_needle not in str(game.get("owner_name") or "").lower():
            continue
        values = rating_values.get(game.get("id"), [])
        rows.append({**game, "title": title, "rating": round(sum(values) / len(values), 1) if values else None})
    return _paginate(rows, limit, offset, "games")


@router.patch("/workspace/games/bulk/visibility")
def bulk_set_visibility(input: BulkVisibilityInput, user=Depends(get_current_user)):
    require_admin(user)
    _db_rows(supabase.table("games").update({"visibility": input.visibility}).in_("id", input.ids))
    return {"ok": True, "count": len(input.ids)}


@router.delete("/workspace/games/bulk")
def bulk_delete_games(input: BulkDeleteInput, user=Depends(get_current_user)):
    require_admin(user)
    _db_rows(supabase.table("games").delete().in_("id", input.ids))
    return {"ok": True, "count": len(input.ids)}


@router.get("/workspace/users")
def list_workspace_users(
    search: str = "", role: Optional[str] = None, status: Optional[Literal["active", "banned"]] = None,
    limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0), user=Depends(get_current_user),
):
    require_admin(user)
    users = _db_rows(supabase.table("users").select("id,email,name,role,banned,created_at" ).order("created_at", desc=True))
    games = _db_rows(supabase.table("games").select("owner_id"))
    game_counts: dict[str, int] = {}
    for game in games:
        owner_id = game.get("owner_id")
        if isinstance(owner_id, str):
            game_counts[owner_id] = game_counts.get(owner_id, 0) + 1
    needle = search.strip().lower()
    rows = []
    for item in users:
        haystack = f"{item.get('name') or ''} {item.get('email') or ''}".lower()
        if needle and needle not in haystack:
            continue
        if role and item.get("role", "user") != role:
            continue
        if status == "active" and item.get("banned"):
            continue
        if status == "banned" and not item.get("banned"):
            continue
        rows.append({**item, "games_count": game_counts.get(item.get("id"), 0), "plays_count": None, "last_active": None})
    return _paginate(rows, limit, offset, "users")


@router.post("/workspace/users/{user_id}/ban")
def ban_user(user_id: str, user=Depends(get_current_user)):
    require_admin(user)
    _assert_not_self(user_id, user, "заблокировать")
    _db_rows(supabase.table("users").update({"banned": True}).eq("id", user_id))
    return {"ok": True}


@router.post("/workspace/users/{user_id}/unban")
def unban_user(user_id: str, user=Depends(get_current_user)):
    require_admin(user)
    _db_rows(supabase.table("users").update({"banned": False}).eq("id", user_id))
    return {"ok": True}


@router.patch("/workspace/users/{user_id}/role")
def set_user_role(user_id: str, input: UserRoleInput, user=Depends(get_current_user)):
    require_admin(user)
    if input.role != "admin":
        _assert_not_self(user_id, user, "снять права у")
    _db_rows(supabase.table("users").update({"role": input.role}).eq("id", user_id))
    return {"ok": True}


@router.get("/errors")
def list_errors(
    period: Literal["7d", "30d", "90d", "all"] = "30d", source: str = "", search: str = "",
    limit: int = Query(50, ge=1, le=100), user=Depends(get_current_user),
):
    require_admin(user)
    cutoff = _cutoff(period)
    rows = [parse_error_log(row) for row in _db_rows(supabase.table("error_logs").select("*").order("created_at", desc=True).limit(limit))]
    needle = search.strip().lower()
    return [row for row in rows if _is_after(row.get("created_at"), cutoff) and (not source or row.get("source") == source) and (not needle or needle in f"{row.get('message')} {row.get('path')}".lower())]


@router.get("/settings/limits")
def get_workspace_limits(user=Depends(get_current_user)):
    require_admin(user)
    return get_role_limits()


@router.put("/settings/limits")
def update_workspace_limits(input: LimitsInput, user=Depends(get_current_user)):
    require_admin(user)
    try:
        limits = normalize_limits(input.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Некорректное значение ограничения") from exc
    try:
        save_role_limits(limits)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL) from exc
    return limits
