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

        if not isinstance(correct, int):
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
