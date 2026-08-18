import re
from typing import Any


ALLOWED_TYPES = {
    "choice",
    "bool",
    "text",
    "matching",
    "close",
    "ordering",
}

ALLOWED_DIFFICULTIES = {
    "easy",
    "medium",
    "hard",
}


TYPE_ALIASES = {
    "multiple-choice": "choice",
    "multiple_choice": "choice",
    "single-choice": "choice",
    "single_choice": "choice",
    "boolean": "bool",
    "true-false": "bool",
    "true_false": "bool",
    "open": "text",
    "short-answer": "text",
    "short_answer": "text",
    "match": "matching",
    "fill-in-the-blank": "close",
    "fill_in_the_blank": "close",
    "order": "ordering",
}


def _normalized_type(value: Any) -> str | None:
    if not isinstance(value, str):
        return None

    normalized = value.strip().lower()

    if normalized in ALLOWED_TYPES:
        return normalized

    return TYPE_ALIASES.get(normalized)


def _first_string(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _option_index(options: Any, value: Any) -> int | None:
    if not isinstance(options, list):
        return None

    if isinstance(value, int) and not isinstance(value, bool):
        return value

    if not isinstance(value, str):
        return None

    normalized = value.strip()
    if normalized.isdigit():
        return int(normalized)

    for index, option in enumerate(options):
        if (
            isinstance(option, str)
            and option.strip().casefold() == normalized.casefold()
        ):
            return index

    return None


def _bool_value(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized == "true":
            return True
        if normalized == "false":
            return False

    return None


def normalize_question(
    question: Any,
    expected_type: str | None = None,
) -> Any:
    """Maps known AI aliases to the existing strict quiz-question schema."""

    if not isinstance(question, dict):
        return question

    normalized = dict(question)
    question_text = _first_string(
        normalized.get("question"),
        normalized.get("questionText"),
        normalized.get("text"),
        normalized.get("q"),
    )
    if question_text:
        normalized["question"] = question_text

    if "options" not in normalized:
        options = normalized.get("answers", normalized.get("variants"))
        if isinstance(options, list):
            normalized["options"] = options

    if "pairs" not in normalized:
        pairs = normalized.get("matchingPairs", normalized.get("matches"))
        if isinstance(pairs, list):
            normalized["pairs"] = pairs

    qtype = _normalized_type(expected_type) or _normalized_type(
        normalized.get("type")
    )

    if qtype is None:
        if isinstance(normalized.get("pairs"), list):
            qtype = "matching"
        elif _bool_value(
            normalized.get("correct")
        ) is not None or _bool_value(
            _first_string(
                normalized.get("correctAnswer"),
                normalized.get("correct_answer"),
                normalized.get("answer"),
            )
        ) is not None:
            qtype = "bool"
        elif isinstance(normalized.get("options"), list):
            qtype = "choice"
        elif _first_string(
            normalized.get("correctAnswer"),
            normalized.get("correct_answer"),
            normalized.get("answer"),
        ):
            qtype = "text"

    if qtype is None:
        return normalized

    normalized["type"] = qtype

    if qtype == "choice":
        options = normalized.get("options")
        correct = _option_index(options, normalized.get("correct"))
        if correct is None:
            correct = _option_index(
                options,
                _first_string(
                    normalized.get("correctAnswer"),
                    normalized.get("correct_answer"),
                    normalized.get("answer"),
                ),
            )
        if correct is not None:
            normalized["correct"] = correct
        normalized.pop("answer", None)
        normalized.pop("correct_answer", None)
        normalized.pop("correctAnswer", None)

    elif qtype == "bool":
        correct = _bool_value(normalized.get("correct"))
        if correct is None:
            correct = _bool_value(
                _first_string(
                    normalized.get("correctAnswer"),
                    normalized.get("correct_answer"),
                    normalized.get("answer"),
                )
            )
        if correct is not None:
            normalized["correct"] = correct
        for field in ("options", "answers", "variants", "answer", "correct_answer", "correctAnswer"):
            normalized.pop(field, None)

    elif qtype in {"text", "close"}:
        answer = _first_string(
            normalized.get("correctAnswer"),
            normalized.get("correct_answer"),
            normalized.get("answer"),
            normalized.get("correct") if isinstance(normalized.get("correct"), str) else None,
        )
        if answer:
            normalized["correctAnswer"] = answer
        for field in ("options", "answers", "variants", "pairs", "matchingPairs", "matches", "answer", "correct_answer", "correct"):
            normalized.pop(field, None)

    elif qtype == "matching":
        for field in ("options", "answers", "variants", "correct", "correctAnswer", "correct_answer", "answer"):
            normalized.pop(field, None)

    elif qtype == "ordering":
        for field in ("correct", "correctAnswer", "correct_answer", "answer", "pairs", "matchingPairs", "matches"):
            normalized.pop(field, None)

    return normalized


def normalize_quiz(result: Any) -> Any:
    """Unwraps supported quiz envelopes and normalizes their questions."""

    if not isinstance(result, dict):
        return result

    quiz = result
    for key in ("quiz", "data"):
        candidate = quiz.get(key)
        if isinstance(candidate, dict) and (
            "questions" in candidate or "variants" in candidate
        ):
            quiz = candidate
            break

    normalized = dict(quiz)
    title = _first_string(normalized.get("title"), normalized.get("name"))
    if title:
        normalized["title"] = title

    questions = normalized.get("questions", normalized.get("variants"))
    if isinstance(questions, list):
        normalized["questions"] = [normalize_question(question) for question in questions]

    return normalized


def describe_ai_shape(value: Any) -> dict:
    """Returns safe diagnostic metadata without question text or AI prompt content."""

    if not isinstance(value, dict):
        return {"kind": type(value).__name__}

    summary: dict[str, Any] = {
        "kind": "object",
        "keys": sorted(str(key) for key in value.keys())[:12],
    }

    for key in ("questions", "variants"):
        items = value.get(key)
        if not isinstance(items, list):
            continue
        summary[f"{key}_count"] = len(items)
        if items and isinstance(items[0], dict):
            summary[f"first_{key}_keys"] = sorted(
                str(item_key) for item_key in items[0].keys()
            )[:12]
            item_type = items[0].get("type")
            if isinstance(item_type, str):
                summary[f"first_{key}_type"] = item_type
        break

    return summary


def _error(message: str) -> dict:
    return {
        "valid": False,
        "error": message,
    }


def validate_question(question: Any) -> dict:
    """
    Проверяет один вопрос после ответа AI.

    ВАЖНО:
    Этот валидатор проверяет структуру и логические
    ограничения формата, но НЕ проверяет историческую
    / научную истинность фактов.
    """

    if not isinstance(question, dict):
        return _error("Question must be an object")

    qtype = question.get("type")

    if qtype not in ALLOWED_TYPES:
        return _error(
            f"Unsupported question type: {qtype}"
        )

    difficulty = question.get("difficulty")

    if difficulty not in ALLOWED_DIFFICULTIES:
        return _error(
            f"Invalid difficulty: {difficulty}"
        )

    text = question.get("question")

    if not isinstance(text, str) or not text.strip():
        return _error("Question text is empty")

    # --------------------------------------------------------
    # CHOICE
    # --------------------------------------------------------

    if qtype == "choice":
        options = question.get("options")
        correct = question.get("correct")

        if not isinstance(options, list):
            return _error(
                "Choice question must have options list"
            )

        if len(options) != 4:
            return _error(
                "Choice question must have exactly 4 options"
            )

        if not all(
            isinstance(option, str) and option.strip()
            for option in options
        ):
            return _error(
                "All choice options must be non-empty strings"
            )

        if not isinstance(correct, int) or isinstance(correct, bool):
            return _error(
                "Choice correct must be an integer"
            )

        if correct < 0 or correct > 3:
            return _error(
                "Choice correct must be between 0 and 3"
            )

        if len(set(
            option.strip().lower()
            for option in options
        )) != 4:
            return _error(
                "Choice options must be unique"
            )

        # Не позволяем AI случайно добавить неправильный
        # correctAnswer, который расходится с correct.
        expected_answer = options[correct]

        if "correctAnswer" in question:
            correct_answer = question["correctAnswer"]

            if correct_answer != expected_answer:
                return _error(
                    "correctAnswer does not match correct index"
                )

        return {
            "valid": True,
            "question": question,
        }

    # --------------------------------------------------------
    # BOOL
    # --------------------------------------------------------

    if qtype == "bool":
        correct = question.get("correct")

        if not isinstance(correct, bool):
            return _error(
                "Bool correct must be true or false"
            )

        if "options" in question:
            return _error(
                "Bool question must not contain options"
            )

        return {
            "valid": True,
            "question": question,
        }

    # --------------------------------------------------------
    # TEXT
    # --------------------------------------------------------

    if qtype == "text":
        answer = question.get("correctAnswer")

        if not isinstance(answer, str):
            return _error(
                "Text question must have correctAnswer"
            )

        if not answer.strip():
            return _error(
                "Text correctAnswer cannot be empty"
            )

        if "options" in question:
            return _error(
                "Text question must not contain options"
            )

        return {
            "valid": True,
            "question": question,
        }

    # --------------------------------------------------------
    # MATCHING
    # --------------------------------------------------------

    if qtype == "matching":
        pairs = question.get("pairs")

        if not isinstance(pairs, list):
            return _error(
                "Matching question must have pairs"
            )

        if len(pairs) < 3:
            return _error(
                "Matching question must have at least 3 pairs"
            )

        for pair in pairs:
            if not isinstance(pair, dict):
                return _error(
                    "Every matching pair must be an object"
                )

            left = pair.get("left")
            right = pair.get("right")

            if not isinstance(left, str) or not left.strip():
                return _error(
                    "Matching left value is empty"
                )

            if not isinstance(right, str) or not right.strip():
                return _error(
                    "Matching right value is empty"
                )

        if "options" in question:
            return _error(
                "Matching question must not contain options"
            )

        if "correct" in question:
            return _error(
                "Matching question must not contain correct"
            )

        return {
            "valid": True,
            "question": question,
        }

    # --------------------------------------------------------
    # CLOSE
    # --------------------------------------------------------

    if qtype == "close":
        answer = question.get("correctAnswer")

        if not isinstance(answer, str):
            return _error(
                "Close question must have correctAnswer"
            )

        if not answer.strip():
            return _error(
                "Close correctAnswer cannot be empty"
            )

        placeholders = re.findall(
            r"___",
            text,
        )

        answers = [
            item.strip()
            for item in answer.split("|")
        ]

        if len(placeholders) != len(answers):
            return _error(
                "Number of blanks does not match "
                "number of answers"
            )

        if any(not item for item in answers):
            return _error(
                "Close answers cannot be empty"
            )

        return {
            "valid": True,
            "question": question,
        }

    # --------------------------------------------------------
    # ORDERING
    # --------------------------------------------------------

    if qtype == "ordering":
        options = question.get("options")

        if not isinstance(options, list):
            return _error(
                "Ordering question must have options"
            )

        if len(options) < 3:
            return _error(
                "Ordering question must have at least 3 options"
            )

        if not all(
            isinstance(option, str) and option.strip()
            for option in options
        ):
            return _error(
                "Ordering options must be non-empty strings"
            )

        if len(set(
            option.strip().lower()
            for option in options
        )) != len(options):
            return _error(
                "Ordering options must be unique"
            )

        if "correct" in question:
            return _error(
                "Ordering question must not contain correct"
            )

        return {
            "valid": True,
            "question": question,
        }

    return _error(
        "Unknown validation error"
    )


def validate_variants(
    variants: Any,
    expected_count: int | None = None,
) -> dict:
    """
    Проверяет массив вариантов одного вопроса.
    """

    if not isinstance(variants, list):
        return _error(
            "variants must be a list"
        )

    if not variants:
        return _error(
            "variants cannot be empty"
        )

    if expected_count is not None:
        if len(variants) != expected_count:
            return _error(
                f"Expected {expected_count} variants, "
                f"got {len(variants)}"
            )

    valid_questions = []

    for index, question in enumerate(variants):
        result = validate_question(question)

        if not result["valid"]:
            return _error(
                f"Variant {index + 1}: "
                f"{result['error']}"
            )

        valid_questions.append(
            result["question"]
        )

    return {
        "valid": True,
        "variants": valid_questions,
    }


def validate_quiz(
    quiz: Any,
    expected_count: int,
) -> dict:
    """
    Проверяет полноценный квиз.
    """

    if not isinstance(quiz, dict):
        return _error(
            "Quiz must be an object"
        )

    title = quiz.get("title")

    if not isinstance(title, str) or not title.strip():
        return _error(
            "Quiz title is empty"
        )

    questions = quiz.get("questions")

    if not isinstance(questions, list):
        return _error(
            "Quiz questions must be a list"
        )

    if len(questions) != expected_count:
        return _error(
            f"Expected {expected_count} questions, "
            f"got {len(questions)}"
        )

    for index, question in enumerate(questions):
        result = validate_question(question)

        if not result["valid"]:
            return _error(
                f"Question {index + 1}: "
                f"{result['error']}"
            )

    return {
        "valid": True,
        "quiz": quiz,
    }
