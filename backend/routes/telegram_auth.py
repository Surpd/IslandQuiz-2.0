import base64
import os
import uuid
import hashlib
import hmac
import secrets

from typing import Optional
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from database import supabase
from routes.auth import (
    get_current_user_optional,
    create_access_token,
    UserOut,
)


router = APIRouter(
    prefix="/api/auth",
    tags=["telegram-auth"],
)


# ============================================================
# Configuration
# ============================================================

TELEGRAM_BOT_USERNAME = "IslandQuizbot"

TELEGRAM_AUTH_SECRET = (
    os.getenv("TELEGRAM_AUTH_SECRET")
    or os.getenv("JWT_SECRET")
)

if not TELEGRAM_AUTH_SECRET:
    raise RuntimeError(
        "TELEGRAM_AUTH_SECRET or JWT_SECRET environment variable is required"
    )


LOGIN_TOKEN_EXPIRE_MINUTES = 5
DB_ERROR_DETAIL = "Ошибка базы данных"


def _db_response(query):
    try:
        response = query.execute()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL) from exc
    if response is None:
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL)
    return response


def _db_rows(query):
    response = _db_response(query)
    data = getattr(response, "data", None)
    if data is None:
        return []
    if not isinstance(data, list):
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL)
    return [row for row in data if isinstance(row, dict)]


def _base36(value: int) -> str:
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    result = "0"
    if value:
        result = ""
        while value:
            value, remainder = divmod(value, 36)
            result = chars[remainder] + result
    return result.zfill(7)


# ============================================================
# Telegram login token
# ============================================================

TELEGRAM_TOKEN_TABLE = "telegram_login_nonces"


