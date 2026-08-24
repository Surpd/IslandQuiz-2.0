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
)
from fastapi.responses import JSONResponse
from pydantic import BaseModel, StrictInt
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
    validate_jeopardy_categories,
    validate_jeopardy_questions,
    validate_quiz,
    validate_variants,
)

from limiter import limiter
from database import supabase
from services.role_limits import get_user_limit


router = APIRouter(prefix="/api/ai", tags=["ai"])
DB_ERROR_DETAIL = "Ошибка базы данных"


def _db_response(query):
    try:
        response = query.execute()
    except Exception as exc:
        from fastapi import HTTPException
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL) from exc
    if response is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL)
    return response


def _db_count(query) -> int:
    from fastapi import HTTPException
    response = _db_response(query)
    count = getattr(response, "count", None)
    if isinstance(count, int):
        return count
    rows = getattr(response, "data", None)
    if rows is None:
        return 0
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL)
    return len(rows)


def _db_insert(query):
    return _db_response(query)


# ============================================================
# CONFIG
# ============================================================

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

GROQ_URL = (
    "https://api.groq.com/openai/v1/chat/completions"
)

AI_MODEL = os.getenv(
    "GROQ_MODEL",
    "qwen/qwen3.6-27b",
)

AI_TIMEOUT = 60.0


# ============================================================
# AI CLIENT
# ============================================================

async def call_openai(
    prompt: str,
    model: str | None = None,
    temperature: float = 0.7,
    *,
    user_id: str | None = None,
    request_type: str = "ai_request",
) -> str:
    """
    Несмотря на название, используется Groq API
    через OpenAI-compatible endpoint.

    Функция возвращает:
    - текст ответа AI;
    - JSON-строку с ошибкой, если Groq ответил ошибкой.

    Никаких повторных AI-запросов здесь нет.
    """

    selected_model = model or AI_MODEL

    def finish(
        raw: str,
        *,
        success: bool,
        error: str | None = None,
        usage: dict | None = None,
    ) -> str:
        from services.ai_telemetry import record_ai_request

        usage = usage if isinstance(usage, dict) else {}
        record_ai_request(
            user_id=user_id,
            request_type=request_type,
            model=selected_model,
            success=success,
            error=error,
            prompt_tokens=usage.get("prompt_tokens") if isinstance(usage.get("prompt_tokens"), int) else None,
            completion_tokens=usage.get("completion_tokens") if isinstance(usage.get("completion_tokens"), int) else None,
        )
        return raw

    if not OPENAI_API_KEY:
        return finish(json.dumps({
            "mock": True,
            "prompt": prompt[:100],
        }), success=False, error="mock_ai_response")

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
                    "model": selected_model,
                    "messages": [
                        {
                            "role": "user",
                            "content": prompt,
                        }
                    ],
                    "temperature": temperature,
                    "response_format": {
                        "type": "json_object",
                    },
                    "reasoning_effort": "none",
                },
            )

            # ВАЖНО:
            # не пытаемся молча парсить ошибку Groq
            # как обычный AI JSON.
            if response.status_code >= 400:
                provider_code = "unknown"
                try:
                    provider_error = response.json().get("error", {})
                    if isinstance(provider_error, dict):
                        provider_code = str(
                            provider_error.get("code", "unknown")
                        )
                except Exception:
                    pass

                if provider_code == "model_not_found":
                    print(
                        "[AI] Groq model unavailable:",
                        selected_model,
                    )
                    return finish(json.dumps({
                        "error": (
                            "AI provider configuration error: "
                            "configured Groq model is unavailable."
                        ),
                        "code": provider_code,
                    }), success=False, error=provider_code)

                print(
                    "[AI] Groq HTTP error:",
                    response.status_code,
                    "code:",
                    provider_code,
                )

                return finish(json.dumps({
                    "error": "Groq API error",
                    "status_code": response.status_code,
                    "code": "ai_provider_error",
                }), success=False, error="ai_provider_error")

            try:
                data = response.json()

            except Exception:
                print("[AI] Groq returned invalid JSON")

                return finish(json.dumps({
                    "error": "Invalid response from Groq",
                    "code": "invalid_provider_response",
                }), success=False, error="invalid_provider_response")

            if (
                "choices" not in data
                or not data["choices"]
            ):
                print(
                    "[AI] Bad response keys:",
                    sorted(data.keys()) if isinstance(data, dict) else [],
                )

                return finish(json.dumps({
                    "error": "Empty response from AI",
                    "code": "empty_ai_response",
                }), success=False, error="empty_ai_response")

            message = data["choices"][0].get(
                "message",
                {},
            )

            content = message.get("content")

            if (
                not isinstance(content, str)
                or not content.strip()
            ):
                print(
                    "[AI] Empty message content:",
                    ai_output_diagnostic(content),
                )

                return finish(json.dumps({
                    "error": "AI returned empty content",
                    "diagnostic": ai_output_diagnostic(content),
                    "code": "empty_ai_response",
                }), success=False, error="empty_ai_response")

            try:
                json.loads(content)
                content_success = True
                content_error = None
            except json.JSONDecodeError:
                content_success = False
                content_error = "invalid_ai_json"
            return finish(content, success=content_success, error=content_error, usage=data.get("usage"))

    except httpx.TimeoutException:
        print("[AI] Groq timeout")

        return finish(json.dumps({
            "error": "AI request timeout",
            "code": "ai_provider_timeout",
        }), success=False, error="ai_provider_timeout")

    except httpx.RequestError:
        print("[AI] Groq request error")

        return finish(json.dumps({
            "error": "AI connection error",
            "code": "ai_provider_connection_error",
        }), success=False, error="ai_provider_connection_error")

    except Exception:
        print("[AI] Unexpected error")

        return finish(json.dumps({
            "error": "Unexpected AI error",
            "code": "ai_provider_error",
        }), success=False, error="ai_provider_error")


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

        diagnostic = ai_output_diagnostic(raw)
        setattr(e, "ai_diagnostic", diagnostic)

        print(
            "[AI] JSON parse error:",
            str(e),
            "diagnostic:",
            diagnostic,
        )

        raise


