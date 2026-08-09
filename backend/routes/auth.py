from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Form, Request
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt.exceptions import InvalidTokenError as JWTError
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, field_validator

from database import supabase
from limiter import limiter
import os
import json
import hashlib
import hmac

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")


router = APIRouter(prefix="/api/auth", tags=["auth"])

# ---------- Security ----------
SECRET_KEY = os.getenv("JWT_SECRET")
if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET environment variable is required")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ---------- Validation ----------
class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    name: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Пароль должен быть не менее 6 символов")
        return v

    @field_validator("name")
    @classmethod
    def name_valid(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 100:
            raise ValueError("Имя должно быть от 1 до 100 символов")
        return v


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    avatar: Optional[str] = None
    bio: Optional[str] = None
    subject: Optional[str] = None
    role: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    ok: bool
    user: Optional[UserOut] = None
    token: Optional[str] = None
    error: Optional[str] = None


# ---------- Helpers ----------
def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"sub": user_id, "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Неверный токен",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    res = supabase.table("users").select("*").eq("id", user_id).execute()
    if not res.data:
        raise credentials_exception
    return res.data[0]


def get_current_user_optional(token: str = Depends(oauth2_scheme)):
    if token is None:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None

    res = supabase.table("users").select("*").eq("id", user_id).execute()
    if not res.data:
        return None
    return res.data[0]

# ---------- Telegram Auth ----------

def verify_telegram_auth(auth_data: dict) -> dict:
    """Проверяет подпись Telegram Login Widget и возвращает данные пользователя."""
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=500, detail="Telegram не настроен")
    
    # Копируем данные и убираем hash
    data = dict(auth_data)
    received_hash = data.pop("hash", "")
    
    # Формируем data-check-string
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(data.items())
    )
    
    # Вычисляем секретный ключ
    secret_key = hashlib.sha256(TELEGRAM_BOT_TOKEN.encode()).digest()
    computed_hash = hmac.new(
        secret_key, 
        data_check_string.encode(), 
        hashlib.sha256
    ).hexdigest()
    
    if computed_hash != received_hash:
        raise HTTPException(status_code=403, detail="Недействительная подпись Telegram")
    
    # Проверяем срок действия (не старше 24 часов)
    auth_date = int(data.get("auth_date", 0))
    now = int(datetime.now(timezone.utc).timestamp())
    if auth_date > now or now - auth_date > 86400:
    raise HTTPException(status_code=403, detail="Данные авторизации устарели или некорректны")
    
    return {
        "telegram_id": int(data["id"]),
        "first_name": data.get("first_name", ""),
        "last_name": data.get("last_name", ""),
        "username": data.get("username", ""),
        "photo_url": data.get("photo_url", ""),
    }


class TelegramAuthInput(BaseModel):
    id: int
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""
    username: Optional[str] = ""
    photo_url: Optional[str] = ""
    auth_date: int
    hash: str