def _nonce_hash(nonce: str) -> str:
    return hmac.new(
        TELEGRAM_AUTH_SECRET.encode("utf-8"),
        nonce.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

def create_telegram_login_token(
    user_id: Optional[str] = None,
    token_type: str = "complete",
) -> str:
    """
    Создаёт подписанный одноразовый токен.

    Подпись остаётся stateless, а nonce регистрируется в Supabase до
    возврата токена. Это позволяет атомарно consume-ить credential после
    restart и при нескольких backend workers.

    Формат:

        user_id:expires:nonce:signature

    user_id может быть пустым, если пользователь ещё
    не существует.
    """

    expires = int(
        (
            datetime.now(timezone.utc)
            + timedelta(minutes=LOGIN_TOKEN_EXPIRE_MINUTES)
        ).timestamp()
    )

    expires_part = _base36(expires)
    nonce = secrets.token_urlsafe(8)
    user_part = "0"
    if user_id:
        try:
            user_part = "1" + base64.urlsafe_b64encode(
                uuid.UUID(str(user_id)).bytes
            ).decode().rstrip("=")
        except ValueError:
            user_part = "2" + base64.urlsafe_b64encode(
                str(user_id).encode()
            ).decode().rstrip("=")

    payload = f"{user_part}{expires_part}{nonce}"

    signature = hmac.new(
        TELEGRAM_AUTH_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()[:12]
    signature_part = base64.urlsafe_b64encode(signature).decode().rstrip("=")

    _db_response(
        supabase.table(TELEGRAM_TOKEN_TABLE).insert({
            "nonce_hash": _nonce_hash(nonce),
            "token_type": token_type,
            "expires_at": datetime.fromtimestamp(
                expires,
                timezone.utc,
            ).isoformat(),
        })
    )

    return f"{payload}{signature_part}"


def verify_telegram_login_token(
    token: str,
) -> dict:
    """
    Проверяет подпись и срок действия.

    БД для проверки подписи и срока не нужна. Одноразовость consume-ится
    отдельно endpoint-ом через атомарный UPDATE.
    """

    if len(token) < 35 or len(token) > 64 or token[0] not in ("0", "1", "2"):
        raise HTTPException(
            status_code=400,
            detail="Неверный токен Telegram",
        )

    payload = token[:-16]
    user_len = 1 if token[0] == "0" else len(payload) - 18
    user_part = token[:user_len]
    expires_part = token[user_len:user_len + 7]
    nonce = token[user_len + 7:-16]
    signature = token[-16:]

    try:
        expires = int(expires_part, 36)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Неверный срок действия токена",
        )

    expected = hmac.new(
        TELEGRAM_AUTH_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()[:12]
    expected_part = base64.urlsafe_b64encode(expected).decode().rstrip("=")

    if not hmac.compare_digest(
        signature,
        expected_part,
    ):
        raise HTTPException(
            status_code=403,
            detail="Недействительный токен Telegram",
        )

    if expires < int(
        datetime.now(timezone.utc).timestamp()
    ):
        raise HTTPException(
            status_code=403,
            detail="Ссылка Telegram устарела",
        )

    return {
        "user_id": (
            str(uuid.UUID(bytes=base64.urlsafe_b64decode(user_part[1:] + "=" * (-len(user_part[1:]) % 4))))
            if user_part[0] == "1"
            else (
                base64.urlsafe_b64decode(user_part[1:] + "=" * (-len(user_part[1:]) % 4)).decode()
                if user_part[0] == "2"
                else None
            )
        ),
        "expires": expires,
        "nonce": nonce,
    }


def consume_telegram_login_token(
    token_data: dict,
    token_type: str,
) -> None:
    """Atomically mark a valid Telegram credential as used exactly once."""

    rows = _db_rows(
        supabase
        .table(TELEGRAM_TOKEN_TABLE)
        .update({
            "consumed_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("nonce_hash", _nonce_hash(token_data["nonce"]))
        .eq("token_type", token_type)
        .is_("consumed_at", "null")
        .gt("expires_at", datetime.now(timezone.utc).isoformat())
        .select("nonce_hash")
    )

    if not rows:
        raise HTTPException(
            status_code=403,
            detail="Ссылка Telegram уже использована или недействительна",
        )


# ============================================================
# Schema
# ============================================================

class TelegramBotLoginInput(BaseModel):
    token: str
    confirm: bool = False

    telegram_id: int

    telegram_username: Optional[str] = None

    first_name: Optional[str] = ""

    last_name: Optional[str] = ""


# ============================================================
# WEBSITE → TELEGRAM
# ============================================================

@router.post("/telegram/start")
def start_telegram_login(
    mode: str = "login",
    user=Depends(get_current_user_optional),
):
    """
    Сайт начинает Telegram-вход.

    Если пользователь уже авторизован:
        токен содержит его user_id.

    Если пользователь не авторизован:
        user_id пустой.

    Ничего не пишем в БД.
    """

    token = create_telegram_login_token(
        user["id"] if user else None,
        token_type="bot_login",
    )

    start_prefix = "register_" if mode == "register" else "login_"
    bot_url = (
        f"https://t.me/{TELEGRAM_BOT_USERNAME}"
        f"?start={start_prefix}{quote(token, safe='')}"
    )

    return {
        "ok": True,
        "url": bot_url,
    }


# ============================================================
# BOT → BACKEND
# ============================================================

@router.post("/telegram/bot-login")
def telegram_bot_login(
    input: TelegramBotLoginInput,
):
    """
    Этот endpoint вызывает Telegram-бот.

    Возможны три ситуации:

    1. Telegram уже привязан к аккаунту.
    2. Пользователь начал привязку существующего аккаунта.
    3. Создаём новый Telegram-only аккаунт.

    Всё хранится только в users.
    """

    token_data = verify_telegram_login_token(
        input.token
    )
    consume_telegram_login_token(token_data, "bot_login")

    telegram_id = str(input.telegram_id)

    # --------------------------------------------------------
    # 1. Ищем аккаунт по Telegram ID
    # --------------------------------------------------------

    res_rows = _db_rows(
        supabase
        .table("users")
        .select("*")
        .eq("telegram_id", telegram_id)
    )

    if not res_rows and not token_data["user_id"] and not input.confirm:
        return {
            "ok": False,
            "needs_confirmation": True,
        }

    if res_rows:
        user = res_rows[0]

        if token_data["user_id"] and str(user["id"]) != str(token_data["user_id"]):
            raise HTTPException(
                status_code=409,
                detail="Этот Telegram уже привязан к другому аккаунту",
            )

        # Обновляем username/name при необходимости.
        updates = {}

        if input.telegram_username is not None:
            updates["telegram_username"] = (
                input.telegram_username
            )

        name = (
            f"{input.first_name or ''} "
            f"{input.last_name or ''}"
        ).strip()

        if name:
            updates["name"] = name[:100]

        if updates:
            _db_response(
                supabase
                .table("users")
                .update(updates)
                .eq("id", user["id"])
            )

            refreshed_rows = _db_rows(
                supabase
                .table("users")
                .select("*")
                .eq("id", user["id"])
            )

            if refreshed_rows:
                user = refreshed_rows[0]

    # --------------------------------------------------------
    # 2. Telegram привязывается к существующему аккаунту
    # --------------------------------------------------------

    elif token_data["user_id"]:
        existing_rows = _db_rows(
            supabase
            .table("users")
            .select("*")
            .eq("id", str(token_data["user_id"]))
        )

        if not existing_rows:
            raise HTTPException(
                status_code=404,
                detail="Пользователь не найден",
            )

        user = existing_rows[0]

        # Защита от привязки одного Telegram
        # к двум аккаунтам.
        already_bound_rows = _db_rows(
            supabase
            .table("users")
            .select("id")
            .eq("telegram_id", telegram_id)
        )

        if already_bound_rows:
            raise HTTPException(
                status_code=409,
                detail="Этот Telegram уже привязан к другому аккаунту",
            )

        name = (
            f"{input.first_name or ''} "
            f"{input.last_name or ''}"
        ).strip()

        updates = {
            "telegram_id": telegram_id,
            "telegram_username": input.telegram_username,
        }

        if name:
            updates["name"] = name[:100]

        _db_response(
            supabase
            .table("users")
            .update(updates)
            .eq("id", user["id"])
        )

        refreshed_rows = _db_rows(
            supabase
            .table("users")
            .select("*")
            .eq("id", user["id"])
        )

        if refreshed_rows:
            user = refreshed_rows[0]

    # --------------------------------------------------------
    # 3. Создаём новый Telegram-only аккаунт
    # --------------------------------------------------------

    else:
        user_id = str(uuid.uuid4())

        name = (
            f"{input.first_name or ''} "
            f"{input.last_name or ''}"
        ).strip()

        if not name:
            name = (
                input.telegram_username
                or f"User_{telegram_id}"
            )

        user = {
            "id": user_id,
            "email": None,
            "password_hash": None,
            "name": name[:100],
            "telegram_id": telegram_id,
            "telegram_username": input.telegram_username,
            "created_at": datetime.now(
                timezone.utc
            ).isoformat(),
        }

        inserted_rows = _db_rows(
            supabase
            .table("users")
            .insert(user)
        )

        if not inserted_rows:
            raise HTTPException(
                status_code=502,
                detail=DB_ERROR_DETAIL,
            )

        user = inserted_rows[0]

    # --------------------------------------------------------
    # Проверяем бан
    # --------------------------------------------------------

    if user.get("banned"):
        raise HTTPException(
            status_code=403,
            detail="Пользователь заблокирован",
        )

    # --------------------------------------------------------
    # Создаём обычный IslandQuiz JWT
    # --------------------------------------------------------

    access_token = create_access_token(
        str(user["id"])
    )

    # --------------------------------------------------------
    # Создаём короткий токен завершения.
    #
    # Он содержит user_id и подписан секретом.
    # Никакой session table.
    # --------------------------------------------------------

    completion_token = create_telegram_login_token(
        str(user["id"]),
        token_type="complete",
    )

    login_url = (
        "https://islandquiz.online/login"
        "?telegram_token="
        f"{quote(completion_token, safe='')}"
    )

    return {
        "ok": True,
        "user": UserOut(**user).model_dump(
            mode="json"
        ),
        "token": access_token,
        "login_url": login_url,
    }


# ============================================================
# WEBSITE → COMPLETE
# ============================================================

@router.get("/telegram/complete")
def telegram_complete(
    token: str,
):
    """
    Завершает Telegram-вход.

    Возвращает обычный IslandQuiz JWT.
    Никаких cookie и никаких session tables.
    """

    token_data = verify_telegram_login_token(
        token
    )
    consume_telegram_login_token(token_data, "complete")

    if not token_data["user_id"]:
        raise HTTPException(
            status_code=400,
            detail="В токене нет пользователя",
        )

    res_rows = _db_rows(
        supabase
        .table("users")
        .select("*")
        .eq("id", str(token_data["user_id"]))
    )

    if not res_rows:
        raise HTTPException(
            status_code=404,
            detail="Пользователь не найден",
        )

    user = res_rows[0]

    if user.get("banned"):
        raise HTTPException(
            status_code=403,
            detail="Пользователь заблокирован",
        )

    access_token = create_access_token(
        str(user["id"])
    )

    return {
        "ok": True,
        "token": access_token,
        "user": UserOut(**user).model_dump(
            mode="json"
        ),
    }
