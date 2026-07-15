def generate_question_prompt(topic: str, question_type: str, difficulty: str, wishes: str = "", count: int = 3) -> str:
    """Промт для генерации одного вопроса."""
    type_descriptions = {
        "choice": "вопрос с 4 вариантами ответа (A/B/C/D), только один правильный",
        "bool": "утверждение, на которое нужно ответить Да или Нет",
        "text": "открытый вопрос с кратким текстовым ответом",
        "matching": "три пары для сопоставления (левый элемент → правый элемент)",
    }
    type_desc = type_descriptions.get(question_type, "вопрос с 4 вариантами ответа")

    prompt = f"""Ты — составитель викторин. Составь {count} {'вопрос' if count == 1 else 'вопроса'} по теме «{topic}».

Тип вопроса: {type_desc}
Сложность: {difficulty}

Требования:
- Вопросы должны быть проверяемыми и фактически верными
- Варианты ответов должны быть правдоподобными
- Для сложности easy — базовые знания
- Для сложности medium — углублённые знания
- Для сложности hard — малоизвестные факты, требует эрудиции

Дополнительные пожелания: {wishes if wishes else "нет"}

Формат ответа — JSON:
[
  {{
    "question": "текст вопроса",
    "options": ["A", "B", "C", "D"],  // только для choice
    "correct": 0,  // индекс правильного ответа (0-3) для choice, или true/false для bool
    "correctAnswer": "текст ответа"  // для text и matching
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
    """Промт для генерации целого квиза."""
    prompt = f"""Составь квиз из {count} вопросов по теме «{topic}».

Распределение типов вопросов:
- 60% — choice (4 варианта ответа)
- 20% — text (открытый ответ)
- 10% — bool (да/нет)
- 10% — matching (сопоставление)

Сложность варьируется от лёгкой к сложной.
Название квиза должно отражать тему.

Дополнительные пожелания: {wishes if wishes else "нет"}

Формат ответа — JSON:
{{
  "title": "Название квиза",
  "questions": [
    {{
      "type": "choice",
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "correct": 0
    }},
    ...
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