# Структура базы данных IslandQuiz (SQLite)

## Таблица `users`
- `id` (число, первичный ключ)
- `name` (текст)
- `email` (текст, уникальный)
- `password_hash` (текст)
- `role` (текст, "teacher" или "student")
- `created_at` (дата и время)

## Таблица `games`
- `id` (число, первичный ключ)
- `teacher_id` (внешний ключ к `users.id`)
- `title` (текст)
- `type` (текст, "quiz", "jeopardy", "millionaire")
- `data_json` (текст, полный JSON с вопросами и настройками)
- `created_at` (дата и время)

## Таблица `assignments`
- `id` (число, первичный ключ)
- `teacher_id` (внешний ключ к `users.id`)
- `student_id` (внешний ключ к `users.id`)
- `game_id` (внешний ключ к `games.id`)
- `status` (текст, "pending" или "completed")
- `assigned_at` (дата и время)

## Таблица `results`
- `id` (число, первичный ключ)
- `student_id` (внешний ключ к `users.id`)
- `game_id` (внешний ключ к `games.id`)
- `score` (число)
- `total` (число)
- `answers_json` (текст, детализация по каждому вопросу)
- `time_start` (дата и время)
- `time_end` (дата и время)

## Временные таблицы для онлайн-комнат

### `rooms`
- `id` (число, первичный ключ)
- `game_id` (внешний ключ к `games.id`)
- `teacher_id` (внешний ключ к `users.id`)
- `code` (текст, код комнаты)
- `status` (текст, "waiting", "active", "finished")
- `created_at` (дата и время)

### `room_players`
- `id` (число, первичный ключ)
- `room_id` (внешний ключ к `rooms.id`)
- `nickname` (текст)
- `avatar` (текст)
- `score` (число, текущие очки)
- `streak` (число, серия правильных ответов)
- `is_connected` (true/false)
- `joined_at` (дата и время)

## Основные эндпоинты API (FastAPI)
- `POST /auth/register` — регистрация
- `POST /auth/login` — вход, возвращает JWT-токен
- `GET /my-games` — список квизов учителя
- `POST /games` — создать новую игру
- `GET /games/{id}` — получить игру по ID
- `POST /room/create` — создать онлайн-комнату
- `POST /room/join` — присоединиться к комнате
- `GET /room/{code}/state` — получить состояние комнаты
- `GET /quiz/{id}/results` — результаты квиза
- `GET /student/{id}/stats` — статистика ученика