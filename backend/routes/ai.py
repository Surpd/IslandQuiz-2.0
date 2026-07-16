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
OPENAI_URL = "https://api.groq.com/openai/v1/chat/completions"

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
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.8,
                "response_format": {"type": "json_object"},
            },
        )
        data = response.json()
        return data["choices"][0]["message"]["content"]
        content = data["choices"][0]["message"]["content"]
        print(f"[AI] Raw response: {content[:300]}")
        return content


def normalize_variants(result) -> list:
    """Приводит ответ AI к списку вариантов с difficulty и correctAnswer."""
    variants = []
    if isinstance(result, dict):
        if "variants" in result:
            v = result["variants"]
            if isinstance(v, dict) and "questions" in v:
                variants = v["questions"]
            elif isinstance(v, list):
                variants = v
            else:
                variants = [v]
        elif "questions" in result:
            variants = result["questions"]
        else:
            variants = [result]
    elif isinstance(result, list):
        variants = result
    else:
        variants = []

    difficulties = ["easy", "medium", "hard"]
    for i, v in enumerate(variants):
        if isinstance(v, dict):
            if "difficulty" not in v:
                v["difficulty"] = difficulties[i] if i < len(difficulties) else "medium"
            if "correctAnswer" not in v and "options" in v and "correct" in v:
                idx = v["correct"]
                if isinstance(idx, int) and 0 <= idx < len(v["options"]):
                    v["correctAnswer"] = v["options"][idx]

    return variants
# ---------- Routes ----------

from pydantic import BaseModel

class GenerateQuestionInput(BaseModel):
    topic: Optional[str] = None
    type: Optional[str] = "choice"
    currentText: Optional[str] = None
    wishes: Optional[str] = None
    format: Optional[str] = None
    reroll: Optional[bool] = None


class ImproveQuestionInput(BaseModel):
    currentText: str
    format: str = "quiz-choice"
    topic: Optional[str] = None
    wishes: Optional[str] = None
    reroll: Optional[bool] = None


@router.post("/generate-question", response_model=dict)
async def generate_question(input: GenerateQuestionInput):
    print(f"[AI] generate_question called: topic={input.topic!r}, type={input.type!r}")

    if input.currentText and input.currentText.strip():
        prompt = improve_question_prompt(
            current_text=input.currentText,
            format_type=input.format or input.type or "quiz-choice",
            topic=input.topic,
            wishes=input.wishes,
        )
        raw = await call_openai(prompt)
        result = json.loads(raw) if isinstance(raw, str) else raw
        variants = normalize_variants(result)
        return {"variants": variants}

    prompt = generate_question_prompt(
        topic=input.topic or "общая эрудиция",
        question_type=input.type or "choice",
        difficulty="mixed",
        wishes=input.wishes,
        count=3,
    )
    raw = await call_openai(prompt)
    result = json.loads(raw) if isinstance(raw, str) else raw
    variants = normalize_variants(result)
    return {"variants": variants}


@router.post("/improve-question", response_model=dict)
async def improve_question(input: ImproveQuestionInput):
    prompt = improve_question_prompt(
        current_text=input.currentText,
        format_type=input.format,
        topic=input.topic,
        wishes=input.wishes,
    )
    raw = await call_openai(prompt)
    result = json.loads(raw) if isinstance(raw, str) else raw
    variants = normalize_variants(result)
    return {"variants": variants}



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