# IslandQuiz — AI architecture

Статус: canonical AI contract, telemetry и quota enforcement на 2026-08-22.

## Provider and entry point

AI вызывается backend-функцией `call_openai` в `backend/routes/ai.py`. Несмотря на имя, запросы идут в Groq OpenAI-compatible API:

```text
https://api.groq.com/openai/v1/chat/completions
```

Ключ берётся из `OPENAI_API_KEY`. Модель берётся из `GROQ_MODEL`; если variable не задан, backend использует `qwen/qwen3.6-27b`.

Frontend передаёт параметры в `frontend/src/lib/api.ts`; prompts и модель формируются на backend.
Для Quiz/Jeopardy generation backend запрашивает Groq JSON mode (`response_format: json_object`) и отключает reasoning output (`reasoning_effort: none`), чтобы `message.content` содержал JSON, а не prose/reasoning.

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

Успешный ответ всегда содержит ровно 3 структурно валидных варианта:

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

Ответ также имеет форму `{ "variants": [...] }` с ровно тремя валидными вариантами.

### `POST /api/ai/generate-quiz`

Вход:

- `topic?`;
- `count?`;
- `difficulty?`;
- `wishes?`.

`count` ограничивается backend диапазоном 5–20. Успешный ответ — объект с `title` и ровно запрошенным после этого ограничения количеством вопросов; вопросы используют поля `type`, `difficulty`, `question` и type-specific fields.

Текущий input использует общие `count` и `difficulty`, но это не ограничение продуктовой модели: последующее расширение может добавить отдельный объект generation preferences для типов вопросов, пропорций/количества по типам, mix сложности и дополнительных constraints. Такое расширение не должно менять текущие success shapes.

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

Успешный ответ содержит ровно 5 категорий с непустыми уникальными `name` и непустыми `description`.

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

Успешный ответ содержит ровно по одному вопросу на каждый `emptySlots`; `points` не дублируются и точно соответствуют запрошенным слотам. Поля `difficulty`, `q` и `a` обязательны и непусты.

### `POST /api/ai/generate-from-file`

Multipart form fields:

- `file` — обязательный файл;
- `count`, default 10;
- `difficulty`, default `mixed`;
- `wishes`, default empty string.

Успешный ответ имеет тот же формат, что и `generate-quiz`: `{title, questions}` с ровно запрошенным (после ограничения 5–20) количеством вопросов.

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
4. `normalize_variants` приводит legacy top-level формы к `variants` и добавляет `correctAnswer` для совместимости.
5. Backend валидирует canonical success shape: 3 variants, requested Quiz count, 5 Jeopardy categories или точные Jeopardy slots.
6. Frontend повторно проверяет success shape до обращения к arrays и показывает controlled error для empty/malformed payload.

`backend/services/ai_validator.py` — server-side gate для всех AI success responses.

Validator проверяет:

- допустимый type и difficulty;
- четыре уникальных options для choice;
- boolean correct для bool;
- непустой `correctAnswer` для text/close;
- пары для matching;
- blanks/answers count для close;
- уникальный порядок options для ordering.

Валидатор не проверяет истинность фактов.

Jeopardy validator проверяет 5 уникальных категорий, а также набор вопросов, точно соответствующий `emptySlots` без повторяющихся points.

## Limits and failures

Rate limits:

- single/improve: 10 запросов в минуту;
- full quiz, Jeopardy и file generation: 5 запросов в минуту.

Дополнительный дневной лимит:

- free: 10 запросов в день;
- premium: 100 запросов в день;
- admin: без этого лимита.

Quota attempts резервируются в `ai_usage` до вызова провайдера, поэтому provider failures не освобождают дневную квоту. Все generation/file endpoints используют единый `check_ai_limit`, который вызывает PostgreSQL RPC `consume_ai_quota`; RPC transaction-scoped advisory lock сериализует только тот же `(user_id, request_type)` bucket и атомарно выполняет count + insert. Unlimited/admin semantics сохраняются: RPC не вызывается и usage row не создаётся. Каждый вызов общего AI-клиента дополнительно пишет одну строку в `ai_logs` с `user_id`, моделью, `success/error`, `prompt_tokens`, `completion_tokens` и `created_at`; request type хранится в `ai_usage.request_type` и дублируется в legacy-поле `ai_logs.topic`. Если provider не прислал usage, token fields остаются `null`. Ошибка telemetry не ломает пользовательский AI-запрос.

Historical telemetry неполна: старые `ai_usage` rows могут не иметь соответствующей детальной записи `ai_logs`. Эти данные не следует искусственно восстанавливать.

Если `OPENAI_API_KEY` отсутствует, backend возвращает mock JSON, который не является полноценной генерацией и, как правило, не проходит дальнейшую валидацию.

Ошибки провайдера, timeout, пустой/некорректный output и invalid JSON превращаются в controlled HTTP `502` с `{ "error": string, "code": string }`. Ошибки файла и дневной лимит используют тот же envelope с соответствующим HTTP status. Для provider code `model_not_found` backend возвращает controlled configuration error. Parser diagnostics содержат только type, length и leading shape output; key, полный prompt и raw AI response не логируются.

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
