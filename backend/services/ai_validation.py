import re
from typing import Any


ALLOWED_DIFFICULTIES = {
    "easy",
    "medium",
    "hard",
}


ALLOWED_TYPES = {
    "choice",
    "bool",
    "text",
    "matching",
    "close",
    "ordering",
}


# ============================================================
# TEXT SANITIZATION
# ============================================================

def sanitize_text(value: Any) -> str:
    """
    Безопасная очистка текста, который пришёл от AI.

    Важно:
    Не пытаемся здесь "переписывать" вопрос.
    Только убираем явный технический мусор.
    """

    if value is None:
        return ""

    if not isinstance(value, str):
        value = str(value)

    value = value.replace("\r\n", "\n")
    value = value.replace("\r", "\n")

    # Убираем zero-width символы
    value = re.sub(r"[\u200B-\u200D\uFEFF]", "", value)

    # Убираем случайные управляющие символы,
    # кроме tab/newline.
    value = "".join(
        char
        for char in value
        if char == "\n"
        or char == "\t"
        or ord(char) >= 32
    )

    # Несколько пробелов подряд
    value = re.sub(r"[ \t]+", " ", value)

    # Слишком много пустых строк
    value = re.sub(r"\n{3,}", "\n\n", value)

    return value.strip()


def sanitize_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []

    return [
        sanitize_text(value)
        for value in values
        if value is not None
    ]


# ============================================================
# DIFFICULTY
# ============================================================

def sanitize_difficulty(value: Any) -> str:
    if value in ALLOWED_DIFFICULTIES:
        return value

    return "medium"


# ============================================================
# CHOICE
# ============================================================

def validate_choice(question: dict) -> dict:
    options = sanitize_list(question.get("options"))

    # У choice должно быть ровно 4 варианта.
    if len(options) != 4:
        question["_validation_error"] = (
            "choice must contain exactly 4 options"
        )
        return question

    correct = question.get("correct")

    if not isinstance(correct, int):
        question["_validation_error"] = (
            "correct must be an integer"
        )
        return question

    if correct < 0 or correct >= 4:
        question["_validation_error"] = (
            "correct must be between 0 and 3"
        )
        return question

    question["question"] = sanitize_text(
        question.get("question")
    )

    question["options"] = options

    question["correct"] = correct

    # Это поле frontend может использовать,
    # но оно не является частью AI-контракта.
    question["correctAnswer"] = options[correct]

    # choice не должен иметь pairs.
    question.pop("pairs", None)

    return question


# ============================================================
# BOOL
# ============================================================

def validate_bool(question: dict) -> dict:
    question["question"] = sanitize_text(
        question.get("question")
    )

    correct = question.get("correct")

    if not isinstance(correct, bool):
        question["_validation_error"] = (
            "bool correct must be true or false"
        )
        return question

    question["correct"] = correct

    question.pop("options", None)
    question.pop("pairs", None)
    question.pop("correctAnswer", None)

    return question


# ============================================================
# TEXT
# ============================================================

def validate_text(question: dict) -> dict:
    question["question"] = sanitize_text(
        question.get("question")
    )

    answer = question.get("correctAnswer")

    if not answer:
        answer = question.get("answer")

    question["correctAnswer"] = sanitize_text(answer)

    if not question["correctAnswer"]:
        question["_validation_error"] = (
            "text question has no correctAnswer"
        )

    question.pop("options", None)
    question.pop("pairs", None)
    question.pop("correct", None)

    return question


# ============================================================
# MATCHING
# ============================================================

def validate_matching(question: dict) -> dict:
    question["question"] = sanitize_text(
        question.get("question")
    )

    pairs = question.get("pairs")

    if not isinstance(pairs, list):
        question["_validation_error"] = (
            "matching pairs must be a list"
        )
        return question

    cleaned_pairs = []

    for pair in pairs:
        if not isinstance(pair, dict):
            continue

        left = sanitize_text(pair.get("left"))
        right = sanitize_text(pair.get("right"))

        if left and right:
            cleaned_pairs.append({
                "left": left,
                "right": right,
            })

    if len(cleaned_pairs) < 2:
        question["_validation_error"] = (
            "matching must contain at least 2 pairs"
        )
        return question

    question["pairs"] = cleaned_pairs

    question.pop("options", None)
    question.pop("correct", None)
    question.pop("correctAnswer", None)

    return question


