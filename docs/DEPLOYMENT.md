# IslandQuiz — deployment

Статус: production facts по состоянию на 2026-08-18. Детали, которых нет в репозитории и которые не были подтверждены владельцем, помечены `NEEDS VERIFICATION`.

## Production-схема

- Backend работает на собственном VPS.
- Render больше не используется для production backend.
- Домен и DNS управляются через Cloudflare.
- Production secrets, включая JWT secret, находятся на VPS и не хранятся в Git.
- Deployment выполняется вручную через SSH.
- После изменения кода изменения отправляются через Git.
- На VPS получается актуальное состояние репозитория.
- Backend перезапускается через `systemctl`.
- После перезапуска владелец проверяет работу приложения и API.

Frontend production URL, используемый backend/frontend кодом: `https://islandquiz.online`. API: `https://api.islandquiz.online`; WebSocket: `wss://api.islandquiz.online`.

## Что подтверждено репозиторием

- Frontend — Vite build с static deployment target в `frontend/vite.config.ts`.
- Backend запускается через Uvicorn согласно `backend/requirements.txt` и README quickstart.
- FastAPI root health endpoint существует: `GET /` возвращает имя и версию API.
- Backend startup запускает Telegram bot polling внутри того же процесса.
- CORS содержит production frontend domains и localhost `5173`.

## Ручной production flow

Фактическая последовательность:

1. Локально изменить код и проверить diff.
2. Отправить изменения в Git.
3. Подключиться к VPS по SSH.
4. Получить актуальное состояние репозитория на VPS.
5. При необходимости обновить backend dependencies.
6. Перезапустить backend через systemd.
7. Проверить `GET https://api.islandquiz.online/` и основные frontend/API сценарии.

Точные команды и пути намеренно не выдумываются: репозиторий не содержит deploy script, Dockerfile, Render config, systemd unit или SSH config.

## Environment и secrets

Backend использует, среди прочего:

- `SUPABASE_URL`;
- `SUPABASE_KEY`;
- `JWT_SECRET`;
- `TELEGRAM_AUTH_SECRET`;
- `TELEGRAM_BOT_TOKEN`;
- `OPENAI_API_KEY` для Groq;
- `RESEND_API_KEY`.

Реальные значения должны задаваться только на VPS/в окружении процесса. Не добавлять `.env`, ключи, JWT secrets или service-role credentials в Git или документацию.

Код backend не вызывает `load_dotenv`, поэтому наличие `.env` в checkout само по себе не означает, что Uvicorn его загрузит.

## NEEDS VERIFICATION

- Имя systemd unit: `islandquiz.service`.
- Команда перезапуска: `systemctl restart islandquiz.service` от имени production user `root`.
- SSH host/port: `77.221.137.100:22`; пользователь: `root`.
- Путь checkout репозитория на VPS: `/opt/islandquiz`.
- Production branch: `main`; workflow checkout-ит конкретный commit SHA.
- Способ запуска frontend production build/Cloudflare Pages deployment: `NEEDS VERIFICATION`.
- Production environment file: `/opt/islandquiz/backend/.env`.
- Используется один Uvicorn worker; это важно, потому что Telegram polling и in-memory rooms не рассчитаны на несколько независимых экземпляров.
- Точная post-deploy smoke-check процедура владельца: `NEEDS VERIFICATION`.

## Устаревшие deployment-ссылки

Корневой `README.md` всё ещё говорит, что backend работает на Render. Это больше не источник истины. FAQ frontend также содержит старый текст про Render и требует отдельного обновления при согласованном изменении пользовательской документации.

## Подготовленная автоматизация backend

В `.github/workflows/backend-deploy.yml` подготовлен workflow для `push` в `main`. Он выполняет syntax-check, подключается к VPS по SSH, получает и checkout-ит точный commit SHA, обновляет зависимости в существующем Python environment, перезапускает существующий systemd unit и проверяет `GET https://api.islandquiz.online/`.

Перед включением необходимо задать GitHub Secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS` и Variables `VPS_PORT`, `VPS_PROJECT_PATH`, `VPS_VENV_PATH`, `VPS_SYSTEMD_UNIT`. Для утверждённой topology значения Variables: `22`, `/opt/islandquiz`, `/opt/islandquiz/backend/venv`, `islandquiz.service`.

Workflow намеренно не создаёт пользователя, unit, environment file, virtualenv или SSH-ключи на VPS. Ручной `workflow_dispatch` с `target_sha` позволяет выполнить controlled rollback; H6 остаётся `IN_PROGRESS` до dry-run, SSH-проверки и rollback rehearsal.
