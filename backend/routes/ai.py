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

from services.ai_validator import (
    validate_variants,
    validate_quiz,
)

from limiter import limiter
from database import supabase


router = APIRouter(prefix="/api/ai", tags=["ai"])


# ============================================================
# CONFIG
# ============================================================

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

GROQ_URL = (
    "https://api.groq.com/openai/v1/chat/completions"
)

AI_MODEL = "llama-3.3-70b-versatile"

AI_TIMEOUT = 60.0


# ============================================================
# AI CLIENT
# ============================================================

async def call_openai(prompt: str) -> str:
    """
    Несмотря на название, используется Groq API
    через OpenAI-compatible endpoint.

    Функция возвращает:
    - текст ответа AI;
    - JSON-строку с ошибкой, если Groq ответил ошибкой.

    Никаких повторных AI-запросов здесь нет.
    """

    if not OPENAI_API_KEY:
        return json.dumps({
            "mock": True,
            "prompt": prompt[:100],
        })

    try:
        async with httpx.AsyncClient(
            timeout=AI_TIMEOUT
        ) as client:

            response = await client.post(
                GROQ_URL,
                headers={
                    "Authorization": (
                        f"Bearer {OPENAI_API_KEY}"
                    ),
                    "Content-Type": "application/json",
                },
                json={
                    "model": AI_MODEL,
                    "messages": [
                        {
                            "role": "user",
                            "content": prompt,
                        }
                    ],
                    "temperature": 0.7,
                },
            )

            # ВАЖНО:
            # не пытаемся молча парсить ошибку Groq
            # как обычный AI JSON.
            if response.status_code >= 400:
                print(
                    "[AI] Groq HTTP error:",
                    response.status_code,
                    response.text[:1000],
                )

                return json.dumps({
                    "error": "Groq API error",
                    "status_code": response.status_code,
                })

            try:
                data = response.json()

            except Exception:
                print(
                    "[AI] Groq returned invalid JSON:",
                    response.text[:1000],
                )

                return json.dumps({
                    "error": "Invalid response from Groq",
                })

            if (
                "choices" not in data
                or not data["choices"]
            ):
                print(
                    "[AI] Bad response:",
                    json.dumps(data)[:1000],
                )

                return json.dumps({
                    "error": "Empty response from AI",
                })

            message = data["choices"][0].get(
                "message",
                {},
            )

            content = message.get("content")

            if not content:
                print(
                    "[AI] Empty message content:",
                    json.dumps(data)[:1000],
                )

                return json.dumps({
                    "error": "Empty AI content",
                })

            return content

    except httpx.TimeoutException:
        print("[AI] Groq timeout")

        return json.dumps({
            "error": "AI request timeout",
        })

    except httpx.RequestError as e:
        print(
            f"[AI] Groq request error: {e}"
        )

        return json.dumps({
            "error": "AI connection error",
        })

    except Exception as e:
        print(
            f"[AI] Unexpected error: {e}"
        )

        return json.dumps({
            "error": "Unexpected AI error",
        })


# ============================================================
# NORMALIZATION
# ============================================================

def normalize_variants(result) -> list:
    """
    Приводит разные варианты ответа AI
    к единому массиву variants.

    ВАЖНО:
    Нормализация НЕ исправляет содержание вопроса.
    Она только приводит структуру к удобному виду.
    """

    variants = []

    if isinstance(result, dict):

        if "variants" in result:

            value = result["variants"]

            if (
                isinstance(value, dict)
                and "questions" in value
            ):
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

        # ----------------------------------------------------
        # Difficulty
        # ----------------------------------------------------

        difficulty = variant.get("difficulty")

        if difficulty not in {
            "easy",
            "medium",
            "hard",
        }:

            variant["difficulty"] = (
                difficulties[i]
                if i < len(difficulties)
                else "medium"
            )

        # ----------------------------------------------------
        # Correct answer
        # ----------------------------------------------------

        if "correctAnswer" not in variant:

            # CHOICE
            if (
                "options" in variant
                and "correct" in variant
            ):

                index = variant["correct"]

                if (
                    isinstance(index, int)
                    and not isinstance(index, bool)
                    and 0 <= index < len(
                        variant["options"]
                    )
                ):

                    variant["correctAnswer"] = (
                        variant["options"][index]
                    )

                else:
                    variant["correctAnswer"] = ""

            # TEXT / CLOSE
            elif "answer" in variant:

                variant["correctAnswer"] = (
                    variant["answer"]
                )

            else:

                variant["correctAnswer"] = ""

      
    return variants


