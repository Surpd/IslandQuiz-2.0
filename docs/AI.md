# IslandQuiz — AI architecture

Статус: фактическое описание текущего backend/frontend AI flow на 2026-08-18.

## Provider and entry point

AI вызывается backend-функцией `call_openai` в `backend/routes/ai.py`. Несмотря на имя, запросы идут в Groq OpenAI-compatible API:

```text
https://api.groq.com/openai/v1/chat/completions
```

Ключ берётся из `OPENAI_API_KEY`. Модель берётся из `GROQ_MODEL`; если variable не задан, backend использует `qwen/qwen3.6-27b`.

Frontend передаёт параметры в `frontend/src/lib/api.ts`; prompts и модель формируются на backend.

## Endpoints

Все endpoints требуют authenticated user через `get_current_user`.

### `POST /api/ai/generate-question`

Входная модель поддерживает:

- `topic?: string`;
- `type?: choice | bool | text | ...`;
- `currentText?: string`;
- `wishes?: string`;
- `format?: string`;
- `reroll?: boolean`;
- `difficulty?: easy | medium | hard | mixed`.

Если `currentText` заполнен, endpoint использует improve prompt. Иначе создаёт новые варианты.

Фактический успешный ответ:

```json
{
  "variants": [
    {
      "type": "choice",
      "difficulty": "medium",
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "correct": 0
    }
  ]
}
```

По умолчанию создаются 3 варианта.

### `POST /api/ai/improve-question`

Вход:

- `currentText` — обязательный текст;
- `format`;
- `topic?`;
- `wishes?`;
- `reroll?`;
- `difficulty?`.

Ответ также имеет форму `{ "variants": [...] }` с тремя вариантами.

### `POST /api/ai/generate-quiz`

Вход:

- `topic?`;
- `count?`;
- `difficulty?`;
- `wishes?`.

`count` ограничивается backend диапазоном 5–20. Успешный ответ — объект с `title` и `questions`, где questions используют поля `type`, `difficulty`, `question` и type-specific fields.

### `POST /api/ai/generate-jeopardy-categories`

Вход: `topic?`, `wishes?`.

Ожидаемый AI JSON:

```json
{
  "categories": [
    {"name": "...", "description": "..."}
  ]
}
```

### `POST /api/ai/generate-jeopardy-questions`

Вход: `category`, `emptySlots`, `wishes?`.

Ожидаемый AI JSON:

```json
{
  "questions": [
    {"points": 100, "difficulty": "...", "q": "...", "a": "..."}
  ]
}
```

### `POST /api/ai/generate-from-file`

Multipart form fields:

- `file` — обязательный файл;
- `count`, default 10;
- `difficulty`, default `mixed`;
- `wishes`, default empty string.

Успешный ответ имеет тот же формат, что и `generate-quiz`: `{title, questions}`.

## Prompt architecture

`backend/services/ai_prompts.py` содержит:

- `TYPE_RULES` для `choice`, `bool`, `text`, `matching`, `close`, `ordering`;
- правила сложности `easy`, `medium`, `hard`, `mixed`;
- общие quality/language/fact rules;
- prompt builders для single question, improvement, full quiz и Jeopardy.

Prompt требует JSON, разнообразные вопросы, естественный русский язык и соответствие выбранному типу.

## Parsing and validation

Последовательность обработки обычного Quiz:

1. Groq response принимается как text.
2. `clean_json` удаляет Markdown code fences и лишний текст.
3. `parse_ai_json` вызывает `json.loads`.
4. `normalize_variants` приводит разные top-level формы к `variants` и добавляет `correctAnswer` для совместимости.
5. Frontend проверяет success/error shape до обращения к arrays и показывает controlled error для empty/malformed payload.

`backend/services/ai_validator.py` содержит структуру validator для отдельного H8 contract work, но H11 не применяет его как server-side gate к текущим AI success responses.

Validator проверяет:

- допустимый type и difficulty;
- четыре уникальных options для choice;
- boolean correct для bool;
- непустой `correctAnswer` для text/close;
- пары для matching;
- blanks/answers count для close;
- уникальный порядок options для ordering.

Валидатор не проверяет истинность фактов.

Jeopardy categories/questions сейчас после JSON parse возвращаются без такого же глубокого структурного validator pipeline.

## Limits and failures

Rate limits:

- single/improve: 10 запросов в минуту;
- full quiz, Jeopardy и file generation: 5 запросов в минуту.

Дополнительный дневной лимит:

- free: 10 запросов в день;
- premium: 100 запросов в день;
- admin: без этого лимита.

Usage записывается в `ai_usage`. Счётчик увеличивается до вызова провайдера.

Если `OPENAI_API_KEY` отсутствует, backend возвращает mock JSON, который не является полноценной генерацией и, как правило, не проходит дальнейшую валидацию.

Ошибки Groq, timeout, пустой response и invalid JSON превращаются в JSON-ответы с `error`. Для provider code `model_not_found` backend возвращает controlled configuration error и не логирует key, полный prompt или raw AI response.

## File processing limits

- максимум 10 MB;
- разрешены только `.pdf`, `.docx`, `.txt`, `.md`;
- допускаются соответствующие MIME types и `application/octet-stream`;
- PDF извлекается через `pdfplumber`;
- DOCX — через `python-docx`;
- TXT/MD читаются как UTF-8;
- пустой extraction отклоняется;
- в prompt передаются первые 5000 символов;
- итоговый `count` ограничивается диапазоном 5–20.

Файлы не сохраняются в Supabase backend-кодом: они читаются в памяти и используются только для генерации.

## Frontend integration

- `AIHelperButton` вызывает single/improve endpoints и показывает варианты.
- `AIGenerateQuizButton` вызывает full quiz endpoint или напрямую загружает файл в `/api/ai/generate-from-file`.
- `AIJeopardyCategoryButton` связывает builder с category/question endpoints.
- Builder преобразует AI shape (`question`, `correct`, `correctAnswer`, `pairs`) в локальный `QuizQuestion` shape (`q`, `answer`, `options`).

## Расхождения со старой документацией

`md/AI_LOGIC.md` остаётся историческим UX-описанием, но не текущим API contract:

- старый документ описывает `generateQuestion` как возврат одного объекта `question/options/correct`;
- текущий API возвращает `{variants: [...]}`;
- текущий backend поддерживает `currentText`, `format`, `difficulty` и отдельный improve flow;
- генерация из файлов в старом документе не описана;
- backend validator и дневные лимиты в старом документе не зафиксированы.
