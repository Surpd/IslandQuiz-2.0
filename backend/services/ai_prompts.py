def generate_question_prompt(topic: str, question_type: str, difficulty: str, wishes: str = "", count: int = 3) -> str:
    type_descriptions = {
        "choice": "вопрос с 4 вариантами ответа (A/B/C/D), только один правильный. Формат: {\"question\": \"...\", \"options\": [\"A\", \"B\", \"C\", \"D\"], \"correct\": 0}",
        "bool": "утверждение, на которое нужно ответить Да или Нет. Формат: {\"question\": \"...\", \"correct\": true/false}",
        "text": "открытый вопрос с кратким ответом (одно-два слова). Формат: {\"question\": \"...\", \"correctAnswer\": \"краткий ответ\"}",
        "matching": "три пары для сопоставления. Формат: {\"question\": \"...\", \"pairs\": [{\"left\": \"A\", \"right\": \"1\"}, ...]}",
    }
    type_desc = type_descriptions.get(question_type, type_descriptions["choice"])

    prompt = f"""Ты — профессиональный автор викторин. Создай вопросы, в которые интересно играть.

Тема: «{topic}»
Тип вопроса: {type_desc}
Сложность: {difficulty}
Количество: {count}

Старайся делать вопросы разнообразными. Избегай однотипных формулировок.

Для text-вопросов ответ должен быть кратким — одним-двумя словами.
Для matching — верни пары в поле "pairs".
Для choice — верни 4 варианта и индекс правильного в "correct".

Формат ответа — строго JSON-массив без бэктиков:
[
  {{
    "question": "текст вопроса",
    "correctAnswer": "ответ"  // для text
  }}
]
"""
    return prompt


def improve_question_prompt(current_text: str, format_type: str, topic: str = "", wishes: str = "") -> str:
    """Промт для улучшения существующего вопроса."""
    prompt = f"""Улучши формулировку вопроса для викторины.

Текущий текст: «{current_text}»
Формат вопроса: {format_type}
Тема (если есть): {topic if topic else "не указана"}
Пожелания: {wishes if wishes else "нет"}

Сделай вопрос более чётким, интересным и соответствующим формату {format_type}.
Дай 3 варианта с разной сложностью: easy, medium, hard.

Формат ответа — JSON с полем variants: массив из 3 объектов с difficulty и question.
"""
    return prompt


def generate_quiz_prompt(topic: str, count: int = 10, wishes: str = "") -> str:
    prompt = f"""Ты — профессиональный автор викторин. Составь квиз из {count} вопросов по теме «{topic}».

Распределение типов вопросов:
- 60% — choice (4 варианта ответа, только один правильный)
- 20% — text (открытый вопрос, ответ одним-двумя словами или короткой фразой)
- 10% — bool (да/нет, correct: true/false)
- 10% — matching (три пары для сопоставления в поле pairs: [{{"left": "A", "right": "1"}}, ...])

Сложность варьируется от лёгкой к сложной.
Название квиза должно отражать тему.

Дополнительные пожелания: {wishes if wishes else "нет"}

ВАЖНО: Каждый вопрос должен иметь СТРОГО свой формат:
- choice: "options": ["A", "B", "C", "D"], "correct": 0 (индекс правильного)
- text: "correctAnswer": "краткий ответ"
- bool: "correct": true или false
- matching: "pairs": [{{"left": "...", "right": "..."}}, ...]

Формат ответа — строго JSON без бэктиков:
{{
  "title": "Название квиза",
  "questions": [
    {{
      "type": "choice",
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "correct": 0
    }},
    {{
      "type": "text",
      "question": "...",
      "correctAnswer": "краткий ответ"
    }},
    {{
      "type": "bool",
      "question": "...",
      "correct": true
    }},
    {{
      "type": "matching",
      "question": "Сопоставьте:",
      "pairs": [{{"left": "A", "right": "1"}}, {{"left": "B", "right": "2"}}, {{"left": "C", "right": "3"}}]
    }}
  ]
}}
"""
    return prompt


def generate_jeopardy_categories_prompt(topic: str, wishes: str = "") -> str:
    """Промт для генерации категорий Jeopardy."""
    prompt = f"""Придумай 3 категории для игры «Своя игра» по теме «{topic}».

Каждая категория должна содержать:
- name: название категории
- description: краткое описание (одна фраза)

Категории должны быть разными по аспектам темы.
Пожелания: {wishes if wishes else "нет"}

Формат ответа — JSON:
{{
  "categories": [
    {{ "name": "...", "description": "..." }},
    ...
  ]
}}
"""
    return prompt


def generate_jeopardy_questions_prompt(category: str, empty_slots: list[int], wishes: str = "") -> str:
    """Промт для генерации вопросов Jeopardy."""
    difficulty_map = {
        100: "очень лёгкий",
        200: "лёгкий",
        300: "средний",
        400: "сложный",
        500: "очень сложный",
    }
    slots_desc = ", ".join([f"{s} ({difficulty_map.get(s, 'средний')})" for s in empty_slots])

    prompt = f"""Составь вопросы для категории «{category}» в «Своей игре».

Нужны вопросы для следующих слотов (цена и сложность):
{slots_desc}

Каждый вопрос должен быть фактом, сформулированным как «вопрос-ответ» (без вариантов).
Сложность строго соответствует цене вопроса.

Пожелания: {wishes if wishes else "нет"}

Формат ответа — JSON:
{{
  "questions": [
    {{ "points": 100, "q": "текст вопроса", "a": "правильный ответ" }},
    ...
  ]
}}
"""
    return prompt