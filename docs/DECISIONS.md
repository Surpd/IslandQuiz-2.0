# IslandQuiz — архитектурные решения и ограничения

Это короткий список решений, которые важно учитывать при дальнейшей разработке. Это не история коммитов.

## Persistence

1. Supabase используется как основная база данных через Supabase Python client.
2. Supabase Auth не используется.
3. Пользователи аутентифицируются собственной JWT HS256-схемой.
4. Игры хранятся как JSON в поле `games.data`, а не как нормализованные question tables.
5. Результаты разделены по таблицам для Quiz, Jeopardy, Millionaire и online Quiz.

## Authentication

6. JWT stateless и хранится frontend в `localStorage`; logout не отзывает токен на сервере.
7. Telegram login — отдельный HMAC-signed deep-link flow, который в итоге выдаёт обычный IslandQuiz JWT.
8. Telegram bot сейчас запускается внутри FastAPI процесса, а не как независимый production service.
9. Telegram login token не имеет server-side одноразового consumption, несмотря на наличие nonce в payload.

### D1. Принятая политика JWT и сессий — RESOLVED

Целевая production-модель: короткоживущий access token, отдельный механизм продления сессии и server-side revoke/logout. При обращении к защищённым ресурсам учитываются revoked sessions и текущий статус пользователя: блокировка или удаление аккаунта инвалидируют ранее выданные сессии. Конкретные TTL, формат refresh-сессии, storage и rotation выбираются при реализации C4 в рамках этой политики.

## Games and rooms

10. WebSocket room state сейчас хранится только в памяти backend процесса.
11. Rooms не переживают restart и не имеют общего состояния между несколькими workers.
12. Состояние комнаты передаётся action-сообщениями между frontend и backend; изменение протокола требует синхронного изменения обоих компонентов.
13. Server-side authorization WebSocket actions ограничена; нельзя добавлять чувствительные операции, полагаясь только на frontend.

### D2. Принятая модель безопасности WebSocket player — RESOLVED

Анонимный вход по коду комнаты разрешён. Сервер выдаёт и проверяет отдельную identity игровой сессии игрока; reconnect восстанавливает только эту сессию. Игрок не может выдать себя за другого или менять чужое состояние. Host и player имеют разные права, а identity и permissions определяются сервером, не клиентскими полями. Конкретный формат guest credential и reconnect token выбирается при реализации C2; D4 для этого решения не требуется.

### D3. Принятые правила scoring и anti-cheat — RESOLVED

Сервер является источником истины для правильности ответов, очков и итогового результата. Клиентские `correct`, `score`, `delta` и итоговые значения не являются доверенными. Host adjustment допускается только как отдельная явно фиксируемая ручная корректировка, не смешанная с автоматическим scoring. Для подтверждения результата сохраняются ответы, применённый game snapshot/version и данные, достаточные для server-side пересчёта.

## AI

14. Groq вызывается через OpenAI-compatible API, хотя backend helper называется `call_openai`.
15. AI prompts и структурная валидация являются связанными частями: изменение одного без другого может сломать builders.
16. Validator проверяет форму AI JSON, но не фактологическую корректность контента.
17. AI file generation обрабатывает файлы в памяти и ограничивает отправляемый текст 5000 символами.

### D9. Политика AI — DEFERRED

Решение принято, но техническая реализация отложена. IslandQuiz не обещает абсолютную фактическую достоверность AI-generated content; AI используется как инструмент генерации и помощи. Модель и лимиты учитывают стоимость, unnecessary expensive calls следует избегать, а хранение prompt/logs — privacy и стоимость. Внешняя fact-checking инфраструктура сейчас не является обязательной частью продукта.

## Deployment and secrets

18. Production backend работает на собственном VPS.
19. Render больше не является production backend hosting.
20. Домен/DNS управляются через Cloudflare.
21. Deployment выполняется вручную через SSH, Git и systemd restart.
22. Production secrets находятся вне репозитория на VPS.
23. `.env`, JWT secrets, service-role keys и API keys никогда не добавляются в Git или документацию.

### D5. Принятая политика владения Supabase — RESOLVED

Production Supabase разрешено использовать для read-only аудита и получения фактической схемы. Изменения tables, columns, constraints, indexes, RLS, RPC/functions, migrations и production data требуют явного approval владельца. Агент сначала готовит безопасное предложение или migration и не применяет его самостоятельно.

### D6. Принятая семантика visibility — RESOLVED

`PRIVATE` доступна владельцу и явно разрешённым пользователям и не попадает в публичный каталог. `LINK` открывается по ссылке, но не считается публичной для каталога. `PUBLIC` доступна в публичном каталоге в рамках модели продукта. Fork создаёт независимую копию с новым владельцем, не расширяет доступ к исходной игре и не изменяет её. При редактировании сохраняется и применяется текущее значение visibility. Anonymous draft всегда имеет visibility `private`; anonymous пользователь не может выбрать `link` или `public`.

### D7. Принятая production topology и release policy — RESOLVED

Frontend: GitHub `main` → Cloudflare Pages. Backend: repository `https://github.com/Surpd/IslandQuiz-2.0.git`, branch `main`, VPS `77.221.137.100:22`, checkout `/opt/islandquiz`, systemd `islandquiz.service`, `WorkingDirectory=/opt/islandquiz/backend`, user `root`, Python 3.12, venv `/opt/islandquiz/backend/venv`, один Uvicorn worker. ExecStart: `/opt/islandquiz/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'`. Secrets находятся только в `/opt/islandquiz/backend/.env` на VPS.

Backend deployment сейчас ручной. Целевая контролируемая последовательность: push в `main` → deployment конкретного commit SHA → при необходимости обновление зависимостей → restart `islandquiz.service` → systemd status check → health check `https://api.islandquiz.online/`. Успешность подтверждается только после проверок; rollback выполняется на предыдущий успешный commit. CI/CD, Docker и автоматический production deploy в рамках этого решения не вводятся.

## Documentation source of truth

24. Фактический код и `docs/` — актуальные источники архитектурной информации.
25. `md/DATABASE_STRUCTURE.md`, `md/AI_LOGIC.md`, старые deployment statements в `README.md` и `files.txt` нельзя использовать как единственное описание текущей системы.
