# Official content import — `library-v1`

`library-v1` — стабильный JSON-формат для администраторского bulk-import. Файл не содержит UUID пользователя, visibility или production game id. В админке выбирается автор, сервер повторно валидирует pack, а все новые записи создаются с `visibility = "private"`.

## Root format

```json
{
  "schema_version": 1,
  "games": [
    {
      "content_id": "geo-europe-capitals-v1",
      "kind": "quiz",
      "tags": ["География"],
      "data": {}
    }
  ]
}
```

`schema_version` обязателен и сейчас равен `1`. `games` — непустой массив максимум из 100 игр. Каждая игра содержит только `content_id`, `kind`, `tags` и `data`; неизвестные поля, включая `owner_id`, блокируют импорт.

## `content_id`

Это глобальный стабильный ключ официального контента, а не UUID игры. Формат: lowercase ASCII kebab-case с обязательным суффиксом версии `-vN`, например `geo-europe-capitals-v1` или `history-ancient-rome-v2`. Используйте только `[a-z0-9-]`, не меняйте id после публикации версии и не повторяйте его в одном pack. В базе на `games.official_content_id` есть partial unique index: повторный импорт помечает игру как `already_imported` и пропускает её.

## Общие правила

- `kind` — только `quiz`, `jeopardy` или `millionaire`.
- `data` — точный текущий объект из `games.data`; importer не создаёт параллельную внутреннюю схему.
- `tags` необязателен, по умолчанию `[]`; максимум 5 тегов.
- Для каждого тега сервер схлопывает пробелы, делает case-insensitive lookup и сохраняет canonical `public.tags.name`.
- Неизвестные теги не создаются автоматически и являются blocking error.
- Импорт проверяет существование выбранного автора в `public.users` на validation и apply.
- Все новые игры получают выбранного автора, его имя, `private` visibility и исходный `data` без переписывания.
- Лимит заголовка — 100 символов, вопроса — 500, варианта ответа — 200, категории — 60.
- `image` — необязательная строка с тем же значением, которое принимает Builder/player; data URL и URL не преобразуются.

## Quiz schema

`data` имеет форму `{ "config": QuizConfig, "questions": QuizQuestion[] }`.

`config`:

| Поле | Тип и ограничения |
|---|---|
| `title` | непустая строка, максимум 100 |
| `description` | строка |
| `theme` | `amber`, `midnight`, `classic`, `ocean`, `forest` |
| `shuffleQuestions` | boolean |
| `showResult` | `each` или `end` |
| `defaultTime` | положительное целое число секунд |
| `orderMode` | `sequential` или `free` |
| `totalTime` | положительное целое число минут |

Каждый вопрос содержит `id` (непустая строка), `type`, `q`, `options`, `answer`, `points` (положительное целое) и `time` (положительное целое); `image` необязателен.

| `type` | `options` | `answer` |
|---|---|---|
| `choice` | ровно 4 уникальные непустые строки | точный текст одного варианта |
| `bool` | `[]` | строка `"true"` или `"false"` |
| `text` | `[]` | строка с одним или несколькими допустимыми ответами через запятую |
| `matching` | `[]` | JSON-строка массива минимум из 3 `{ "left": string, "right": string }` |
| `close` | `[]` | JSON-строка массива непустых строк; длина равна числу `___` в `q` |
| `ordering` | `[]` | JSON-строка массива минимум из 3 уникальных непустых строк в правильном порядке |

Важно: `matching`, `close` и `ordering` намеренно сохраняются JSON-строкой внутри `answer`, потому что именно это читают текущие Builder, player и `checkQuizAnswerCore`.

### Valid Quiz example with every question type

```json
{
  "schema_version": 1,
  "games": [
    {
      "content_id": "quiz-all-question-types-v1",
      "kind": "quiz",
      "tags": ["География", "История"],
      "data": {
        "config": {
          "title": "Европа: все типы вопросов",
          "description": "Полный пример официального Quiz pack",
          "theme": "amber",
          "shuffleQuestions": false,
          "showResult": "end",
          "defaultTime": 30,
          "orderMode": "sequential",
          "totalTime": 10
        },
        "questions": [
          {
            "id": "europe-q-choice-v1",
            "type": "choice",
            "q": "Какой город является столицей Италии?",
            "options": ["Рим", "Париж", "Берлин", "Лиссабон"],
            "answer": "Рим",
            "points": 100,
            "time": 30
          },
          {
            "id": "europe-q-bool-v1",
            "type": "bool",
            "q": "Париж является столицей Франции.",
            "options": [],
            "answer": "true",
            "points": 100,
            "time": 30
          },
          {
            "id": "europe-q-text-v1",
            "type": "text",
            "q": "Как называется столица Испании?",
            "options": [],
            "answer": "Мадрид, мадрид",
            "points": 100,
            "time": 30
          },
          {
            "id": "europe-q-matching-v1",
            "type": "matching",
            "q": "Соотнесите страну и столицу.",
            "options": [],
            "answer": "[{\"left\":\"Франция\",\"right\":\"Париж\"},{\"left\":\"Италия\",\"right\":\"Рим\"},{\"left\":\"Германия\",\"right\":\"Берлин\"}]",
            "points": 100,
            "time": 45
          },
          {
            "id": "europe-q-close-v1",
            "type": "close",
            "q": "Столицей ___ является город ___.",
            "options": [],
            "answer": "[\"Франции\",\"Париж\"]",
            "points": 100,
            "time": 45
          },
          {
            "id": "europe-q-ordering-v1",
            "type": "ordering",
            "q": "Расположите страны по численности населения: от меньшей к большей.",
            "options": [],
            "answer": "[\"Португалия\",\"Греция\",\"Германия\"]",
            "points": 100,
            "time": 45
          }
        ]
      }
    }
  ]
}
```