@router.post("/telegram", response_model=AuthResponse)
def telegram_auth(input: TelegramAuthInput):
    """Вход или автоматическая регистрация через Telegram."""

    auth_data = input.model_dump()
    tg_data = verify_telegram_auth(auth_data)
    telegram_id = tg_data["telegram_id"]

    # Ищем существующий аккаунт по Telegram
    res = supabase.table("users").select("*").eq("telegram_id", telegram_id).execute()

    if res.data:
        # Telegram уже привязан — входим в существующий аккаунт
        user = res.data[0]
        updates = {"telegram_username": tg_data["username"]}
        if not user.get("avatar") and tg_data["photo_url"]:
            updates["avatar"] = tg_data["photo_url"]

        supabase.table("users").update(updates).eq("id", user["id"]).execute()
        user.update(updates)
    else:
        # Создаём нового пользователя IslandQuiz
        user_id = str(uuid.uuid4())
        name = f"{tg_data['first_name']} {tg_data['last_name']}".strip() or tg_data["username"] or f"User_{telegram_id}"

        user = {
            "id": user_id,
            "telegram_id": telegram_id,
            "telegram_username": tg_data["username"],
            "name": name,
            "avatar": tg_data["photo_url"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        supabase.table("users").insert(user).execute()

    token = create_access_token(user["id"])
    return {"ok": True, "user": UserOut(**user), "token": token}

@router.post("/link-telegram", response_model=dict)
def link_telegram(input: TelegramAuthInput, user=Depends(get_current_user)):
    """Привязать Telegram к текущему аккаунту."""
    auth_data = input.model_dump()
    tg_data = verify_telegram_auth(auth_data)
    telegram_id = tg_data["telegram_id"]

    existing = supabase.table("users").select("id").eq("telegram_id", telegram_id).execute()
    if existing.data and existing.data[0]["id"] != user["id"]:
        return {"ok": False, "error": "Этот Telegram уже привязан к другому аккаунту"}

    supabase.table("users").update({
        "telegram_id": telegram_id,
        "telegram_username": tg_data["username"],
        "avatar": user.get("avatar") or tg_data["photo_url"],
    }).eq("id", user["id"]).execute()

    return {"ok": True, "telegram_username": tg_data["username"]}


@router.post("/unlink-telegram", response_model=dict)
def unlink_telegram(user=Depends(get_current_user)):
    """Отвязать Telegram от аккаунта."""
    supabase.table("users").update({
        "telegram_id": None,
        "telegram_username": None,
    }).eq("id", user["id"]).execute()
    
    return {"ok": True}

# ---------- Routes ----------
@router.post("/register", response_model=AuthResponse)
@limiter.limit("3/minute")
def register(request: Request, input: RegisterInput):
    res = supabase.table("users").select("id").eq("email", input.email).execute()
    if res.data:
        return {"ok": False, "error": "Пользователь с таким email уже существует"}

    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": input.email.strip().lower(),
        "password_hash": hash_password(input.password),
        "name": input.name.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table("users").insert(user).execute()

    token = create_access_token(user_id)
    return {"ok": True, "user": UserOut(**user), "token": token}


@router.post("/login", response_model=AuthResponse)
@limiter.limit("5/minute")
def login(request: Request, input: LoginInput):
    res = supabase.table("users").select("*").eq("email", input.email.strip().lower()).execute()
    if not res.data or not verify_password(input.password, res.data[0]["password_hash"]):
        return {"ok": False, "error": "Неверный email или пароль"}

    user = res.data[0]
    token = create_access_token(user["id"])
    return {"ok": True, "user": UserOut(**user), "token": token}


@router.post("/logout")
def logout():
    return {"ok": True}


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
        updates["name"] = name.strip()[:100]
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


@router.post("/forgot-password")
@limiter.limit("3/minute")
def forgot_password(request: Request, email: str = Form(...)):
    user = supabase.table("users").select("*").eq("email", email.strip().lower()).execute()
    if not user.data:
        return {"ok": True}

    token = str(uuid.uuid4())
    expires = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

    supabase.table("password_resets").insert({
        "email": email.strip().lower(),
        "token": token,
        "expires_at": expires
    }).execute()

    from services.email import send_reset_email
    send_reset_email(email, token)

    return {"ok": True}


@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(request: Request, token: str = Form(...), password: str = Form(...)):
    if len(password) < 6:
        return {"error": "Пароль должен быть не менее 6 символов"}

    reset = supabase.table("password_resets").select("*").eq("token", token).execute()
    if not reset.data:
        return {"error": "Недействительная ссылка"}

    record = reset.data[0]
    if datetime.fromisoformat(record["expires_at"]) < datetime.now(timezone.utc):
        supabase.table("password_resets").delete().eq("token", token).execute()
        return {"error": "Срок действия ссылки истёк"}

    hashed = pwd_context.hash(password)
    supabase.table("users").update({"password_hash": hashed}).eq("email", record["email"]).execute()
    supabase.table("password_resets").delete().eq("token", token).execute()

    return {"ok": True}