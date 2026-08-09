import os
import asyncio

import httpx

from aiogram import Bot, Dispatcher, Router
from aiogram.filters import CommandStart
from aiogram.types import (
    Message,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    CallbackQuery,
)


API_URL = "https://api.islandquiz.online"
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

if not BOT_TOKEN:
    raise RuntimeError("TELEGRAM_BOT_TOKEN environment variable is required")


bot = Bot(token=BOT_TOKEN)

dp = Dispatcher()
router = Router()


# ============================================================
# /start
# ============================================================

@router.message(CommandStart())
async def start_handler(message: Message):

    args = message.text.split(maxsplit=1)

    # --------------------------------------------------------
    # Обычный /start
    # --------------------------------------------------------

    if len(args) == 1:

        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="🌐 Открыть IslandQuiz",
                        url="https://islandquiz.online",
                    )
                ]
            ]
        )

        await message.answer(
            "🏝️ Привет! Я бот IslandQuiz.\n\n"
            "Через меня можно войти в свой аккаунт IslandQuiz.",
            reply_markup=keyboard,
        )

        return

    # --------------------------------------------------------
    # /start login_<token>
    # --------------------------------------------------------

    payload = args[1]

    if not payload.startswith("login_"):

        await message.answer(
            "❌ Неизвестная команда."
        )

        return

    token = payload[len("login_"):]

    # callback_data Telegram ограничивает 64 байтами.
    # Новый stateless token достаточно короткий.

    callback_data = f"login:{token}"

    if len(callback_data.encode("utf-8")) > 64:

        await message.answer(
            "❌ Не удалось создать подтверждение входа."
        )

        return

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ Подтвердить вход",
                    callback_data=callback_data,
                )
            ]
        ]
    )

    await message.answer(
        "🔐 Вход в IslandQuiz\n\n"
        "Нажми кнопку ниже, чтобы подтвердить вход "
        "через Telegram.",
        reply_markup=keyboard,
    )


# ============================================================
# CONFIRM LOGIN
# ============================================================

@router.callback_query(
    lambda callback: (
        callback.data is not None
        and callback.data.startswith("login:")
    )
)
async def login_confirm(callback: CallbackQuery):

    await callback.answer()

    token = callback.data.split(":", 1)[1]

    tg_user = callback.from_user

    try:

        async with httpx.AsyncClient(
            timeout=10.0
        ) as client:

            response = await client.post(
                f"{API_URL}/api/auth/telegram/bot-login",
                json={
                    "token": token,
                    "telegram_id": tg_user.id,
                    "telegram_username": tg_user.username,
                    "first_name": tg_user.first_name or "",
                    "last_name": tg_user.last_name or "",
                },
            )

        if response.status_code != 200:

            try:
                data = response.json()
                error = (
                    data.get("detail")
                    or data.get("error")
                    or "Не удалось выполнить вход."
                )
            except Exception:
                error = "Не удалось выполнить вход."

            await callback.message.edit_text(
                f"❌ {error}"
            )

            return

        data = response.json()

        if not data.get("ok") or not data.get("token"):

            await callback.message.edit_text(
                "❌ Не удалось выполнить вход."
            )

            return

        access_token = data["token"]

        # ----------------------------------------------------
        # ВАЖНО:
        # Теперь правильный URL.
        #
        # Было:
        # islandquiz.online/auth/telegram/complete
        #
        # Стало:
        # islandquiz.online/api/auth/telegram/complete
        # ----------------------------------------------------

        login_url = data["login_url"]

        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="🌐 Открыть IslandQuiz",
                        url=login_url,
                    )
                ]
            ]
        )

        await callback.message.edit_text(
            "✅ Вход подтверждён!\n\n"
            "Нажми кнопку ниже, чтобы открыть IslandQuiz.",
            reply_markup=keyboard,
        )

    except httpx.RequestError:

        await callback.message.edit_text(
            "❌ Не удалось связаться с сервером IslandQuiz."
        )

    except Exception:

        await callback.message.edit_text(
            "❌ Произошла ошибка при входе."
        )


# ============================================================
# MAIN
# ============================================================

async def main():

    dp.include_router(router)

    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
