import asyncio
import logging
import time
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
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
logger = logging.getLogger("islandquiz.observability")
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
    expose_headers=["X-Request-ID"],
)


@app.middleware("http")
async def add_request_id_and_log_failures(request: Request, call_next):
    request_id = uuid4().hex
    request.state.request_id = request_id
    started_at = time.perf_counter()

    try:
        response = await call_next(request)
    except Exception as error:
        logger.error(
            "request_unhandled_error request_id=%s method=%s route=%s status=500 duration_ms=%s error_type=%s",
            request_id,
            request.method,
            request.scope.get("route").path if request.scope.get("route") else "unknown",
            round((time.perf_counter() - started_at) * 1000),
            type(error).__name__,
        )
        return PlainTextResponse("Internal Server Error", status_code=500, headers={"X-Request-ID": request_id})

    response.headers["X-Request-ID"] = request_id
    if response.status_code >= 500:
        route = request.scope.get("route")
        logger.warning(
            "request_failure request_id=%s method=%s route=%s status=%s duration_ms=%s",
            request_id,
            request.method,
            route.path if route else "unknown",
            response.status_code,
            round((time.perf_counter() - started_at) * 1000),
        )
    return response

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
    return {"status": "ok", "name": "IslandQuiz API", "version": "1.0.0"}
