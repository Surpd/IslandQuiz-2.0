from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from database import get_db
from models import User

import os

router = APIRouter(prefix="/api/auth", tags=["auth"])

# JWT config
SECRET_KEY = os.getenv("JWT_SECRET", "islandquiz-dev-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ---------- Schemas ----------

class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    name: str


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
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"sub": user_id, "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
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

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user


# ---------- Routes ----------

@router.post("/register", response_model=AuthResponse)
def register(input: RegisterInput, db: Session = Depends(get_db)):
    # Check if user exists
    existing = db.query(User).filter(User.email == input.email).first()
    if existing:
        return {"ok": False, "error": "Пользователь с таким email уже существует"}

    # Create user
    import uuid
    user = User(
        id=str(uuid.uuid4())[:8],
        email=input.email,
        password_hash=hash_password(input.password),
        name=input.name,
        created_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    return {"ok": True, "user": UserOut.model_validate(user), "token": token}


@router.post("/login", response_model=AuthResponse)
def login(input: LoginInput, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == input.email).first()
    if not user or not verify_password(input.password, user.password_hash):
        return {"ok": False, "error": "Неверный email или пароль"}

    token = create_access_token(user.id)
    return {"ok": True, "user": UserOut.model_validate(user), "token": token}


@router.post("/logout")
def logout():
    # JWT is stateless — client just removes token
    return {"ok": True}


@router.get("/me", response_model=Optional[UserOut])
def get_me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.patch("/me", response_model=Optional[UserOut])
def update_me(
    name: Optional[str] = None,
    avatar: Optional[str] = None,
    bio: Optional[str] = None,
    subject: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if name is not None:
        current_user.name = name
    if avatar is not None:
        current_user.avatar = avatar
    if bio is not None:
        current_user.bio = bio
    if subject is not None:
        current_user.subject = subject

    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)