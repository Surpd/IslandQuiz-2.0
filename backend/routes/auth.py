import os

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