def ai_output_diagnostic(raw) -> dict:
    if not isinstance(raw, str):
        return {
            "output_type": type(raw).__name__,
            "length": 0,
            "leading_shape": "non_string",
        }

    stripped = raw.lstrip()
    if not stripped:
        leading_shape = "whitespace"
    elif stripped.startswith("```"):
        leading_shape = "markdown_fence"
    elif stripped.startswith("{"):
        leading_shape = "json_object"
    elif stripped.startswith("["):
        leading_shape = "json_array"
    else:
        leading_shape = "non_json_text"

    return {
        "output_type": "string",
        "length": len(raw),
        "trimmed_length": len(raw.strip()),
        "leading_shape": leading_shape,
    }


def ai_failure(
    error: str,
    diagnostic: dict | None = None,
    code: str | None = None,
) -> JSONResponse:
    content = {"error": error}
    if code:
        content["code"] = code
    if diagnostic:
        content["diagnostic"] = diagnostic
    return JSONResponse(status_code=502, content=content)


def ai_client_error(error: str, code: str, status_code: int = 400) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": error, "code": code})


def ai_error_response(result: dict) -> JSONResponse:
    code = result.get("code")
    diagnostic = result.get("diagnostic")
    return ai_failure(
        result["error"],
        diagnostic if isinstance(diagnostic, dict) else None,
        code if isinstance(code, str) else "ai_provider_error",
    )


def invalid_ai_response(error: str) -> JSONResponse:
    return ai_failure(
        "AI returned an invalid response",
        code="invalid_ai_response",
        diagnostic={"validation_error": error},
    )


def is_ai_error(result) -> bool:
    return (
        isinstance(result, dict)
        and isinstance(result.get("error"), str)
        and bool(result["error"].strip())
    )


# ============================================================
# AI LIMITS
# ============================================================

def consume_ai_quota(
    user_id: str,
    request_type: str,
    daily_limit: int,
) -> bool:
    """Reserve one quota unit through the atomic PostgreSQL RPC."""

    from fastapi import HTTPException

    response = _db_response(
        supabase.rpc("consume_ai_quota", {
            "p_user_id": user_id,
            "p_request_type": request_type,
            "p_daily_limit": daily_limit,
        })
    )
    data = getattr(response, "data", None)
    if isinstance(data, bool):
        return data
    if isinstance(data, list) and len(data) == 1 and isinstance(data[0], dict):
        value = next(iter(data[0].values()), None)
        if isinstance(value, bool):
            return value
    raise HTTPException(status_code=502, detail=DB_ERROR_DETAIL)


