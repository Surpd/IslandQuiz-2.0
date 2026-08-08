import os
import json
from typing import Optional, List
import io

import httpx
import pdfplumber
from docx import Document

from fastapi import (
    APIRouter,
    Depends,
    UploadFile,
    File,
    Form,
    Request,
    HTTPException,
)
from pydantic import BaseModel
from datetime import datetime

from routes.auth import get_current_user
from services.ai_prompts import (
    generate_question_prompt,
    improve_question_prompt,
    generate_quiz_prompt,
    generate_jeopardy_categories_prompt,
    generate_jeopardy_questions_prompt,
)
from limiter import limiter
from database import supabase


router = APIRouter(prefix="/api/ai", tags=["ai"])

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


# ============================================================
# AI CLIENT
# ============================================================

async def call_openai(prompt: str) -> str:
    """
    Несмотря на название, здесь используется Groq API
    через OpenAI-compatible endpoint.
    """

    if not OPENAI_API_KEY:
        return json.dumps({
            "mock": True,
            "prompt": prompt[:100],
        })

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {
                        "role": "user",
                        "content": prompt,
                    }
                ],
                "temperature": 0.7,
            },
        )

        data = response.json()

        if "choices" not in data or not data["choices"]:
            print(
                f"[AI] Bad response: "
                f"{json.dumps(data)[:500]}"
            )
            return json.dumps({
                "error": "Empty response",
            })

        content = data["choices"][0]["message"]["content"]

        return content


# ============================================================
# NORMALIZATION
# ============================================================

def normalize_variants(result) -> list:
    """
    Приводит разные варианты ответа AI
    к единому массиву variants.
    """

    variants = []

    if isinstance(result, dict):
        if "variants" in result:
            value = result["variants"]

            if isinstance(value, dict) and "questions" in value:
                variants = value["questions"]

            elif isinstance(value, list):
                variants = value

            else:
                variants = [value]

        elif "questions" in result:
            variants = result["questions"]

        else:
            variants = [result]

    elif isinstance(result, list):
        variants = result

    difficulties = [
        "easy",
        "medium",
        "hard",
    ]

    for i, variant in enumerate(variants):
        if not isinstance(variant, dict):
            continue

        # Если AI не вернул difficulty,
        # добавляем безопасное значение.
        if "difficulty" not in variant:
            variant["difficulty"] = (
                difficulties[i]
                if i < len(difficulties)
                else "medium"
            )

        # Нормализация правильного ответа.
        if "correctAnswer" not in variant:

            if (
                "options" in variant
                and "correct" in variant
            ):
                index = variant["correct"]

                if (
                    isinstance(index, int)
                    and 0 <= index < len(variant["options"])
                ):
                    variant["correctAnswer"] = (
                        variant["options"][index]
                    )

            elif "answer" in variant:
                variant["correctAnswer"] = variant["answer"]

            else:
                variant["correctAnswer"] = ""

        if "options" not in variant:
            variant["options"] = []

        if "pairs" not in variant:
            variant["pairs"] = []

    return variants


def clean_json(raw: str) -> str:
    """
    Убирает markdown-обёртку ```json ... ```
    если модель всё-таки её вернула.
    """

    cleaned = raw.strip()

    if cleaned.startswith("```"):
        lines = cleaned.split("\n")

        if lines and lines[0].startswith("```"):
            lines = lines[1:]

        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]

        cleaned = "\n".join(lines)

    return cleaned.strip()


# ============================================================
# AI LIMITS
# ============================================================

def get_today_ai_count(user_id: str) -> int:
    today = datetime.utcnow().strftime("%Y-%m-%d")

    res = (
        supabase
        .table("ai_usage")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .gte("created_at", today)
        .execute()
    )

    return (
        res.count
        if hasattr(res, "count")
        else len(res.data or [])
    )


