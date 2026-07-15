from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from routes.auth import router as auth_router
from routes.users import router as users_router
from routes.games import router as games_router
from routes.results import router as results_router
from routes.ai import router as ai_router
from routes.rooms import router as rooms_router

app = FastAPI(title="IslandQuiz API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "https://islandquiz.pages.dev",
    "https://6c2d161c.islandquiz.pages.dev",],
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


@app.on_event("startup")
def startup():
    init_db()
    print("Database initialized")


@app.get("/")
def root():
    return {"name": "IslandQuiz API", "version": "1.0.0"}