# ============================================================
# JSON CLEANING
# ============================================================

def clean_json(raw: str) -> str:
    """
    Убирает markdown-обёртку:

    ```json
    {...}
    ```

    Также пытается аккуратно найти JSON,
    если модель добавила лишний текст.
    """

    if not isinstance(raw, str):
        return raw

    cleaned = raw.strip()

    # --------------------------------------------------------
    # Markdown code fence
    # --------------------------------------------------------

    if cleaned.startswith("```"):

        lines = cleaned.split("\n")

        if (
            lines
            and lines[0].strip().startswith("```")
        ):
            lines = lines[1:]

        if (
            lines
            and lines[-1].strip().startswith("```")
        ):
            lines = lines[:-1]

        cleaned = "\n".join(lines).strip()

    # --------------------------------------------------------
    # Иногда модель пишет:
    #
    # Вот JSON:
    # {...}
    #
    # Берём содержимое от первой {/[ до последней }/]
    # --------------------------------------------------------

    if not (
        cleaned.startswith("{")
        or cleaned.startswith("[")
    ):

        object_start = cleaned.find("{")
        array_start = cleaned.find("[")

        starts = [
            x
            for x in (
                object_start,
                array_start,
            )
            if x >= 0
        ]

        if starts:
            start = min(starts)

            object_end = cleaned.rfind("}")
            array_end = cleaned.rfind("]")

            end = max(
                object_end,
                array_end,
            )

            if end > start:
                cleaned = cleaned[
                    start:end + 1
                ]

    return cleaned.strip()


# ============================================================
# SAFE JSON PARSE
# ============================================================

def parse_ai_json(raw: str):
    """
    Единая безопасная точка парсинга AI JSON.
    """

    cleaned = clean_json(raw)

    try:
        return json.loads(cleaned)

    except json.JSONDecodeError as e:

        print(
            "[AI] JSON parse error:",
            str(e),
        )

        print(
            "[AI] Raw response:",
            raw[:2000],
        )

        raise


# ============================================================
# VALIDATION HELPERS
# ============================================================

def validate_question_variants(
    variants: list,
    expected_count: int = 3,
):
    """
    Проверяет варианты через обычный Python validator.

    ВАЖНО:
    Это НЕ AI-запрос.

    Поэтому:
    - денег не тратит;
    - лимит AI не увеличивает;
    - задержка минимальная.
    """

    validation = validate_variants(
        variants,
        expected_count=expected_count,
    )

    if not validation.get("valid"):

        print(
            "[AI VALIDATION] Invalid variants:",
            validation.get("error"),
        )

        return {
            "valid": False,
            "error": validation.get(
                "error",
                "Invalid AI output",
            ),
        }

    return {
        "valid": True,
        "variants": validation.get(
            "variants",
            variants,
        ),
    }


def validate_full_quiz(result, expected_count: int):
    """
    Проверяет полный сгенерированный квиз.

    validate_quiz должен заниматься:
    - количеством вопросов;
    - типами;
    - обязательными полями;
    - индексами correct;
    - options;
    - pairs;
    - correctAnswer;
    - difficulty;
    - структурой JSON.

    Сам validator НЕ использует AI.
    """

    validation = validate_quiz(result, expected_count)

    if not validation.get("valid"):

        print(
            "[AI VALIDATION] Invalid quiz:",
            validation.get("error"),
        )

        return {
            "valid": False,
            "error": validation.get(
                "error",
                "Invalid AI quiz",
            ),
        }

    return {
        "valid": True,
        "quiz": validation.get(
            "quiz",
            result,
        ),
    }