def check_ai_limit(user, request_type: str = "ai_request"):

    if not user:
        return

    limit_key = (
        "ai_file_generations_per_day"
        if request_type == "ai_file_request"
        else "ai_generations_per_day"
    )
    daily_limit = get_user_limit(user, limit_key)
    if daily_limit is None:
        return None

    if not consume_ai_quota(
        user["id"],
        request_type,
        daily_limit,
    ):

        return ai_client_error(
            "Лимит AI-запросов исчерпан "
            f"({daily_limit}/день).",
            "ai_daily_limit_exceeded",
            429,
        )

    return None


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

    type_distribution: Optional[dict[str, StrictInt]] = None


QUIZ_TYPE_WEIGHTS = {
    "choice": 6,
    "text": 2,
    "bool": 1,
    "matching": 1,
    "close": 0,
    "ordering": 0,
}


def get_quiz_type_distribution(count: int) -> dict[str, int]:
    exact = {qtype: count * weight for qtype, weight in QUIZ_TYPE_WEIGHTS.items()}
    distribution = {qtype: amount // 10 for qtype, amount in exact.items()}
    remaining = count - sum(distribution.values())
    ranked = sorted(
        QUIZ_TYPE_WEIGHTS,
        key=lambda qtype: (exact[qtype] % 10, QUIZ_TYPE_WEIGHTS[qtype]),
        reverse=True,
    )
    for qtype in ranked[:remaining]:
        distribution[qtype] += 1
    return distribution


def normalize_quiz_type_distribution(
    distribution: object,
    count: int,
) -> tuple[dict[str, int] | None, str | None]:
    if distribution is None:
        return None, None
    if not isinstance(distribution, dict) or set(distribution) != set(QUIZ_TYPE_WEIGHTS):
        return None, "Укажите количество для каждого поддерживаемого типа вопроса."
    if any(
        not isinstance(amount, int) or isinstance(amount, bool) or amount < 0
        for amount in distribution.values()
    ):
        return None, "Количество вопросов каждого типа должно быть целым неотрицательным числом."
    if sum(distribution.values()) != count:
        return None, "Сумма вопросов по типам должна совпадать с общим количеством."
    return dict(distribution), None


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

    limit_error = check_ai_limit(user)
    if limit_error:
        return limit_error

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

        raw = await call_openai(
            prompt,
            user_id=user.get("id") if user else None,
            request_type="generate_question",
        )

        if (
            not raw
            or not raw.strip()
        ):
            return ai_failure("Empty response from AI", code="empty_ai_response")

        try:

            result = parse_ai_json(raw)

            if is_ai_error(result):
                return ai_error_response(result)

            variants = normalize_variants(
                result
            )
            validation = validate_variants(variants, expected_count=3)
            if not validation["valid"]:
                return invalid_ai_response(validation["error"])

            return {
                "variants": validation["variants"],
            }

        except json.JSONDecodeError as error:
            return ai_failure(
                "AI returned invalid JSON",
                getattr(error, "ai_diagnostic", None),
                "invalid_ai_json",
            )

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

    raw = await call_openai(
        prompt,
        user_id=user.get("id") if user else None,
        request_type="generate_question",
    )

    if (
        not raw
        or not raw.strip()
    ):
        return ai_failure("Empty response from AI", code="empty_ai_response")

    try:

        result = parse_ai_json(raw)

        if is_ai_error(result):
            return ai_error_response(result)

        variants = normalize_variants(
            result
        )
        validation = validate_variants(variants, expected_count=3)
        if not validation["valid"]:
            return invalid_ai_response(validation["error"])

        return {
            "variants": validation["variants"],
        }

    except json.JSONDecodeError as error:
        return ai_failure(
            "AI returned invalid JSON",
            getattr(error, "ai_diagnostic", None),
            "invalid_ai_json",
        )


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

    limit_error = check_ai_limit(user)
    if limit_error:
        return limit_error

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

    raw = await call_openai(
        prompt,
        user_id=user.get("id") if user else None,
        request_type="improve_question",
    )

    if (
        not raw
        or not raw.strip()
    ):
        return ai_failure("Empty response from AI", code="empty_ai_response")

    try:

        result = parse_ai_json(raw)

        if is_ai_error(result):
            return ai_error_response(result)

        variants = normalize_variants(
            result
        )
        validation = validate_variants(variants, expected_count=3)
        if not validation["valid"]:
            return invalid_ai_response(validation["error"])

        return {
            "variants": validation["variants"],
        }

    except json.JSONDecodeError as error:
        return ai_failure(
            "AI returned invalid JSON",
            getattr(error, "ai_diagnostic", None),
            "invalid_ai_json",
        )


# ============================================================
# GENERATE QUIZ
# ============================================================

@router.get("/quiz-type-distribution/{count}")
async def quiz_type_distribution(
    count: int,
    user=Depends(get_current_user),
):
    if count < 5 or count > 20:
        return ai_client_error("Количество вопросов должно быть от 5 до 20.", "invalid_count")
    return {"distribution": get_quiz_type_distribution(count)}

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

    limit_error = check_ai_limit(user)
    if limit_error:
        return limit_error

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

    type_distribution, distribution_error = normalize_quiz_type_distribution(
        input.type_distribution,
        count,
    )
    if distribution_error:
        return ai_client_error(distribution_error, "invalid_type_distribution")

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
        type_distribution=type_distribution,
    )

    raw = await call_openai(
        prompt,
        user_id=user.get("id") if user else None,
        request_type="generate_quiz",
    )

    if (
        not raw
        or not raw.strip()
    ):
        return ai_failure("Empty response from AI", code="empty_ai_response")

    try:

        result = parse_ai_json(raw)
        if is_ai_error(result):
            return ai_error_response(result)
        validation = validate_quiz(
            result,
            expected_count=count,
            expected_distribution=type_distribution,
        )
        if not validation["valid"] and type_distribution:
            retry_prompt = f"""{prompt}

Предыдущий ответ не прошёл структурную проверку: {validation["error"]}
Сгенерируй квиз заново и верни только JSON-объект. Соблюдай РОВНОЕ распределение
вопросов по типам из задания и проверь количество каждого типа перед ответом.
"""
            retry_raw = await call_openai(
                retry_prompt,
                temperature=0.2,
                user_id=user.get("id") if user else None,
                request_type="generate_quiz_retry",
            )
            if not retry_raw or not retry_raw.strip():
                return ai_failure("Empty response from AI", code="empty_ai_response")
            retry_result = parse_ai_json(retry_raw)
            if is_ai_error(retry_result):
                return ai_error_response(retry_result)
            validation = validate_quiz(
                retry_result,
                expected_count=count,
                expected_distribution=type_distribution,
            )
        if not validation["valid"]:
            return invalid_ai_response(validation["error"])
        return validation["quiz"]

    except json.JSONDecodeError as error:
        return ai_failure(
            "AI returned invalid JSON",
            getattr(error, "ai_diagnostic", None),
            "invalid_ai_json",
        )


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

    limit_error = check_ai_limit(user)
    if limit_error:
        return limit_error

    prompt = (
        generate_jeopardy_categories_prompt(
            topic=(
                input.topic
                or "Удивительные явления"
            ),
            wishes=input.wishes,
        )
    )

    raw = await call_openai(
        prompt,
        user_id=user.get("id") if user else None,
        request_type="generate_jeopardy_categories",
    )

    if (
        not raw
        or not raw.strip()
    ):
        return ai_failure("Empty response from AI", code="empty_ai_response")

    try:

        result = parse_ai_json(raw)
        if is_ai_error(result):
            return ai_error_response(result)
        if not isinstance(result, dict):
            return invalid_ai_response("Jeopardy response must be an object")
        validation = validate_jeopardy_categories(result.get("categories"))
        if not validation["valid"]:
            return invalid_ai_response(validation["error"])
        return {"categories": validation["categories"]}

    except json.JSONDecodeError as error:
        return ai_failure(
            "AI returned invalid JSON",
            getattr(error, "ai_diagnostic", None),
            "invalid_ai_json",
        )


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

    limit_error = check_ai_limit(user)
    if limit_error:
        return limit_error

    prompt = (
        generate_jeopardy_questions_prompt(
            category=input.category,
            empty_slots=input.emptySlots,
            wishes=input.wishes,
        )
    )

    raw = await call_openai(
        prompt,
        user_id=user.get("id") if user else None,
        request_type="generate_jeopardy_questions",
    )

    if (
        not raw
        or not raw.strip()
    ):
        return ai_failure("Empty response from AI", code="empty_ai_response")

    try:

        result = parse_ai_json(raw)
        if is_ai_error(result):
            return ai_error_response(result)
        if not isinstance(result, dict):
            return invalid_ai_response("Jeopardy response must be an object")
        validation = validate_jeopardy_questions(
            result.get("questions"),
            input.emptySlots,
        )
        if not validation["valid"]:
            return invalid_ai_response(validation["error"])
        return {"questions": validation["questions"]}

    except json.JSONDecodeError as error:
        return ai_failure(
            "AI returned invalid JSON",
            getattr(error, "ai_diagnostic", None),
            "invalid_ai_json",
        )


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
    type_distribution: str = Form(""),
    user=Depends(get_current_user),
):

    limit_error = check_ai_limit(user, "ai_file_request")
    if limit_error:
        return limit_error

    # --------------------------------------------------------
    # FILE SIZE
    # --------------------------------------------------------

    content = await file.read()

    max_file_size = get_user_limit(user, "ai_upload_bytes")
    if max_file_size is not None and len(content) > max_file_size:
        return ai_client_error(
            "Файл слишком большой. Превышен допустимый размер для AI-генерации.",
            "file_too_large",
        )

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
        return ai_client_error(
            "Неподдерживаемый формат. Поддерживаются: PDF, DOCX, TXT, MD.",
            "unsupported_file_format",
        )

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
        return ai_client_error(
            "Неподдерживаемый тип файла. Разрешены: PDF, DOCX, TXT, MD.",
            "unsupported_file_type",
        )

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
        return ai_client_error(
            "Не удалось прочитать файл в кодировке UTF-8.",
            "file_decode_error",
        )

    except Exception as e:

        print(
            "[AI FILE] Extraction error:",
            str(e),
        )

        return ai_client_error("Не удалось прочитать файл.", "file_extraction_error")

    # --------------------------------------------------------
    # EMPTY TEXT
    # --------------------------------------------------------

    if not text.strip():
        return ai_client_error("Не удалось извлечь текст.", "empty_file_text")

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

    parsed_distribution = None
    if type_distribution:
        try:
            parsed_distribution = json.loads(type_distribution)
        except json.JSONDecodeError:
            return ai_client_error("Некорректное распределение типов.", "invalid_type_distribution")
    normalized_distribution, distribution_error = normalize_quiz_type_distribution(
        parsed_distribution,
        count,
    )
    if distribution_error:
        return ai_client_error(distribution_error, "invalid_type_distribution")

    # --------------------------------------------------------
    # PROMPT
    # --------------------------------------------------------

    prompt = generate_quiz_prompt(
        topic=text,
        count=count,
        difficulty=difficulty,
        wishes=wishes,
        type_distribution=normalized_distribution,
    )

    raw = await call_openai(
        prompt,
        user_id=user.get("id") if user else None,
        request_type="generate_from_file",
    )

    if (
        not raw
        or not raw.strip()
    ):
        return ai_failure("Empty response from AI", code="empty_ai_response")

    try:

        result = parse_ai_json(raw)
        if is_ai_error(result):
            return ai_error_response(result)
        validation = validate_quiz(
            result,
            expected_count=count,
            expected_distribution=normalized_distribution,
        )
        if not validation["valid"] and normalized_distribution:
            retry_prompt = f"""{prompt}

Предыдущий ответ не прошёл структурную проверку: {validation["error"]}
Сгенерируй квиз заново и верни только JSON-объект. Соблюдай РОВНОЕ распределение
вопросов по типам из задания и проверь количество каждого типа перед ответом.
"""
            retry_raw = await call_openai(
                retry_prompt,
                temperature=0.2,
                user_id=user.get("id") if user else None,
                request_type="generate_from_file_retry",
            )
            if not retry_raw or not retry_raw.strip():
                return ai_failure("Empty response from AI", code="empty_ai_response")
            retry_result = parse_ai_json(retry_raw)
            if is_ai_error(retry_result):
                return ai_error_response(retry_result)
            validation = validate_quiz(
                retry_result,
                expected_count=count,
                expected_distribution=normalized_distribution,
            )
        if not validation["valid"]:
            return invalid_ai_response(validation["error"])
        return validation["quiz"]

    except json.JSONDecodeError as error:
        return ai_failure(
            "AI returned invalid JSON",
            getattr(error, "ai_diagnostic", None),
            "invalid_ai_json",
        )