def increment_ai_count(
    user_id: str,
    request_type: str,
):
    supabase.table("ai_usage").insert({
        "user_id": user_id,
        "request_type": request_type,
    }).execute()


def check_ai_limit(user):
    if not user:
        return

    role = user.get("role", "user")

    if role == "admin":
        return

    plan = user.get("plan", "free")

    limits = {
        "free": 10,
        "premium": 100,
    }

    daily_limit = limits.get(plan, 10)

    count = get_today_ai_count(user["id"])

    if count >= daily_limit:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Лимит AI-запросов исчерпан "
                f"({daily_limit}/день). "
                f"Повысьте тариф до Premium."
            ),
        )

    increment_ai_count(
        user["id"],
        "ai_request",
    )


# ============================================================
# SCHEMAS
# ============================================================

class GenerateQuestionInput(BaseModel):
    topic: Optional[str] = None
    type: Optional[str] = "choice"
    currentText: Optional[str] = None
    wishes: Optional[str] = None
    format: Optional[str] = None
    reroll: Optional[bool] = None

    # Сложность одного вопроса.
    difficulty: Optional[str] = "mixed"


class ImproveQuestionInput(BaseModel):
    currentText: str
    format: str = "quiz-choice"
    topic: Optional[str] = None
    wishes: Optional[str] = None
    reroll: Optional[bool] = None

    # Сложность улучшенного вопроса.
    difficulty: Optional[str] = "mixed"


class GenerateQuizInput(BaseModel):
    topic: Optional[str] = None
    count: Optional[int] = 10

    # Новое поле:
    # easy / medium / hard / mixed
    difficulty: Optional[str] = "mixed"

    wishes: Optional[str] = None


class GenerateJeopardyCategoriesInput(BaseModel):
    topic: Optional[str] = None
    wishes: Optional[str] = None


class GenerateJeopardyQuestionsInput(BaseModel):
    category: str
    emptySlots: List[int] = [100, 200, 300, 400, 500]
    wishes: Optional[str] = None


# ============================================================
# GENERATE SINGLE QUESTION
# ============================================================

@router.post(
    "/generate-question",
    response_model=dict,
)
@limiter.limit("10/minute")
async def generate_question(
    request: Request,
    input: GenerateQuestionInput,
    user=Depends(get_current_user),
):
    check_ai_limit(user)

    qtype = input.type or "choice"

    fmt = input.format or ""

    # Формат имеет приоритет над type.
    if fmt == "quiz-matching":
        qtype = "matching"

    elif fmt == "quiz-close":
        qtype = "close"

    elif fmt == "quiz-ordering":
        qtype = "ordering"

    elif fmt == "quiz-bool":
        qtype = "bool"

    elif fmt == "quiz-text":
        qtype = "text"

    # --------------------------------------------------------
    # Улучшение существующего вопроса
    # --------------------------------------------------------

    if input.currentText and input.currentText.strip():

        prompt = improve_question_prompt(
            current_text=input.currentText,
            format_type=(
                input.format
                or input.type
                or "quiz-choice"
            ),
            topic=input.topic,
            wishes=input.wishes,
            difficulty=input.difficulty or "mixed",
        )

        raw = await call_openai(prompt)

        if not raw or not raw.strip():
            return {
                "error": "Empty response from AI",
            }

        try:
            result = (
                json.loads(clean_json(raw))
                if isinstance(raw, str)
                else raw
            )

            variants = normalize_variants(result)

            return {
                "variants": variants,
            }

        except json.JSONDecodeError:
            return {
                "error": "Invalid JSON",
                "raw": raw[:500],
            }

    # --------------------------------------------------------
    # Новая генерация вопроса
    # --------------------------------------------------------

    prompt = generate_question_prompt(
        topic=input.topic or "общая эрудиция",
        question_type=qtype,
        difficulty=input.difficulty or "mixed",
        wishes=input.wishes,
        count=3,
    )

    raw = await call_openai(prompt)

    if not raw or not raw.strip():
        return {
            "error": "Empty response from AI",
        }

    try:
        result = (
            json.loads(clean_json(raw))
            if isinstance(raw, str)
            else raw
        )

        variants = normalize_variants(result)

        return {
            "variants": variants,
        }

    except json.JSONDecodeError:
        return {
            "error": "Invalid JSON",
            "raw": raw[:500],
        }


