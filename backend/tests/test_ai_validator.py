import unittest

from services.ai_validator import (
    validate_jeopardy_categories,
    validate_jeopardy_questions,
    validate_quiz,
    validate_variants,
)


def choice_question(index: int) -> dict:
    options = [f"{index}-A", f"{index}-B", f"{index}-C", f"{index}-D"]
    return {
        "type": "choice",
        "difficulty": "medium",
        "question": f"Question {index}?",
        "options": options,
        "correct": 0,
        "correctAnswer": options[0],
    }


def bool_question(index: int) -> dict:
    return {"type": "bool", "difficulty": "medium", "question": f"Statement {index}", "correct": True}


def text_question(index: int) -> dict:
    return {"type": "text", "difficulty": "medium", "question": f"Question {index}?", "correctAnswer": "Answer"}


class AIValidatorContractTests(unittest.TestCase):
    def test_variants_require_three_valid_questions(self):
        result = validate_variants([choice_question(1), choice_question(2), choice_question(3)], 3)

        self.assertTrue(result["valid"])

    def test_variants_reject_wrong_count(self):
        result = validate_variants([choice_question(1)], 3)

        self.assertFalse(result["valid"])

    def test_quiz_requires_requested_question_count(self):
        quiz = {
            "title": "Quiz",
            "questions": [choice_question(1), choice_question(2)],
        }

        self.assertTrue(validate_quiz(quiz, 2)["valid"])
        self.assertFalse(validate_quiz(quiz, 3)["valid"])

    def test_quiz_requires_requested_type_distribution(self):
        quiz = {
            "title": "Quiz",
            "questions": [choice_question(1), bool_question(2), text_question(3)],
        }
        expected = {"choice": 1, "bool": 1, "text": 1, "matching": 0, "close": 0, "ordering": 0}

        self.assertTrue(validate_quiz(quiz, 3, expected)["valid"])
        expected["choice"] = 2
        expected["text"] = 0
        self.assertFalse(validate_quiz(quiz, 3, expected)["valid"])

    def test_jeopardy_categories_require_five_unique_items(self):
        categories = [
            {"name": f"Category {index}", "description": f"Description {index}"}
            for index in range(1, 6)
        ]

        self.assertTrue(validate_jeopardy_categories(categories)["valid"])
        categories[-1]["name"] = categories[0]["name"]
        self.assertFalse(validate_jeopardy_categories(categories)["valid"])

    def test_jeopardy_questions_must_match_requested_slots(self):
        slots = [100, 200]
        questions = [
            {"points": 100, "difficulty": "basic", "q": "Question?", "a": "Answer"},
            {"points": 200, "difficulty": "advanced", "q": "Question?", "a": "Answer"},
        ]

        self.assertTrue(validate_jeopardy_questions(questions, slots)["valid"])
        questions[1]["points"] = 100
        self.assertFalse(validate_jeopardy_questions(questions, slots)["valid"])


if __name__ == "__main__":
    unittest.main()