## Jeopardy / «Своя игра» schema

`data` имеет форму `{ "config": JeopardyConfig, "rounds": JeopardyCategory[][], "final": JeopardyFinal }`.

`config` содержит `theme`, положительные целые `timeBase`, `timeStep`, `timeFinal`; `title` и `roundTitles` необязательны. Раунд содержит от 1 до 6 категорий, категория — `category` и от 1 до 5 вопросов. Вопрос содержит положительные очки, кратные 100, `q`, `a` и необязательный `image`. `final` содержит непустые `category`, `q`, `a` и необязательный `image`.

### Valid Jeopardy example

```json
{
  "schema_version": 1,
  "games": [
    {
      "content_id": "jeopardy-europe-v1",
      "kind": "jeopardy",
      "tags": ["География", "История"],
      "data": {
        "config": {
          "title": "Европейская своя игра",
          "roundTitles": ["Страны и столицы"],
          "theme": "ocean",
          "timeBase": 30,
          "timeStep": 15,
          "timeFinal": 90
        },
        "rounds": [
          [
            {
              "category": "Столицы",
              "questions": [
                {"points": 100, "q": "Столица Франции?", "a": "Париж"},
                {"points": 200, "q": "Столица Италии?", "a": "Рим"},
                {"points": 300, "q": "Столица Венгрии?", "a": "Будапешт"}
              ]
            },
            {
              "category": "История Европы",
              "questions": [
                {"points": 100, "q": "В каком году закончилась Вторая мировая война?", "a": "1945"},
                {"points": 200, "q": "Как назывался документ 1215 года, ограничивший власть английского короля?", "a": "Великая хартия вольностей"},
                {"points": 300, "q": "Какой город был центром Возрождения в Тоскане?", "a": "Флоренция"}
              ]
            }
          ]
        ],
        "final": {
          "category": "Европа",
          "q": "Какая страна занимает большую часть Пиренейского полуострова?",
          "a": "Испания"
        }
      }
    }
  ]
}
```

## Millionaire schema

`data` имеет форму `{ "config": MillionaireConfig, "questions": MillionaireQuestion[] }`.

`config` содержит `theme`, положительное целое `timePerQuestion`, `moneyScale` (`easy`, `normal`, `hard`), `milestones` (`classic`, `three`, `none`) и необязательный `pointsMode` (`classic`, `double`, `custom`). `title` необязателен. Каждый вопрос содержит непустой `q`, положительное `money` и ровно 4 `{ "text": string, "correct": boolean }` с ровно одним `correct: true`.

### Valid Millionaire example

```json
{
  "schema_version": 1,
  "games": [
    {
      "content_id": "millionaire-europe-v1",
      "kind": "millionaire",
      "tags": ["Общая эрудиция", "География"],
      "data": {
        "config": {
          "title": "Кто хочет стать знатоком Европы",
          "theme": "classic",
          "timePerQuestion": 30,
          "moneyScale": "normal",
          "milestones": "three",
          "pointsMode": "classic"
        },
        "questions": [
          {
            "q": "Какой город является столицей Германии?",
            "money": 500,
            "options": [
              {"text": "Берлин", "correct": true},
              {"text": "Вена", "correct": false},
              {"text": "Прага", "correct": false},
              {"text": "Рим", "correct": false}
            ]
          },
          {
            "q": "Какая страна находится на Пиренейском полуострове?",
            "money": 1000,
            "options": [
              {"text": "Испания", "correct": true},
              {"text": "Норвегия", "correct": false},
              {"text": "Польша", "correct": false},
              {"text": "Исландия", "correct": false}
            ]
          },
          {
            "q": "Как называется валюта большинства стран Европейского союза?",
            "money": 2000,
            "options": [
              {"text": "Евро", "correct": true},
              {"text": "Фунт", "correct": false},
              {"text": "Франк", "correct": false},
              {"text": "Крона", "correct": false}
            ]
          }
        ]
      }
    }
  ]
}
```

## Mapping and operational flow

Backend maps each item directly to one row of `public.games`: `kind` → `games.kind`, `data` → `games.data`, canonical tag names → `games.tags`, selected author → `owner_id`/`owner_name`, fixed `private` → `visibility`, `content_id` → `official_content_id`. No frontend write to Supabase is performed.

`POST /api/admin/content/import/validate` returns counts, cards, normalized tags, existing-import warnings and path-based errors. `POST /api/admin/content/import/apply` repeats the same validation and sends the complete new subset to `apply_official_content_import`. The RPC is a single Postgres transaction. Any database error aborts all rows; the partial unique key makes retries idempotent. Existing games are never made public by importer; use the existing Admin bulk visibility action afterward.

The empty starter file is [`content/library-v1.json`](../content/library-v1.json). The Admin download button serves the same empty starter from `frontend/public/content/library-v1.json`.
