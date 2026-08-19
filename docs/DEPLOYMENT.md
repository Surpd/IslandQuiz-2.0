# IslandQuiz — deployment

Статус: production facts по состоянию на 2026-08-19. Детали, которых нет в репозитории и которые не были подтверждены владельцем, помечены `NEEDS VERIFICATION`.

## Production-схема

- Backend работает на собственном VPS.
- Render больше не используется для production backend.
- Домен и DNS управляются через Cloudflare.
- Production secrets, включая JWT secret, находятся на VPS и не хранятся в Git.
- Backend deploy выполняется GitHub Actions по SSH; frontend Cloudflare Pages — отдельный pipeline.
- Backend workflow получает и публикует точный commit SHA на VPS, обновляет зависимости и перезапускает `islandquiz.service`.
- Production secrets остаются только в `/opt/islandquiz/backend/.env`; GitHub Actions получает лишь SSH deploy secrets/variables.

Frontend production URL, используемый backend/frontend кодом: `https://islandquiz.online`. API: `https://api.islandquiz.online`; WebSocket: `wss://api.islandquiz.online`.

## Что подтверждено репозиторием

- Frontend — Vite build с static deployment target в `frontend/vite.config.ts`.
- Backend запускается через Uvicorn согласно `backend/requirements.txt` и README quickstart.
- FastAPI root health endpoint существует: `GET /` возвращает имя и версию API.
- Backend startup запускает Telegram bot polling внутри того же процесса.
- CORS содержит production frontend domains и localhost `5173`.

## Backend deployment flow

Фактическая последовательность:

1. Push в `main` с изменениями в `backend/**` или `.github/workflows/backend-deploy.yml` запускает `.github/workflows/backend-deploy.yml`.
2. Workflow валидирует Python syntax и проверяет exact 40-character target SHA.
3. На VPS он получает target SHA, устанавливает зависимости, проверяет syntax и перезапускает только `islandquiz.service`.
4. Blocking gates: `systemctl is-active`, local `GET http://127.0.0.1:8000/` с bounded retry и совпадение опубликованного Git HEAD с target SHA.
5. Запрос к `https://api.islandquiz.online/` выполняется как Cloudflare diagnostic. Для GitHub runner он может получить `403`; это warning, а не backend deploy failure.

Documentation-only и frontend-only push не запускают backend deploy. Ручной `workflow_dispatch` с полным `target_sha` публикует выбранный commit и является rollback capability.

## Environment и secrets

Backend использует, среди прочего:

- `SUPABASE_URL`;
- `SUPABASE_KEY`;
- `JWT_SECRET`;
- `TELEGRAM_AUTH_SECRET`;
- `TELEGRAM_BOT_TOKEN`;
- `OPENAI_API_KEY` для Groq;
- `GROQ_MODEL` для Groq model ID (рекомендуемое текущее значение: `qwen/qwen3.6-27b`);
- `RESEND_API_KEY`.

Реальные значения должны задаваться только на VPS/в окружении процесса. Не добавлять `.env`, ключи, JWT secrets или service-role credentials в Git или документацию.

Код backend не вызывает `load_dotenv`, поэтому наличие `.env` в checkout само по себе не означает, что Uvicorn его загрузит.

## NEEDS VERIFICATION

- Способ запуска frontend production build/Cloudflare Pages deployment: `NEEDS VERIFICATION`.
- Полный production rollback rehearsal ещё не проводился; он выделен в H6.1 и требует отдельного approval владельца.

## Устаревшие deployment-ссылки

Корневой `README.md` всё ещё говорит, что backend работает на Render. Это больше не источник истины. FAQ frontend также содержит старый текст про Render и требует отдельного обновления при согласованном изменении пользовательской документации.

## Действующая автоматизация backend

`.github/workflows/backend-deploy.yml` проверен на production deploy. Он запускается на backend/workflow push в `main` и вручную через `workflow_dispatch`, подключается к VPS по SSH с `StrictHostKeyChecking=yes`, получает и checkout-ит точный commit SHA, обновляет зависимости в существующем Python environment и перезапускает `islandquiz.service`.

Перед включением необходимо задать GitHub Secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS` и Variables `VPS_PORT`, `VPS_PROJECT_PATH`, `VPS_VENV_PATH`, `VPS_SYSTEMD_UNIT`. Для утверждённой topology значения Variables: `22`, `/opt/islandquiz`, `/opt/islandquiz/backend/venv`, `islandquiz.service`.

Workflow намеренно не создаёт пользователя, unit, environment file, virtualenv или SSH-ключи на VPS. `workflow_dispatch` с полным `target_sha` реализует controlled rollback; способность реализована, но production rehearsal не проводился и отслеживается H6.1.