# ============================================================
# IMPROVE QUESTION
# ============================================================

@router.post(
    "/improve-question",
    response_model=dict,
)
@limiter.limit("10/minute")
async def improve_question(
    request: Request,
    input: ImproveQuestionInput,
    user=Depends(get_current_user),
):
    check_ai_limit(user)

    prompt = improve_question_prompt(
        current_text=input.currentText,
        format_type=input.format,
        topic=input.topic,
        wishes=input.wishes,
        difficulty=input.difficulty or "mixed",
    )

    raw = await call_openai(prompt)

    if not raw or not raw.strip():
        return {
            "error": "Empty response from AI",
        }

    try:
        result = (
            json.loads(clean_json(raw))
            if isinstance(raw, str)
            else raw
        )

        variants = normalize_variants(result)

        return {
            "variants": variants,
        }

    except json.JSONDecodeError:
        return {
            "error": "Invalid JSON",
            "raw": raw[:500],
        }


# ============================================================
# GENERATE QUIZ
# ============================================================

@router.post(
    "/generate-quiz",
    response_model=dict,
)
@limiter.limit("5/minute")
async def generate_quiz(
    request: Request,
    input: GenerateQuizInput,
    user=Depends(get_current_user),
):
    check_ai_limit(user)

    count = min(
        20,
        max(
            5,
            input.count or 10,
        ),
    )

    difficulty = input.difficulty or "mixed"

    # Защита от случайных значений
    # с фронтенда.
    if difficulty not in {
        "easy",
        "medium",
        "hard",
        "mixed",
    }:
        difficulty = "mixed"

    prompt = generate_quiz_prompt(
        topic=input.topic or "Удивительные открытия",
        count=count,
        difficulty=difficulty,
        wishes=input.wishes,
    )

    raw = await call_openai(prompt)

    if not raw or not raw.strip():
        return {
            "error": "Empty response from AI",
        }

    try:
        result = (
            json.loads(clean_json(raw))
            if isinstance(raw, str)
            else raw
        )

        return result

    except json.JSONDecodeError:
        return {
            "error": "Invalid JSON",
            "raw": raw[:1000],
        }


# ============================================================
# JEOPARDY CATEGORIES
# ============================================================

@router.post(
    "/generate-jeopardy-categories",
    response_model=dict,
)
@limiter.limit("5/minute")
async def generate_jeopardy_categories(
    request: Request,
    input: GenerateJeopardyCategoriesInput,
    user=Depends(get_current_user),
):
    check_ai_limit(user)

    prompt = generate_jeopardy_categories_prompt(
        topic=(
            input.topic
            or "Удивительные явления"
        ),
        wishes=input.wishes,
    )

    raw = await call_openai(prompt)

    if not raw or not raw.strip():
        return {
            "error": "Empty response from AI",
        }

    try:
        return (
            json.loads(clean_json(raw))
            if isinstance(raw, str)
            else raw
        )

    except json.JSONDecodeError:
        return {
            "error": "Invalid JSON",
            "raw": raw[:500],
        }


# ============================================================
# JEOPARDY QUESTIONS
# ============================================================

