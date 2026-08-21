# IslandQuiz — фактическая архитектура

Статус: актуальное описание кода на 2026-08-21. Если этот документ расходится с кодом, источником истины является код и фактическая production-схема Supabase.

## Общее устройство

```text
Browser
  ├─ React/TanStack routes, builders, players
  ├─ REST + JWT ───────────────► FastAPI
  └─ WebSocket /ws/room/:code ─► FastAPI in-memory room state

FastAPI
  ├─ auth/users/games/results/admin/feedback routes
  ├─ AI routes ────────────────► Groq API
  ├─ Telegram auth routes ◄──── Telegram bot
  ├─ direct Supabase REST calls ─► Supabase PostgreSQL
  └─ room state in process memory
```

Frontend production API и WebSocket URLs заданы в `frontend/src/lib/api.ts` как `https://api.islandquiz.online` и `wss://api.islandquiz.online`. Отдельные Telegram/file flows также используют этот production URL напрямую.

## Frontend

Frontend — React + TypeScript + Vite/TanStack Start с file-based routing.

- `src/routes` содержит страницы: library, builders, players, results, profile, admin, auth и rooms.
- `src/components` содержит переиспользуемые builders/actions, AI controls, player shells и Jeopardy room views.
- `src/lib/api.ts` — основной facade: auth, games, results, WebSocket rooms, AI и public profiles.
- `src/lib/types.ts` — frontend-модели Quiz, Jeopardy, Millionaire и `StoredGame`.
- `src/hooks/use-auth.tsx` — React auth context, который получает пользователя через backend.
- `src/hooks/use-draft.ts` и legacy `src/lib/storage.ts` — локальные drafts/ID/остатки старой localStorage-модели.

Канонические игры и результаты сейчас идут через backend. Legacy localStorage-модули всё ещё присутствуют и не должны удаляться изолированно.

## Backend и точки входа

Главная точка входа — `backend/main.py`. Она:

- создаёт FastAPI app;
- настраивает CORS и rate limiting;
- подключает routers;
- на startup вызывает `init_db()` и запускает Telegram bot polling task.

Основные routers:

- `routes/auth.py` — email/password, JWT, profile auth helper, password reset;
- `routes/telegram_auth.py` — Telegram start/bot-login/complete;
- `routes/users.py` — profile and account operations;
- `routes/games.py` — JSON games, visibility, fork, ratings, play count;
- `routes/results.py` — standalone and online results;
- `routes/ai.py` — AI generation, validation and file extraction;
- `routes/rooms.py` — WebSocket room protocol;
- `routes/admin.py` — admin operations;
- `routes/feedback.py` — feedback persistence and email notification.

Большинство роутов напрямую вызывает Supabase client. `backend/services` содержит только отдельные AI prompt/validation/email helpers, а не полноценный application service layer.

## Supabase и данные

`backend/database.py` создаёт Supabase client через `SUPABASE_URL` и `SUPABASE_KEY`. Supabase Auth не используется.

Основные сущности:

- `users` — профили, email/password, Telegram fields, role/plan/ban fields;
- `games` — `id`, `kind`, visibility/ownership metadata и JSON `data`;
- `ratings` — оценки игр;
- `quiz_results`, `jeopardy_results`, `millionaire_results` — результаты одиночных игр;
- `online_quiz_results` — результаты Quiz-комнат;
- `password_resets`, `ai_usage`, `feedback`, `error_logs`, `ai_logs`, `settings` — служебные данные.

Точная production schema не хранится в репозитории и требует отдельной проверки в Supabase. `backend/models.py` — legacy SQLAlchemy-описание, не используемое текущими роутами; оно не отражает текущий persistence layer.

## Admin analytics

`/api/admin/dashboard` считает одно прохождение как одну строку в любой из `quiz_results`, `online_quiz_results`, `jeopardy_results` или `millionaire_results`. `online_sessions` включает только `online_quiz_results`; activity chart использует те же отфильтрованные result rows и даты в UTC, поэтому сумма `plays` по дням совпадает с KPI. Created games и distributions считают только существующие `games` rows, созданные в выбранном периоде; отдельной таблицы удаления/аудита нет, поэтому удалённые игры задним числом не восстанавливаются, а оставшиеся orphan results всё ещё входят в общий счётчик прохождений.

`active_users` — число существующих пользователей с `owner_id` у созданной игры, `user_id` у Quiz/Millionaire result или AI usage/log row в периоде. Online/Jeopardy rows без `user_id` не приписываются пользователям. AI request count использует полный `ai_usage` event set (с fallback на `ai_logs` при отсутствии usage), а model/tokens/success/error берутся из централизованного `ai_logs` telemetry.

## Authentication

Email/password flow:

