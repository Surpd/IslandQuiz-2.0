import os
import uuid
import hashlib
import secrets

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Form, Request
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt.exceptions import InvalidTokenError as JWTError
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, field_validator

from database import supabase
from limiter import limiter


router = APIRouter(prefix="/api/auth", tags=["auth"])
DB_ERROR_DETAIL = "Ошибка базы данных"
PASSWORD_RESET_TOKEN_TABLE = "password_resets"


def _db_response(query):
    try:
        response = query.execute()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL) from exc
    if response is None:
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL)
    return response


def _db_rows(query) -> list[dict]:
    rows = getattr(_db_response(query), "data", None)
    if not isinstance(rows, list):
        return []
    return [row for row in rows if isinstance(row, dict)]


# ============================================================
# Security
# ============================================================

SECRET_KEY = os.getenv("JWT_SECRET")

if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET environment variable is required")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
)

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/auth/login",
    auto_error=False,
)


# ============================================================
# Schemas
# ============================================================

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


class LinkEmailInput(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str

    # Telegram-пользователь может не иметь email
    email: Optional[str] = None
    telegram_id: Optional[str] = None

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


# ============================================================
# Helpers
# ============================================================

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def hash_password_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_password(
    plain_password: str,
    hashed_password: str,
) -> bool:
    return pwd_context.verify(
        plain_password,
        hashed_password,
    )


def create_access_token(user_id: str) -> str:
    expire = (
        datetime.now(timezone.utc)
        + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    to_encode = {
        "sub": str(user_id),
        "exp": expire,
    }

    return jwt.encode(
        to_encode,
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def decode_access_token(token: str) -> str:
    if not isinstance(token, str) or not token:
        raise JWTError("Invalid access token")

    payload = jwt.decode(
        token,
        SECRET_KEY,
        algorithms=[ALGORITHM],
        options={"require": ["sub", "exp"]},
    )
    user_id = payload.get("sub")
    if not isinstance(user_id, str) or not user_id:
        raise JWTError("Invalid subject")
    return user_id


# ============================================================
# Current user
# ============================================================

def get_current_user(
    token: str = Depends(oauth2_scheme),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Неверный токен",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        raise credentials_exception

    try:
        user_id = decode_access_token(token)

    except JWTError:
        raise credentials_exception

    rows = _db_rows(
        supabase
        .table("users")
        .select("*")
        .eq("id", str(user_id))
    )

    if not rows:
        raise credentials_exception

    user = rows[0]

    if user.get("banned"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Пользователь заблокирован",
        )

    return user


@router.post("/link-email", response_model=AuthResponse)
def link_email(
    input: LinkEmailInput,
    current_user=Depends(get_current_user),
):
    existing_rows = _db_rows(supabase.table("users").select("id").eq("email", str(input.email).lower()))
    if existing_rows and existing_rows[0]["id"] != current_user["id"]:
        raise HTTPException(status_code=409, detail="Этот email уже используется")

    rows = _db_rows(
        supabase.table("users")
        .update({"email": str(input.email).lower(), "password_hash": hash_password(input.password)})
        .eq("id", current_user["id"])
    )
    return {"ok": True, "user": UserOut(**rows[0]) if rows else None}


def get_current_user_optional(
    token: str = Depends(oauth2_scheme),
):
    if not token:
        return None

    try:
        user_id = decode_access_token(token)

    except JWTError:
        return None

    rows = _db_rows(
        supabase
        .table("users")
        .select("*")
        .eq("id", str(user_id))
    )

    if not rows:
        return None

    user = rows[0]

    if user.get("banned"):
        return None

    return user


# ============================================================
# Register
# ============================================================

@router.post(
    "/register",
    response_model=AuthResponse,
)
@limiter.limit("3/minute")
def register(
    request: Request,
    input: RegisterInput,
):
    email = input.email.strip().lower()

    existing_rows = _db_rows(
        supabase
        .table("users")
        .select("id")
        .eq("email", email)
    )

    if existing_rows:
        return {
            "ok": False,
            "error": "Пользователь с таким email уже существует",
        }

    user_id = str(uuid.uuid4())

    user = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(input.password),
        "name": input.name.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    inserted_rows = _db_rows(
        supabase
        .table("users")
        .insert(user)
    )

    if not inserted_rows:
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL)

    saved_user = inserted_rows[0]

    token = create_access_token(user_id)

    return {
        "ok": True,
        "user": UserOut(**saved_user),
        "token": token,
    }


# ============================================================
# Login
# ============================================================

@router.post(
    "/login",
    response_model=AuthResponse,
)
@limiter.limit("5/minute")
def login(
    request: Request,
    input: LoginInput,
):
    email = input.email.strip().lower()

    rows = _db_rows(
        supabase
        .table("users")
        .select("*")
        .eq("email", email)
    )

    if not rows:
        return {
            "ok": False,
            "error": "Неверный email или пароль",
        }

    user = rows[0]

    password_hash = user.get("password_hash")

    # Telegram-only пользователь может не иметь пароля.
    if not password_hash:
        return {
            "ok": False,
            "error": "Для этого аккаунта вход доступен через Telegram",
        }

    if not verify_password(
        input.password,
        password_hash,
    ):
        return {
            "ok": False,
            "error": "Неверный email или пароль",
        }

    if user.get("banned"):
        return {
            "ok": False,
            "error": "Пользователь заблокирован",
        }

    token = create_access_token(user["id"])

    return {
        "ok": True,
        "user": UserOut(**user),
        "token": token,
    }


# ============================================================
# Logout
# ============================================================

@router.post("/logout")
def logout():
    # JWT stateless — удаляется на клиенте.
    return {"ok": True}


# ============================================================
# Me
# ============================================================

@router.get(
    "/me",
    response_model=Optional[UserOut],
)
def get_me(
    current_user=Depends(get_current_user),
):
    return UserOut(**current_user)


# ============================================================
# Update profile
# ============================================================

@router.patch(
    "/me",
    response_model=Optional[UserOut],
)
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
        _db_rows(supabase.table("users").update(updates).eq("id", current_user["id"]))

    rows = _db_rows(
        supabase
        .table("users")
        .select("*")
        .eq("id", current_user["id"])
    )

    if not rows:
        return None

    return UserOut(**rows[0])


# ============================================================
# Forgot password
# ============================================================

@router.post("/forgot-password")
@limiter.limit("3/minute")
def forgot_password(
    request: Request,
    email: str = Form(...),
):
    email = email.strip().lower()

    user_rows = _db_rows(
        supabase
        .table("users")
        .select("*")
        .eq("email", email)
    )

    if not user_rows:
        return {"ok": True}

    # Telegram-only аккаунтам без email пароль не сбрасываем.
    if not user_rows[0].get("password_hash"):
        return {"ok": True}

    token = secrets.token_urlsafe(32)
    token_hash = hash_password_reset_token(token)

    expires = (
        datetime.now(timezone.utc)
        + timedelta(hours=1)
    ).isoformat()

    _db_rows(supabase.table(PASSWORD_RESET_TOKEN_TABLE).insert({
            "email": email,
            "token_hash": token_hash,
            "expires_at": expires,
        }))

    from services.email import send_reset_email

    send_reset_email(
        email,
        token,
    )

    return {"ok": True}


# ============================================================
# Reset password
# ============================================================

@router.post("/reset-password")
@limiter.limit("5/minute")
def reset_password(
    request: Request,
    token: str = Form(...),
    password: str = Form(...),
):
    if len(password) < 6:
        return {
            "error": "Пароль должен быть не менее 6 символов"
        }

    token_hash = hash_password_reset_token(token)
    reset_rows = _db_rows(
        supabase
        .table(PASSWORD_RESET_TOKEN_TABLE)
        .select("*")
        .eq("token_hash", token_hash)
    )

    if not reset_rows:
        return {
            "error": "Недействительная ссылка"
        }

    record = reset_rows[0]

    try:
        expires_at = datetime.fromisoformat(record["expires_at"])
    except (KeyError, TypeError, ValueError):
        return {"error": "Недействительная ссылка"}

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < datetime.now(timezone.utc):
        _db_rows(
            supabase
            .table(PASSWORD_RESET_TOKEN_TABLE)
            .delete()
            .eq("token_hash", token_hash)
        )

        return {
            "error": "Срок действия ссылки истёк"
        }

    # DELETE ... RETURNING is the single-use gate. PostgreSQL serializes
    # concurrent deletes on the same token, so only one request can proceed.
    consumed_rows = _db_rows(
        supabase
        .table(PASSWORD_RESET_TOKEN_TABLE)
        .delete()
        .eq("token_hash", token_hash)
        .gt("expires_at", datetime.now(timezone.utc).isoformat())
        .select("email, token_hash")
    )

    if not consumed_rows:
        return {"error": "Недействительная ссылка"}

    hashed = hash_password(password)

    updated_users = _db_rows(
        supabase
        .table("users")
        .update({"password_hash": hashed})
        .eq("email", record["email"])
        .select("id")
    )

    if not updated_users:
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL)

    return {"ok": True}