# ============================================================
# CLOSE
# ============================================================

def validate_close(question: dict) -> dict:
    question["question"] = sanitize_text(
        question.get("question")
    )

    answer = sanitize_text(
        question.get("correctAnswer")
    )

    blanks = question["question"].count("___")

    answers = [
        item.strip()
        for item in answer.split("|")
        if item.strip()
    ]

    if blanks == 0:
        question["_validation_error"] = (
            "close question has no blanks"
        )
        return question

    if blanks != len(answers):
        question["_validation_error"] = (
            f"close has {blanks} blanks "
            f"but {len(answers)} answers"
        )
        return question

    question["correctAnswer"] = "|".join(answers)

    question.pop("options", None)
    question.pop("pairs", None)
    question.pop("correct", None)

    return question


# ============================================================
# ORDERING
# ============================================================

def validate_ordering(question: dict) -> dict:
    question["question"] = sanitize_text(
        question.get("question")
    )

    options = sanitize_list(
        question.get("options")
    )

    if len(options) < 3:
        question["_validation_error"] = (
            "ordering must contain at least 3 options"
        )
        return question

    question["options"] = options

    # ВАЖНО:
    # options уже должны быть в правильном порядке.
    # Никакого correctAnswer здесь не нужно.

    question.pop("correct", None)
    question.pop("correctAnswer", None)
    question.pop("pairs", None)

    return question


# ============================================================
# SINGLE QUESTION
# ============================================================

def validate_question(question: Any) -> dict | None:
    if not isinstance(question, dict):
        return None

    q = dict(question)

    qtype = q.get("type")

    if qtype not in ALLOWED_TYPES:
        return None

    q["difficulty"] = sanitize_difficulty(
        q.get("difficulty")
    )

    validators = {
        "choice": validate_choice,
        "bool": validate_bool,
        "text": validate_text,
        "matching": validate_matching,
        "close": validate_close,
        "ordering": validate_ordering,
    }

    q = validators[qtype](q)

    return q


# ============================================================
# REMOVE INTERNAL VALIDATION FIELDS
# ============================================================

def remove_invalid_questions(
    questions: list[dict],
) -> list[dict]:

    valid = []

    for question in questions:
        if "_validation_error" in question:
            print(
                "[AI VALIDATION] Dropped question:",
                question["_validation_error"],
            )
            continue

        valid.append(question)

    return valid


# ============================================================
# VARIANTS
# ============================================================

def validate_variants(result: Any) -> list[dict]:
    """
    Нормализует ответ AI Helper.

    Принимает:
      [...]
      {"variants": [...]}
      {"questions": [...]}
    """

    if isinstance(result, dict):
        if isinstance(result.get("variants"), list):
            raw = result["variants"]

        elif isinstance(result.get("questions"), list):
            raw = result["questions"]

        else:
            raw = [result]

    elif isinstance(result, list):
        raw = result

    else:
        return []

    validated = []

    for item in raw:
        question = validate_question(item)

        if question:
            validated.append(question)

    return remove_invalid_questions(validated)


# ============================================================
# FULL QUIZ
# ============================================================

def validate_quiz(result: Any) -> dict:
    if not isinstance(result, dict):
        return {
            "title": "",
            "questions": [],
        }

    title = sanitize_text(
        result.get("title")
    )

    questions_raw = result.get("questions")

    if not isinstance(questions_raw, list):
        questions_raw = []

    questions = []

    for item in questions_raw:
        question = validate_question(item)

        if question:
            questions.append(question)

    questions = remove_invalid_questions(
        questions
    )

    return {
        "title": title,
        "questions": questions,
    }