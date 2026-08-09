import os
import uuid
import json
import hashlib
import hmac
import secrets
from typing import Optional
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database import supabase
from routes.auth import get_current_user, get_current_user_optional, create_access_token, UserOut, AuthResponse

router = APIRouter(prefix="/api/auth", tags=["telegram-auth"])

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_AUTH_SECRET = os.getenv("TELEGRAM_AUTH_SECRET", "")


# ---------- Helpers ----------

def create_telegram_login_token(user_id: str | None = None) -> str:
    expires = int((datetime.now(timezone.utc) + timedelta(minutes=5)).timestamp())
    payload = f"{user_id or ''}:{expires}:{secrets.token_urlsafe(16)}"
    signature = hmac.new(TELEGRAM_AUTH_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{signature}"


def verify_telegram_login_token(token: str) -> dict:
    parts = token.split(":")
    if len(parts) != 4:
        raise HTTPException(status_code=400, detail="Неверный токен")
    user_id, expires, nonce, signature = parts
    payload = f"{user_id}:{expires}:{nonce}"
    expected = hmac.new(TELEGRAM_AUTH_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=403, detail="Недействительный токен")
    if int(expires) < int(datetime.now(timezone.utc).timestamp()):
        raise HTTPException(status_code=403, detail="Ссылка устарела")
    return {"user_id": user_id or None}


# ---------- Schemas ----------

class TelegramBotLoginInput(BaseModel):
    token: str
    telegram_id: int
    telegram_username: Optional[str] = None
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""


# ---------- Website: Start Login ----------

@router.post("/telegram/start")
def start_telegram_login(user=Depends(get_current_user_optional)):
    """Начать вход через Telegram. Возвращает ссылку на бота."""
    token = create_telegram_login_token(user["id"] if user else None)
    return {"ok": True, "url": f"https://t.me/IslandQuizbot?start=login_{token}"}


# ---------- Website: Complete Login ----------

@router.get("/telegram/complete")
def telegram_complete(token: str):
    """Завершить вход через Telegram. Устанавливает cookie и редиректит."""
    token_data = verify_telegram_login_token(token)
    
    if not token_data["user_id"]:
        raise HTTPException(status_code=400, detail="Нет пользователя")
    
    user_res = supabase.table("users").select("*").eq("id", token_data["user_id"]).execute()
    if not user_res.data:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    user = user_res.data[0]
    access_token = create_access_token(user["id"])
    
    from fastapi.responses import RedirectResponse
    response = RedirectResponse("https://islandquiz.online/library")
    response.set_cookie(
        key="islandquiz_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,
    )
    return response


# ---------- Bot: Process Login ----------

@router.post("/telegram/bot-login")
def telegram_bot_login(input: TelegramBotLoginInput):
    """Обрабатывает вход из Telegram бота."""
    token_data = verify_telegram_login_token(input.token)
    telegram_id = input.telegram_id
    
    # Ищем существующий аккаунт
    res = supabase.table("users").select("*").eq("telegram_id", telegram_id).execute()
    
    if res.data:
        user = res.data[0]
    elif token_data["user_id"]:
        # Привязываем Telegram к существующему аккаунту
        existing = supabase.table("users").select("*").eq("id", token_data["user_id"]).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        user = existing.data[0]
        supabase.table("users").update({
            "telegram_id": telegram_id,
            "telegram_username": input.telegram_username,
        }).eq("id", user["id"]).execute()
    else:
        # Создаём нового пользователя
        user_id = str(uuid.uuid4())
        name = f"{input.first_name} {input.last_name}".strip() or input.telegram_username or f"User_{telegram_id}"
        user = {
            "id": user_id,
            "telegram_id": telegram_id,
            "telegram_username": input.telegram_username,
            "name": name,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        supabase.table("users").insert(user).execute()
    
    access_token = create_access_token(user["id"])
    login_token = create_telegram_login_token(user["id"])
    
    return {
        "ok": True,
        "token": access_token,
        "login_url": f"https://islandquiz.online/auth/telegram/complete?token={login_token}",
    }