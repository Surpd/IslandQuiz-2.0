from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
import json
import os
import httpx
import asyncio

from database import supabase
from routes.auth import get_current_user

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


def _call_ai(model: str, prompt: str, temperature: float = 0.8) -> str:
    async def _call():
        url = "https://api.groq.com/openai/v1/chat/completions"
        key = os.getenv("OPENAI_API_KEY", "")
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    url,
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    json={"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": temperature},
                )
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"]
            except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
                raise HTTPException(status_code=502, detail=AI_ERROR_DETAIL) from exc
    return asyncio.run(_call())


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


# ==================== AI LAB ====================

@router.post("/ai/test")
def ai_test(req: AITestRequest, user=Depends(get_current_user)):
    require_admin(user)
    from services.ai_prompts import generate_question_prompt

    prompt = generate_question_prompt(
        topic=req.topic, question_type=req.type,
        difficulty="mixed", wishes=req.wishes, count=3,
    )
    raw = _call_ai(req.model, prompt, req.temperature)

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

    return {"prompt": prompt[:500], "raw": raw, "parsed": parsed, "error": error}


@router.post("/ai/test-quiz")
def ai_test_quiz(req: AITestQuizRequest, user=Depends(get_current_user)):
    require_admin(user)
    from services.ai_prompts import generate_quiz_prompt
    prompt = generate_quiz_prompt(topic=req.topic, count=req.count, wishes=req.wishes)
    raw = _call_ai(req.model, prompt)
    parsed = None
    error = None
    try:
        parsed = json.loads(clean_json(raw))
    except Exception as e:
        error = str(e)
    return {"prompt": prompt[:500], "raw": raw, "parsed": parsed, "error": error}


@router.post("/ai/test-jeopardy-categories")
def ai_test_jeopardy_categories(req: AITestJeopardyCategoriesRequest, user=Depends(get_current_user)):
    require_admin(user)
    from services.ai_prompts import generate_jeopardy_categories_prompt
    prompt = generate_jeopardy_categories_prompt(topic=req.topic, wishes=req.wishes)
    raw = _call_ai(req.model, prompt)
    parsed = None
    error = None
    try:
        parsed = json.loads(clean_json(raw))
    except Exception as e:
        error = str(e)
    return {"prompt": prompt[:500], "raw": raw, "parsed": parsed, "error": error}


@router.post("/ai/test-jeopardy-questions")
def ai_test_jeopardy_questions(req: AITestJeopardyQuestionsRequest, user=Depends(get_current_user)):
    require_admin(user)
    from services.ai_prompts import generate_jeopardy_questions_prompt
    prompt = generate_jeopardy_questions_prompt(category=req.category, empty_slots=req.empty_slots, wishes=req.wishes)
    raw = _call_ai(req.model, prompt)
    parsed = None
    error = None
    try:
        parsed = json.loads(clean_json(raw))
    except Exception as e:
        error = str(e)
    return {"prompt": prompt[:500], "raw": raw, "parsed": parsed, "error": error}


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
