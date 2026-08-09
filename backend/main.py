import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from limiter import limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import _rate_limit_exceeded_handler

from database import init_db
from routes.auth import router as auth_router
from routes.users import router as users_router
from routes.games import router as games_router
from routes.results import router as results_router
from routes.ai import router as ai_router
from routes.rooms import router as rooms_router
from routes.admin import router as admin_router
from routes.feedback import router as feedback_router
from routes.telegram_auth import router as telegram_auth_router


app = FastAPI(title="IslandQuiz API", version="1.0.0")
bot_task: asyncio.Task | None = None
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://islandquiz.online",
        "https://www.islandquiz.online",
        "https://islandquiz.ru",
        "https://www.islandquiz.ru",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(games_router)
app.include_router(results_router)
app.include_router(ai_router)
app.include_router(rooms_router)
app.include_router(admin_router)
app.include_router(feedback_router)
app.include_router(telegram_auth_router)
@app.on_event("startup")
async def startup():
    global bot_task
    init_db()
    from bot import main as bot_main

    bot_task = asyncio.create_task(bot_main())


@app.on_event("shutdown")
async def shutdown():
    if bot_task:
        bot_task.cancel()

@app.get("/")
def root():
    return {"name": "IslandQuiz API", "version": "1.0.0"}