# ============================================================
# AI LIMITS
# ============================================================

def get_today_ai_count(
    user_id: str,
) -> int:

    today = datetime.utcnow().strftime(
        "%Y-%m-%d"
    )

    res = (
        supabase
        .table("ai_usage")
        .select(
            "id",
            count="exact",
        )
        .eq(
            "user_id",
            user_id,
        )
        .gte(
            "created_at",
            today,
        )
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

    supabase.table(
        "ai_usage"
    ).insert({
        "user_id": user_id,
        "request_type": request_type,
    }).execute()


def check_ai_limit(user):

    if not user:
        return

    role = user.get(
        "role",
        "user",
    )

    if role == "admin":
        return

    plan = user.get(
        "plan",
        "free",
    )

    limits = {
        "free": 10,
        "premium": 100,
    }

    daily_limit = limits.get(
        plan,
        10,
    )

    count = get_today_ai_count(
        user["id"]
    )

    if count >= daily_limit:

        raise HTTPException(
            status_code=429,
            detail=(
                "Лимит AI-запросов исчерпан "
                f"({daily_limit}/день). "
                "Повысьте тариф до Premium."
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

    difficulty: Optional[str] = "mixed"


class ImproveQuestionInput(BaseModel):

    currentText: str

    format: str = "quiz-choice"

    topic: Optional[str] = None

    wishes: Optional[str] = None

    reroll: Optional[bool] = None

    difficulty: Optional[str] = "mixed"


class GenerateQuizInput(BaseModel):

    topic: Optional[str] = None

    count: Optional[int] = 10

    difficulty: Optional[str] = "mixed"

    wishes: Optional[str] = None


class GenerateJeopardyCategoriesInput(BaseModel):

    topic: Optional[str] = None

    wishes: Optional[str] = None


class GenerateJeopardyQuestionsInput(BaseModel):

    category: str

    emptySlots: List[int] = [
        100,
        200,
        300,
        400,
        500,
    ]

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

    # --------------------------------------------------------
    # Формат имеет приоритет над type
    # --------------------------------------------------------

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
    # IMPROVE EXISTING QUESTION
    # --------------------------------------------------------

    if (
        input.currentText
        and input.currentText.strip()
    ):

        prompt = improve_question_prompt(
            current_text=input.currentText,
            format_type=(
                input.format
                or input.type
                or "quiz-choice"
            ),
            topic=input.topic,
            wishes=input.wishes,
            difficulty=(
                input.difficulty
                or "mixed"
            ),
        )

        raw = await call_openai(prompt)

        if (
            not raw
            or not raw.strip()
        ):
            return {
                "error": (
                    "Empty response from AI"
                ),
            }

        try:

            result = parse_ai_json(raw)

            variants = normalize_variants(
                result
            )

            validation = (
                validate_question_variants(
                    variants,
                    expected_count=3,
                )
            )

            if not validation["valid"]:

                return {
                    "error": (
                        "AI вернул "
                        "некорректные варианты"
                    ),
                    "details": validation[
                        "error"
                    ],
                }

            return {
                "variants": validation[
                    "variants"
                ],
            }

        except json.JSONDecodeError:

            return {
                "error": "Invalid JSON",
                "raw": raw[:1000],
            }

    # --------------------------------------------------------
    # NEW QUESTION
    # --------------------------------------------------------

    prompt = generate_question_prompt(
        topic=(
            input.topic
            or "общая эрудиция"
        ),
        question_type=qtype,
        difficulty=(
            input.difficulty
            or "mixed"
        ),
        wishes=input.wishes,
        count=3,
    )

    raw = await call_openai(prompt)

    if (
        not raw
        or not raw.strip()
    ):
        return {
            "error": (
                "Empty response from AI"
            ),
        }

    try:

        result = parse_ai_json(raw)

        variants = normalize_variants(
            result
        )

        validation = (
            validate_question_variants(
                variants,
                expected_count=3,
            )
        )

        if not validation["valid"]:

            return {
                "error": (
                    "AI вернул "
                    "некорректные варианты"
                ),
                "details": validation[
                    "error"
                ],
            }

        return {
            "variants": validation[
                "variants"
            ],
        }

    except json.JSONDecodeError:

        return {
            "error": "Invalid JSON",
            "raw": raw[:1000],
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
        difficulty=(
            input.difficulty
            or "mixed"
        ),
    )

    raw = await call_openai(prompt)

    if (
        not raw
        or not raw.strip()
    ):
        return {
            "error": (
                "Empty response from AI"
            ),
        }

    try:

        result = parse_ai_json(raw)

        variants = normalize_variants(
            result
        )

        validation = (
            validate_question_variants(
                variants,
                expected_count=3,
            )
        )

        if not validation["valid"]:

            return {
                "error": (
                    "AI вернул "
                    "некорректные варианты"
                ),
                "details": validation[
                    "error"
                ],
            }

        return {
            "variants": validation[
                "variants"
            ],
        }

    except json.JSONDecodeError:

        return {
            "error": "Invalid JSON",
            "raw": raw[:1000],
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

    # --------------------------------------------------------
    # Count
    # --------------------------------------------------------

    count = min(
        20,
        max(
            5,
            input.count or 10,
        ),
    )

    # --------------------------------------------------------
    # Difficulty
    # --------------------------------------------------------

    difficulty = (
        input.difficulty
        or "mixed"
    )

    if difficulty not in {
        "easy",
        "medium",
        "hard",
        "mixed",
    }:

        difficulty = "mixed"

    # --------------------------------------------------------
    # Prompt
    # --------------------------------------------------------

    prompt = generate_quiz_prompt(
        topic=(
            input.topic
            or "Удивительные открытия"
        ),
        count=count,
        difficulty=difficulty,
        wishes=input.wishes,
    )

    raw = await call_openai(prompt)

    if (
        not raw
        or not raw.strip()
    ):

        return {
            "error": (
                "Empty response from AI"
            ),
        }

    try:

        result = parse_ai_json(raw)

        # ----------------------------------------------------
        # BACKEND VALIDATION
        # ----------------------------------------------------

        validation = validate_full_quiz(
            result, count
        )

        if not validation["valid"]:

            return {
                "error": (
                    "AI вернул "
                    "некорректный квиз"
                ),
                "details": validation[
                    "error"
                ],
            }

        return validation["quiz"]

    except json.JSONDecodeError:

        return {
            "error": "Invalid JSON",
            "raw": raw[:1500],
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

    prompt = (
        generate_jeopardy_categories_prompt(
            topic=(
                input.topic
                or "Удивительные явления"
            ),
            wishes=input.wishes,
        )
    )

    raw = await call_openai(prompt)

    if (
        not raw
        or not raw.strip()
    ):

        return {
            "error": (
                "Empty response from AI"
            ),
        }

    try:

        return parse_ai_json(raw)

    except json.JSONDecodeError:

        return {
            "error": "Invalid JSON",
            "raw": raw[:1000],
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

    prompt = (
        generate_jeopardy_questions_prompt(
            category=input.category,
            empty_slots=input.emptySlots,
            wishes=input.wishes,
        )
    )

    raw = await call_openai(prompt)

    if (
        not raw
        or not raw.strip()
    ):

        return {
            "error": (
                "Empty response from AI"
            ),
        }

    try:

        return parse_ai_json(raw)

    except json.JSONDecodeError:

        return {
            "error": "Invalid JSON",
            "raw": raw[:1000],
        }


# ============================================================
# GENERATE FROM FILE
# ============================================================

@router.post(
    "/generate-from-file"
)
@limiter.limit("5/minute")
async def generate_from_file(
    request: Request,
    file: UploadFile = File(...),
    count: int = Form(10),
    difficulty: str = Form("mixed"),
    wishes: str = Form(""),
    user=Depends(get_current_user),
):

    check_ai_limit(user)

    # --------------------------------------------------------
    # FILE SIZE
    # --------------------------------------------------------

    content = await file.read()

    if len(content) > 10 * 1024 * 1024:

        return {
            "error": (
                "Файл слишком большой. "
                "Максимальный размер: 10 МБ."
            ),
        }

    # --------------------------------------------------------
    # EXTENSION
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
                "Поддерживаются: "
                "PDF, DOCX, TXT, MD."
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
        and file.content_type
        not in allowed_mime
    ):

        return {
            "error": (
                "Неподдерживаемый тип файла: "
                f"{file.content_type}. "
                "Разрешены: "
                "PDF, DOCX, TXT, MD."
            ),
        }

    # --------------------------------------------------------
    # EXTRACT TEXT
    # --------------------------------------------------------

    text = ""

    try:

        if filename.endswith(".pdf"):

            with pdfplumber.open(
                io.BytesIO(content)
            ) as pdf:

                pages = []

                for page in pdf.pages:

                    page_text = (
                        page.extract_text()
                        or ""
                    )

                    if page_text.strip():
                        pages.append(
                            page_text
                        )

                text = "\n".join(pages)

        elif filename.endswith(".docx"):

            doc = Document(
                io.BytesIO(content)
            )

            text = "\n".join(
                paragraph.text
                for paragraph
                in doc.paragraphs
                if paragraph.text.strip()
            )

        elif filename.endswith(
            (".txt", ".md")
        ):

            text = content.decode(
                "utf-8"
            )

    except UnicodeDecodeError:

        return {
            "error": (
                "Не удалось прочитать файл "
                "в кодировке UTF-8."
            ),
        }

    except Exception as e:

        print(
            "[AI FILE] Extraction error:",
            str(e),
        )

        return {
            "error": (
                "Ошибка чтения файла: "
                f"{str(e)}"
            ),
        }

    # --------------------------------------------------------
    # EMPTY TEXT
    # --------------------------------------------------------

    if not text.strip():

        return {
            "error": (
                "Не удалось извлечь текст."
            ),
        }

    # --------------------------------------------------------
    # TEXT LIMIT
    # --------------------------------------------------------
    #
    # Пока оставляем 5000 символов.
    #
    # Это именно ограничение текста,
    # который отправляется модели.
    #
    # Оно НЕ связано с AI usage limit.
    # --------------------------------------------------------

    text = text[:5000]

    # --------------------------------------------------------
    # DIFFICULTY
    # --------------------------------------------------------

    if difficulty not in {
        "easy",
        "medium",
        "hard",
        "mixed",
    }:

        difficulty = "mixed"

    # --------------------------------------------------------
    # COUNT
    # --------------------------------------------------------

    count = min(
        20,
        max(
            5,
            count,
        ),
    )

    # --------------------------------------------------------
    # PROMPT
    # --------------------------------------------------------

    prompt = generate_quiz_prompt(
        topic=text,
        count=count,
        difficulty=difficulty,
        wishes=wishes,
    )

    raw = await call_openai(prompt)

    if (
        not raw
        or not raw.strip()
    ):

        return {
            "error": (
                "AI не ответил"
            ),
        }

    try:

        result = parse_ai_json(raw)

        # ----------------------------------------------------
        # BACKEND VALIDATION
        # ----------------------------------------------------

        validation = validate_full_quiz(
            result, count
        )

        if not validation["valid"]:

            print(
                "[AI FILE VALIDATION]",
                validation["error"],
            )

            return {
                "error": (
                    "AI вернул "
                    "некорректный квиз"
                ),
                "details": validation[
                    "error"
                ],
            }

        return validation["quiz"]

    except json.JSONDecodeError:

        return {
            "error": "Ошибка парсинга",
            "raw": raw[:1500],
        }