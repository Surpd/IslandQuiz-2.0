import unittest

from services.ai_validator import (
    describe_ai_shape,
    normalize_question,
    normalize_quiz,
    validate_quiz,
    validate_variants,
)


class AiNormalizationTests(unittest.TestCase):
    def test_quiz_envelope_and_question_aliases_are_canonicalized(self):
        raw = {
            "quiz": {
                "name": "Театр XVIII века",
                "questions": [
                    {
                        "type": "multiple_choice",
                        "difficulty": "easy",
                        "questionText": "Как назывался жанр лёгкой комической оперы?",
                        "answers": ["Опера-буффа", "Ода", "Фуга", "Баллада"],
                        "answer": "Опера-буффа",
                    },
                    {
                        "type": "boolean",
                        "difficulty": "medium",
                        "q": "Комедия дель арте строилась на устойчивых масках.",
                        "options": ["Да", "Нет"],
                        "answer": "true",
                    },
                    {
                        "type": "open",
                        "difficulty": "medium",
                        "text": "Назовите драматурга комедии «Недоросль».",
                        "answer": "Денис Фонвизин",
                    },
                    {
                        "type": "match",
                        "difficulty": "hard",
                        "question": "Соотнесите автора и пьесу.",
                        "matchingPairs": [
                            {"left": "Бомарше", "right": "Женитьба Фигаро"},
                            {"left": "Фонвизин", "right": "Недоросль"},
                            {"left": "Гольдони", "right": "Слуга двух господ"},
                        ],
                    },
                ],
            },
        }

        normalized = normalize_quiz(raw)
        result = validate_quiz(normalized, expected_count=4)

        self.assertTrue(result["valid"], result.get("error"))
        self.assertEqual(normalized["title"], "Театр XVIII века")
        self.assertEqual(normalized["questions"][0]["correct"], 0)
        self.assertIs(normalized["questions"][1]["correct"], True)
        self.assertEqual(
            normalized["questions"][2]["correctAnswer"],
            "Денис Фонвизин",
        )

    def test_helper_answer_alias_maps_to_choice_index(self):
        raw_variants = [
            {
                "difficulty": "easy",
                "question": "Как называется театр с куклами?",
                "options": ["Кукольный", "Оперный", "Теневой", "Цирковой"],
                "answer": "Кукольный",
            },
            {
                "difficulty": "medium",
                "question": "Как называют короткую смешную сцену?",
                "options": ["Интермедия", "Сонет", "Хор", "Ария"],
                "correctAnswer": "Интермедия",
            },
            {
                "difficulty": "hard",
                "question": "Кто написал «Недоросля»?",
                "options": ["Фонвизин", "Пушкин", "Гоголь", "Чехов"],
                "correct": "0",
            },
        ]

        normalized = [
            normalize_question(question, expected_type="choice")
            for question in raw_variants
        ]
        result = validate_variants(normalized, expected_count=3)

        self.assertTrue(result["valid"], result.get("error"))
        self.assertEqual([item["correct"] for item in normalized], [0, 0, 0])

    def test_unknown_choice_answer_stays_rejected(self):
        normalized = normalize_question(
            {
                "difficulty": "easy",
                "question": "Неверный ответ не должен стать индексом.",
                "options": ["А", "Б", "В", "Г"],
                "answer": "Д",
            },
            expected_type="choice",
        )

        result = validate_variants([normalized], expected_count=1)

        self.assertFalse(result["valid"])
        self.assertIn("correct", result["error"])

    def test_diagnostic_contains_shape_not_question_content(self):
        shape = describe_ai_shape(
            {
                "questions": [
                    {
                        "type": "choice",
                        "question": "Секретный текст вопроса",
                        "options": ["Личный ответ"],
                    },
                ],
            }
        )

        self.assertEqual(shape["questions_count"], 1)
        self.assertIn("question", shape["first_questions_keys"])
        self.assertNotIn("Секретный текст вопроса", str(shape))
        self.assertNotIn("Личный ответ", str(shape))


if __name__ == "__main__":
    unittest.main()
