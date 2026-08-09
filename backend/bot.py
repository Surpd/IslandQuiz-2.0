import os
import asyncio
from aiogram import Bot, Dispatcher, Router
from aiogram.filters import CommandStart
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
import httpx

API_URL = "https://api.islandquiz.online"
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
router = Router()

@router.message(CommandStart())
async def start_handler(message: Message):
    args = message.text.split(maxsplit=1)
    
    if len(args) == 1:
        await message.answer(
            "🏝️ Привет! Я бот IslandQuiz.\n\n"
            "Здесь ты можешь войти в свой аккаунт.",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
                InlineKeyboardButton(
                    text="🌐 Открыть IslandQuiz",
                    url="https://islandquiz.online"
                )
            ]])
        )
        return
    
    payload = args[1]
    
    if payload.startswith("login_"):
        token = payload[6:]
        
        keyboard = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(
                text="✅ Подтвердить вход",
                callback_data=f"login:{token}"
            )
        ]])
        
        await message.answer(
            "🔐 Подтверждение входа в IslandQuiz\n\n"
            "Нажми кнопку ниже, чтобы войти.",
            reply_markup=keyboard
        )
    else:
        await message.answer("Неизвестная команда.")

@router.callback_query(lambda c: c.data.startswith("login:"))
async def login_confirm(callback: CallbackQuery):
    token = callback.data.split(":", 1)[1]
    
    tg_user = callback.from_user
    
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{API_URL}/api/auth/telegram/bot-login",
            json={
                "token": token,
                "telegram_id": tg_user.id,
                "telegram_username": tg_user.username,
                "first_name": tg_user.first_name or "",
                "last_name": tg_user.last_name or "",
            }
        )
        data = res.json()
    
    if not data.get("ok"):
        await callback.message.edit_text("❌ Не удалось выполнить вход.")
        return
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="🌐 Открыть IslandQuiz",
            url=data["login_url"]
        )
    ]])
    
    await callback.message.edit_text(
        "✅ Вход подтверждён!\n\nНажми кнопку, чтобы открыть IslandQuiz.",
        reply_markup=keyboard
    )

async def main():
    dp.include_router(router)
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())