@router.post(
    "/generate-jeopardy-questions",
    response_model=dict,
)
@limiter.limit("5/minute")
async def generate_jeopardy_questions(
    request: Request,
    input: GenerateJeopardyQuestionsInput,
    user=Depends(get_current_user),
):
    check_ai_limit(user)

    prompt = generate_jeopardy_questions_prompt(
        category=input.category,
        empty_slots=input.emptySlots,
        wishes=input.wishes,
    )

    raw = await call_openai(prompt)

    if not raw or not raw.strip():
        return {
            "error": "Empty response from AI",
        }

    try:
        return (
            json.loads(clean_json(raw))
            if isinstance(raw, str)
            else raw
        )

    except json.JSONDecodeError:
        return {
            "error": "Invalid JSON",
            "raw": raw[:500],
        }


# ============================================================
# GENERATE FROM FILE
# ============================================================

@router.post("/generate-from-file")
@limiter.limit("5/minute")
async def generate_from_file(
    request: Request,
    file: UploadFile = File(...),
    count: int = Form(10),
    difficulty: str = Form("mixed"),
    wishes: str = Form(""),
):
    content = await file.read()

    # --------------------------------------------------------
    # Размер
    # --------------------------------------------------------

    if len(content) > 10 * 1024 * 1024:
        return {
            "error": (
                "Файл слишком большой. "
                "Максимальный размер: 10 МБ."
            ),
        }

    # --------------------------------------------------------
    # Расширение
    # --------------------------------------------------------

    filename = (
        file.filename.lower()
        if file.filename
        else ""
    )

    allowed_extensions = (
        ".pdf",
        ".docx",
        ".txt",
        ".md",
    )

    if not filename.endswith(
        allowed_extensions
    ):
        return {
            "error": (
                "Неподдерживаемый формат. "
                "Поддерживаются: PDF, DOCX, TXT, MD."
            ),
        }

    # --------------------------------------------------------
    # MIME
    # --------------------------------------------------------

    allowed_mime = {
        "application/pdf",
        (
            "application/vnd.openxmlformats-"
            "officedocument.wordprocessingml.document"
        ),
        "text/plain",
        "text/markdown",
        "application/octet-stream",
    }

    if (
        file.content_type
        and file.content_type not in allowed_mime
    ):
        return {
            "error": (
                f"Неподдерживаемый тип файла: "
                f"{file.content_type}. "
                "Разрешены: PDF, DOCX, TXT, MD."
            ),
        }

    # --------------------------------------------------------
    # Извлечение текста
    # --------------------------------------------------------

    text = ""

    try:
        if filename.endswith(".pdf"):
            with pdfplumber.open(
                io.BytesIO(content)
            ) as pdf:
                text = "\n".join(
                    page.extract_text() or ""
                    for page in pdf.pages
                )

        elif filename.endswith(".docx"):
            doc = Document(
                io.BytesIO(content)
            )

            text = "\n".join(
                paragraph.text
                for paragraph in doc.paragraphs
            )

        elif filename.endswith(
            (".txt", ".md")
        ):
            text = content.decode("utf-8")

    except Exception as e:
        return {
            "error": (
                f"Ошибка чтения файла: {str(e)}"
            ),
        }

    if not text.strip():
        return {
            "error": "Не удалось извлечь текст.",
        }

    # --------------------------------------------------------
    # Ограничение текста
    # --------------------------------------------------------

    text = text[:5000]

    # --------------------------------------------------------
    # Нормализация сложности
    # --------------------------------------------------------

    if difficulty not in {
        "easy",
        "medium",
        "hard",
        "mixed",
    }:
        difficulty = "mixed"

    # --------------------------------------------------------
    # Генерация
    # --------------------------------------------------------

    prompt = generate_quiz_prompt(
        topic=text,
        count=min(20, max(5, count)),
        difficulty=difficulty,
        wishes=wishes,
    )

    raw = await call_openai(prompt)

    if not raw or not raw.strip():
        return {
            "error": "AI не ответил",
        }

    try:
        return (
            json.loads(clean_json(raw))
            if isinstance(raw, str)
            else raw
        )

    except json.JSONDecodeError:
        return {
            "error": "Ошибка парсинга",
            "raw": raw[:1000],
        }