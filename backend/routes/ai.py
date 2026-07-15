import os
import json
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel
import httpx

from services.ai_prompts import (
    generate_question_prompt,
    improve_question_prompt,
    generate_quiz_prompt,
    generate_jeopardy_categories_prompt,
    generate_jeopardy_questions_prompt,
)

router = APIRouter(prefix="/api/ai", tags=["ai"])

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_URL = "https://api.openai.com/v1/chat/completions"

# ---------- Schemas ----------

class GeneratedQuestion(BaseModel):
    difficulty: str
    question: str
    options: Optional[list[str]] = None
    correct: Optional[int | bool] = None
    correctAnswer: Optional[str] = None
    pairs: Optional[list[dict]] = None


class GeneratedQuizQuestion(BaseModel):
    type: str
    question: str
    options: Optional[list[str]] = None
    correct: Optional[int | bool] = None
    correctAnswer: Optional[str] = None
    pairs: Optional[list[dict]] = None


class GeneratedJeopardyCategory(BaseModel):
    name: str
    description: str


class GeneratedJeopardyQuestion(BaseModel):
    points: int
    difficulty: str
    q: str
    a: str


# ---------- Helpers ----------

async def call_openai(prompt: str) -> str:
    """Call OpenAI API or return mock response if no key."""
    if not OPENAI_API_KEY:
        # Return mock response for testing
        return json.dumps({"mock": True, "prompt": prompt[:100]})

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            OPENAI_URL,
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.8,
                "response_format": {"type": "json_object"},
            },
        )
        data = response.json()
        return data["choices"][0]["message"]["content"]


# ---------- Routes ----------

@router.post("/generate-question", response_model=dict)
async def generate_question(
    topic: Optional[str] = None,
    type: Optional[str] = "choice",
    currentText: Optional[str] = None,
    wishes: Optional[str] = None,
    format: Optional[str] = None,
):
    # If currentText provided — improve instead
    if currentText and currentText.strip():
        prompt = improve_question_prompt(
            current_text=currentText,
            format_type=format or type or "quiz-choice",
            topic=topic,
            wishes=wishes,
        )
        raw = await call_openai(prompt)
        return {"variants": json.loads(raw) if isinstance(raw, str) else raw}

    prompt = generate_question_prompt(
        topic=topic or "общая эрудиция",
        question_type=type or "choice",
        difficulty="mixed",
        wishes=wishes,
        count=3,
    )
    raw = await call_openai(prompt)
    return {"variants": json.loads(raw) if isinstance(raw, str) else raw}


@router.post("/improve-question", response_model=dict)
async def improve_question(
    currentText: str,
    format: str = "quiz-choice",
    topic: Optional[str] = None,
    wishes: Optional[str] = None,
):
    prompt = improve_question_prompt(
        current_text=currentText,
        format_type=format,
        topic=topic,
        wishes=wishes,
    )
    raw = await call_openai(prompt)
    result = json.loads(raw) if isinstance(raw, str) else raw
    return {"variants": result.get("variants", [result]) if isinstance(result, dict) else result}


@router.post("/generate-quiz", response_model=dict)
async def generate_quiz(
    topic: Optional[str] = None,
    count: Optional[int] = 10,
    wishes: Optional[str] = None,
):
    prompt = generate_quiz_prompt(
        topic=topic or "Удивительные открытия",
        count=min(20, max(5, count or 10)),
        wishes=wishes,
    )
    raw = await call_openai(prompt)
    result = json.loads(raw) if isinstance(raw, str) else raw
    return result


@router.post("/generate-jeopardy-categories", response_model=dict)
async def generate_jeopardy_categories(
    topic: Optional[str] = None,
    wishes: Optional[str] = None,
):
    prompt = generate_jeopardy_categories_prompt(
        topic=topic or "Удивительные явления",
        wishes=wishes,
    )
    raw = await call_openai(prompt)
    result = json.loads(raw) if isinstance(raw, str) else raw
    return result


@router.post("/generate-jeopardy-questions", response_model=dict)
async def generate_jeopardy_questions(
    category: str,
    emptySlots: list[int],
    wishes: Optional[str] = None,
):
    prompt = generate_jeopardy_questions_prompt(
        category=category,
        empty_slots=emptySlots,
        wishes=wishes,
    )
    raw = await call_openai(prompt)
    result = json.loads(raw) if isinstance(raw, str) else raw
    return result