1. Frontend вызывает `/api/auth/register` или `/api/auth/login`.
2. Backend читает/создаёт запись в `users`.
3. Backend выдаёт JWT HS256 с `sub=user_id`.
4. Frontend сохраняет JWT в `localStorage` и передаёт его как Bearer token.
5. Backend на каждом защищённом запросе декодирует JWT и заново читает пользователя из Supabase.

JWT stateless: logout удаляет токен на клиенте, server-side revocation не предусмотрен.

Password reset использует `password_resets` и Resend. Email reset link ведёт на frontend `/reset-password`.

## Telegram authentication

Telegram flow распределён между website, backend и `backend/bot.py`:

1. Website вызывает `/api/auth/telegram/start`.
2. Backend создаёт подписанный HMAC-токен сроком 5 минут. Токен может содержать существующий user ID или обозначать новый аккаунт.
3. Website открывает deep link Telegram bot.
4. Bot вызывает `/api/auth/telegram/bot-login` с Telegram user data.
5. Backend находит привязанный аккаунт, привязывает Telegram к существующему аккаунту или создаёт Telegram-only пользователя.
6. Bot возвращает ссылку `/login?telegram_token=...`.
7. Frontend вызывает `/api/auth/telegram/complete` и сохраняет обычный IslandQuiz JWT.

Токены stateless. `nonce` входит в подпись, но server-side replay prevention отсутствует. Telegram bot запускается как task внутри FastAPI процесса, поэтому deployment с несколькими polling instances требует отдельного решения.

## AI и file processing

AI вызывается через Groq OpenAI-compatible endpoint. Backend формирует prompts в `services/ai_prompts.py`, вызывает Groq в `routes/ai.py`, очищает/парсит JSON и для обычных quiz-вопросов валидирует структуру в `services/ai_validator.py`.

Поддерживаются:

- одиночные Quiz-вопросы;
- улучшение текущего текста;
- полный Quiz;
- Jeopardy categories;
- Jeopardy questions;
- Quiz из PDF/DOCX/TXT/MD.

AI не является источником истины для фактов: текущий validator проверяет структуру и ограничения формата, но не историческую или научную достоверность.

AI file endpoint принимает файлы до 10 MB с расширениями `.pdf`, `.docx`, `.txt`, `.md`.

- PDF: `pdfplumber`;
- DOCX: `python-docx`;
- TXT/MD: UTF-8 decode;
- отправляемый в prompt текст ограничивается первыми 5000 символами.

Файлы читаются в памяти и не сохраняются backend-кодом в Supabase.

Excel import/export выполняется на frontend библиотекой `xlsx`. PDF export как отдельный backend artifact отсутствует: frontend открывает print view браузера с возможностью Save as PDF.

## WebSocket rooms

Endpoint: `/ws/room/{code}`.

Frontend поддерживает reconnect/cache и отправляет actions из `frontend/src/lib/api.ts`. Backend хранит `rooms` и `connections` в глобальных in-memory dictionaries.

Для Quiz доступны lobby, join, start, answer, reveal, leaderboard, next question, finish, restart, kick и score adjustment. Для Jeopardy добавлены board/question/buzz/turn/final phases.

Комнаты:

- не записываются в Supabase;
- не переживают перезапуск процесса;
- не рассчитаны на shared state между несколькими workers;
- используют server-issued host/player credentials, role checks и server-side player identity;
- reconnect поддерживается только в памяти текущего процесса и в пределах короткого grace window.

## Основные пользовательские сценарии

### Создание и сохранение игры

Builder хранит игру в React state, draft — локально, а окончательное сохранение отправляет в `POST /api/games/`. Backend сохраняет весь game object в `games.data`.

### Одиночная игра

Player получает signed immutable snapshot, отправляет raw answers, а backend пересчитывает Quiz/Millionaire result из snapshot. Клиентский score не является доверенным.

### Онлайн Quiz/Jeopardy

Host создаёт комнату, игроки входят по четырёхзначному коду, состояние синхронизируется WebSocket-сообщениями, а room backend сохраняет online result из server-held state. Legacy direct online-result submit отключён.

### Library/profile/admin

Library читает public и owned games, profile показывает user data и игры, admin вызывает `/api/admin/*`. Доступ к admin backend проверяется по `role == "admin"`.

## Legacy documentation

Актуальными источниками считаются код и этот каталог `docs/`.

- `md/DATABASE_STRUCTURE.md` больше нельзя считать описанием текущей БД: он описывает SQLite и старые endpoint names.
- `md/AI_LOGIC.md` полезен как историческое описание UX, но его AI response contract устарел.
- Корневой `README.md` содержит устаревшее утверждение о Render и SQLite.
- `files.txt` — старый список файлов, не архитектурная документация.
