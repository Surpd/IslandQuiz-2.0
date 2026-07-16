from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import json
import os
import httpx
import asyncio
from datetime import datetime, timedelta

from database import supabase
from routes.auth import get_current_user

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ==================== HELPERS ====================

def require_admin(user):
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied")


# ==================== SCHEMAS ====================

class AITestRequest(BaseModel):
    topic: str
    type: str = "choice"
    format: str = "quiz-choice"
    wishes: Optional[str] = None
    model: Optional[str] = "llama-3.1-8b-instant"
    temperature: float = 0.8


class AICompareRequest(BaseModel):
    topic: str
    type: str = "choice"
    wishes: Optional[str] = None
    models: List[str] = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"]


# ==================== AI LAB ====================

@router.post("/ai/test")
def ai_test(req: AITestRequest, user=Depends(get_current_user)):
    require_admin(user)

    from services.ai_prompts import generate_question_prompt

    prompt = generate_question_prompt(
        topic=req.topic,
        question_type=req.type,
        difficulty="mixed",
        wishes=req.wishes,
        count=3,
    )

    async def _call():
        url = "https://api.groq.com/openai/v1/chat/completions"
        key = os.getenv("OPENAI_API_KEY", "")
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={
                    "model": req.model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": req.temperature,
                },
            )
            data = response.json()
            return data["choices"][0]["message"]["content"]

    raw = asyncio.run(_call())

    parsed = None
    error = None
    try:
        cleaned = raw
        if "```" in cleaned:
            cleaned = cleaned.split("```json")[1].split("```")[0] if "```json" in cleaned else cleaned.split("```")[1].split("```")[0]
        result = json.loads(cleaned.strip())
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


@router.post("/ai/compare")
def ai_compare(req: AICompareRequest, user=Depends(get_current_user)):
    require_admin(user)

    from services.ai_prompts import generate_question_prompt

    results = {}
    for model in req.models:
        prompt = generate_question_prompt(
            topic=req.topic,
            question_type=req.type,
            difficulty="mixed",
            wishes=req.wishes,
            count=2,
        )

        async def _call(m=model, p=prompt):
            url = "https://api.groq.com/openai/v1/chat/completions"
            key = os.getenv("OPENAI_API_KEY", "")
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    url,
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    json={
                        "model": m,
                        "messages": [{"role": "user", "content": p}],
                        "temperature": 0.8,
                    },
                )
                data = response.json()
                return data["choices"][0]["message"]["content"]

        raw = asyncio.run(_call())
        results[model] = raw[:1000]

    return {"results": results}


@router.post("/ai/save-default-model")
def save_default_model(model: str, user=Depends(get_current_user)):
    require_admin(user)
    # Сохраняем в файл или env (упрощённо — в БД)
    supabase.table("settings").upsert({"key": "default_ai_model", "value": model}).execute()
    return {"ok": True}


# ==================== USERS ====================

@router.get("/users")
def list_users(user=Depends(get_current_user)):
    require_admin(user)
    res = supabase.table("users").select("*").order("created_at", desc=True).execute()
    return res.data or []


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
def list_all_games(user=Depends(get_current_user)):
    require_admin(user)
    res = supabase.table("games").select("*").order("updated_at", desc=True).limit(100).execute()
    return res.data or []


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