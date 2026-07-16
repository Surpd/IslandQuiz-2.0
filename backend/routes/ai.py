import os
import json
from typing import Optional, List

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
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


async def call_openai(prompt: str) -> str:
    if not OPENAI_API_KEY:
        return json.dumps({"mock": True, "prompt": prompt[:100]})

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7,
            },
        )
        data = response.json()
        if "choices" not in data or not data["choices"]:
            print(f"[AI] Bad response: {json.dumps(data)[:300]}")
            return json.dumps({"error": "Empty response"})
        content = data["choices"][0]["message"]["content"]
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


# ---------- Schemas ----------

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


class GenerateQuizInput(BaseModel):
    topic: Optional[str] = None
    count: Optional[int] = 10
    wishes: Optional[str] = None


class GenerateJeopardyCategoriesInput(BaseModel):
    topic: Optional[str] = None
    wishes: Optional[str] = None


class GenerateJeopardyQuestionsInput(BaseModel):
    category: str
    emptySlots: List[int] = [100, 200, 300, 400, 500]
    wishes: Optional[str] = None


# ---------- Routes ----------

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
async def generate_quiz(input: GenerateQuizInput):
    prompt = generate_quiz_prompt(
        topic=input.topic or "Удивительные открытия",
        count=min(20, max(5, input.count or 10)),
        wishes=input.wishes,
    )
    raw = await call_openai(prompt)
    result = json.loads(raw) if isinstance(raw, str) else raw
    return result


@router.post("/generate-jeopardy-categories", response_model=dict)
async def generate_jeopardy_categories(input: GenerateJeopardyCategoriesInput):
    prompt = generate_jeopardy_categories_prompt(
        topic=input.topic or "Удивительные явления",
        wishes=input.wishes,
    )
    raw = await call_openai(prompt)
    result = json.loads(raw) if isinstance(raw, str) else raw
    return result


@router.post("/generate-jeopardy-questions", response_model=dict)
async def generate_jeopardy_questions(input: GenerateJeopardyQuestionsInput):
    prompt = generate_jeopardy_questions_prompt(
        category=input.category,
        empty_slots=input.emptySlots,
        wishes=input.wishes,
    )
    raw = await call_openai(prompt)
    result = json.loads(raw) if isinstance(raw, str) else raw
    return result