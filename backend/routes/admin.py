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


# ==================== HELPERS ====================

def require_admin(user):
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")


def _call_ai(model: str, prompt: str, temperature: float = 0.8) -> str:
    async def _call():
        url = "https://api.groq.com/openai/v1/chat/completions"
        key = os.getenv("OPENAI_API_KEY", "")
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": temperature},
            )
            data = response.json()
            return data["choices"][0]["message"]["content"]
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
    model: Optional[str] = "llama-3.1-8b-instant"
    temperature: float = 0.8


class AITestQuizRequest(BaseModel):
    topic: str
    count: int = 10
    wishes: Optional[str] = None
    model: Optional[str] = "llama-3.1-8b-instant"


class AITestJeopardyCategoriesRequest(BaseModel):
    topic: str
    wishes: Optional[str] = None
    model: Optional[str] = "llama-3.1-8b-instant"


class AITestJeopardyQuestionsRequest(BaseModel):
    category: str
    empty_slots: List[int] = [100, 200, 300, 400, 500]
    wishes: Optional[str] = None
    model: Optional[str] = "llama-3.1-8b-instant"


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
    res = supabase.table("users").select("*", count="exact").order("created_at", desc=True) \
        .range(offset, offset + limit - 1).execute()
    total = res.count if hasattr(res, 'count') else len(res.data or [])
    return {"users": res.data or [], "total": total, "limit": limit, "offset": offset}


@router.post("/users/{user_id}/ban")
def toggle_ban(user_id: str, user=Depends(get_current_user)):
    require_admin(user)
    target = supabase.table("users").select("banned").eq("id", user_id).execute()
    if target.data:
        new_status = not target.data[0].get("banned", False)
        supabase.table("users").update({"banned": new_status}).eq("id", user_id).execute()
    return {"ok": True}


@router.post("/users/{user_id}/make-admin")
def make_admin(user_id: str, user=Depends(get_current_user)):
    require_admin(user)
    supabase.table("users").update({"role": "admin"}).eq("id", user_id).execute()
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(user_id: str, user=Depends(get_current_user)):
    require_admin(user)
    supabase.table("users").delete().eq("id", user_id).execute()
    return {"ok": True}


# ==================== GAMES ====================

@router.get("/games")
def list_all_games(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(get_current_user),
):
    require_admin(user)
    res = supabase.table("games").select("*", count="exact").order("updated_at", desc=True) \
        .range(offset, offset + limit - 1).execute()
    total = res.count if hasattr(res, 'count') else len(res.data or [])
    return {"games": res.data or [], "total": total, "limit": limit, "offset": offset}


@router.delete("/games/{game_id}")
def admin_delete_game(game_id: str, user=Depends(get_current_user)):
    require_admin(user)
    supabase.table("games").delete().eq("id", game_id).execute()
    return {"ok": True}


@router.patch("/games/{game_id}/visibility")
def admin_set_visibility(game_id: str, visibility: str = "public", user=Depends(get_current_user)):
    require_admin(user)
    supabase.table("games").update({"visibility": visibility}).eq("id", game_id).execute()
    return {"ok": True}


# ==================== STATS ====================

@router.get("/stats")
def get_stats(user=Depends(get_current_user)):
    require_admin(user)
    users = supabase.table("users").select("id", count="exact").execute()
    games = supabase.table("games").select("id", count="exact").execute()
    quiz_results = supabase.table("quiz_results").select("id", count="exact").execute()
    online_results = supabase.table("online_quiz_results").select("id", count="exact").execute()
    return {
        "users": users.count if hasattr(users, 'count') else len(users.data or []),
        "games": games.count if hasattr(games, 'count') else len(games.data or []),
        "quizResults": quiz_results.count if hasattr(quiz_results, 'count') else len(quiz_results.data or []),
        "onlineResults": online_results.count if hasattr(online_results, 'count') else len(online_results.data or []),
    }


# ==================== LOGS ====================

@router.get("/logs/errors")
def get_error_logs(limit: int = 50, user=Depends(get_current_user)):
    require_admin(user)
    res = supabase.table("error_logs").select("*").order("created_at", desc=True).limit(limit).execute()
    return res.data or []


@router.get("/logs/ai")
def get_ai_logs(limit: int = 50, user=Depends(get_current_user)):
    require_admin(user)
    res = supabase.table("ai_logs").select("*").order("created_at", desc=True).limit(limit).execute()
    return res.data or []


# ==================== LIMITS ====================

@router.get("/limits")
def get_limits(user=Depends(get_current_user)):
    require_admin(user)
    res = supabase.table("settings").select("*").execute()
    return {s["key"]: s["value"] for s in (res.data or [])}


@router.post("/limits")
def set_limit(key: str, value: str, user=Depends(get_current_user)):
    require_admin(user)
    supabase.table("settings").upsert({"key": key, "value": value}).execute()
    return {"ok": True}

@router.post("/users/{user_id}/set-plan")
def set_plan(user_id: str, plan: str = "free", user=Depends(get_current_user)):
    require_admin(user)
    supabase.table("users").update({"plan": plan}).eq("id", user_id).execute()
    return {"ok": True}