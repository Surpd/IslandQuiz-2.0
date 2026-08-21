# IslandQuiz — постоянные инструкции для AI-агентов

## Назначение проекта

IslandQuiz — веб-платформа для создания и проведения игр Quiz, Jeopardy и Millionaire. Пользователь может собирать игру в браузере, сохранять её в Supabase, проводить одиночное или онлайн-прохождение, получать результаты и использовать AI для генерации контента.

Этот файл описывает фактическое состояние репозитория. Перед изменением сложной или связанной части системы агент обязан изучить все связанные frontend/backend/API/БД-компоненты. Нельзя делать изолированное изменение на основании одного файла.

## Стек

- Frontend: React 19, TypeScript, Vite, TanStack Start/Router, Tailwind CSS, dnd-kit, KaTeX, `xlsx`.
- Backend: Python, FastAPI, Uvicorn, Pydantic, Supabase Python client.
- Auth: собственные JWT HS256 и bcrypt; Supabase Auth не используется.
- AI: Groq OpenAI-compatible API, переменная окружения `OPENAI_API_KEY`.
- Online rooms: live WebSocket state in FastAPI process plus resumable snapshots in Supabase `online_rooms`; connections remain process-local.
- Production: backend на VPS, frontend развернут как статическое приложение; домен и DNS управляются через Cloudflare.

## Структура

- `frontend/src/routes` — file-based маршруты и страницы.
- `frontend/src/components` — билдеры, плееры, комнаты и UI-компоненты.
- `frontend/src/lib/api.ts` — REST/WebSocket facade и контракты frontend ↔ backend.
- `frontend/src/lib/types.ts` — модели игр.
- `frontend/src/hooks` — auth context и draft autosave.
- `backend/main.py` — FastAPI app, CORS, routers и запуск Telegram bot task.
- `backend/routes` — API endpoints, auth, AI, results, rooms и admin.
- `backend/services` — AI prompts, AI validator и email helper.
- `backend/database.py` — создание Supabase client.

`backend/models.py` и документация в `md/` содержат legacy-остатки и не являются источником истины для текущего persistence-слоя.

## Команды

Frontend:

```powershell
cd frontend
npm install
npm run dev
npm run lint
npx tsc --noEmit
npm run build
npm run test:e2e
```

`npm run test:e2e` запускает текущий Playwright suite (41 tests), включая login → Quiz Builder → save → Library → reopen → offline player → answer/finish, mobile, preview/permissions, tags, imports, admin и room input regressions. Auth/games/results API responses в этих тестах замоканы для детерминированного локального запуска; suite не доказывает реальное backend/Supabase persistence, Telegram auth, provider availability, online-room restart, RLS или production result persistence.

Backend:

```powershell
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
python -m unittest discover -s tests -p 'test*.py'
```

Backend test suite является частью текущего baseline: **133/133** isolated tests проходят без production credentials/data. TypeScript baseline проходит; repository-wide `npm run lint` всё ещё содержит примерно 18 915 исторических CRLF/Prettier messages и не должен приниматься за runtime failure.

Backend ожидает переменные окружения. Код не загружает `.env` автоматически. Локальный запуск требует отдельно настроенного окружения и `JWT_SECRET`; startup также запускает Telegram bot и требует `TELEGRAM_BOT_TOKEN`.

## Архитектурные ограничения

- Каноническое хранилище игр, пользователей и результатов — Supabase через прямые вызовы `supabase.table(...)`. Не добавлять локальную БД или SQLAlchemy persistence без отдельного архитектурного решения.
- В проекте нет полноценного service/repository слоя: многие роуты напрямую работают с Supabase. Не переносить бизнес-логику между слоями без изучения всех consumers.
- Игра хранится одной JSON-структурой в `games.data`. Изменение её формы требует проверки трёх билдеров, трёх плееров, game dashboard, импортов/экспортов, online rooms, результатов и AI mapping.
- Frontend использует hardcoded production API/WS URLs в `frontend/src/lib/api.ts`; `VITE_API_URL` не является фактическим источником URL.
- Legacy localStorage-код всё ещё используется для draft/ID и сохранён в репозитории. Не удалять его изолированно.

## Database rules

- Сначала сверять фактические поля с текущими запросами роутеров и схемой Supabase. Additive migrations находятся в `supabase/migrations/`; production migration применяют только после read/review и проверки фактического результата.
- Проверять `None`, пустые `res.data` и ошибки API перед обращением к элементам результата.
- Не публиковать service-role ключ, JWT secret или другие ключи в коде, документации, логах и commit history.
- Live room connections не являются таблицей Supabase, но resumable room state хранится в `online_rooms`; raw credentials в persistence не записываются.

### Database context

`docs/DATABASE.md` — документированный snapshot схемы Supabase. Agents MUST consult it before database-related changes. Если задача зависит от текущей production schema или snapshot может устареть, сначала проверить Supabase напрямую. Никогда не угадывать имена таблиц/колонок/связей и не изменять production schema или data без явного approval владельца.

## Authentication и Telegram

- Email/password auth находится в `backend/routes/auth.py`; JWT передаётся как `Authorization: Bearer` и хранится frontend в `localStorage` под ключом `islandquiz.token`.
- Logout stateless: сервер не отзывает JWT, frontend удаляет токен.
- Telegram flow связан между `telegram_auth.py`, `bot.py`, login/register pages и `api.ts`. Изменять его только после изучения всей цепочки.
- Telegram login token подписан HMAC и действует 5 минут. Nonce хранится как hash в `telegram_login_nonces` и атомарно consume-ится один раз по type/expiry.
- Telegram bot запускается внутри FastAPI startup. Нельзя без проверки deployment запускать несколько polling workers.

## WebSocket rooms

- Протокол room actions и форма состояния определены совместно в `backend/routes/rooms.py` и `frontend/src/lib/api.ts`.
- Любое изменение action/state требует проверки host view, player view, Jeopardy components, reconnect logic и сохранения online results.
- Backend выдаёт server-side host/player credentials, связывает actions с role/player identity и проверяет host/player permissions. Не добавлять чувствительные actions без обновления этой модели и protocol tests.
- Live room connections process-local, но state/snapshot сохраняются в `online_rooms` с TTL 30 минут; abandoned rooms очищаются после reconnect grace/expiry.

## AI contracts

- AI endpoints находятся под `/api/ai`.
- `generate-question` и `improve-question` возвращают `{ "variants": [...] }`.
- `generate-quiz` возвращает объект с `title` и `questions`.
- Jeopardy endpoints возвращают JSON categories/questions; они парсятся, но проверяются слабее, чем обычный quiz.
- Структурный контракт обычных вопросов проверяется в `backend/services/ai_validator.py`. Не менять prompt и validator раздельно.
- При изменении типов вопросов обновлять prompt rules, validator, frontend types, builder mapping и плееры одновременно.

## Проверка изменений

После изменений агент обязан:

1. проверить `git diff` и убедиться, что изменены только файлы из согласованного scope;
2. запустить релевантные frontend type/lint/build checks;
3. для backend минимум проверить Python syntax и импорт/запуск в настроенном окружении;
4. проверить API contract consumers для затронутого endpoint;
5. отдельно проверить auth, rooms, AI и `games.data`, если изменение касается связанных участков.

## Secrets

**Не добавлять в Git production secrets, JWT secrets, API keys, `.env` и другие секретные значения. Никогда не записывать реальные значения секретов в документацию.**

## Документация

После существенного изменения архитектуры, API, auth, database schema, AI contract, rooms или deployment обновлять соответствующий файл в `docs/`. Старые документы `md/` можно сохранять как historical/legacy material, но актуальные документы должны явно указывать, что не является источником истины.

## Рабочий lifecycle backlog-задач

Этот репозиторий используется implementation agent для IslandQuiz. Для планирования и состояния задач использовать существующие документы:

- `AGENTS.md`;
- `docs/BACKLOG.md`;
- текущий work plan — `docs/WORKPLAN.md` (если файл будет переименован владельцем в `docs/WORK_PLAN.md`, правила применяются к нему);
- `docs/ARCHITECTURE.md`;
- `docs/AI.md`;
- `docs/DEPLOYMENT.md`;
- `docs/DECISIONS.md`.

Не проводить полный аудит проекта перед каждой задачей. Повторно изучать только затронутые компоненты, связанные документы и конкретные зависимости текущей backlog-задачи.
- `docs/CODEX_MODEL_GUIDE.md` — рекомендации по Codex model и reasoning effort для backlog-задач.
- `docs/ROADMAP.md` — краткая карта текущего состояния и ближайшего маршрута.

### Design-agent workflow

- Для любой UI/UX-задачи coding agent обязан прочитать `.agents/skills/islandquiz-design/SKILL.md`; для изменения тем, Builder Hero или themed motion — также `.agents/skills/islandquiz-theme-system/SKILL.md`.
- Крупные visual changes (новый экран, redesign нескольких компонентов, mobile navigation, theme/motion overhaul) сначала передавать read-only агенту `designer`; он автономно проходит DISCOVER → DIVERGE → CRITIQUE → SELECT → REFINE → PRESENT → HANDOFF, показывает рекомендуемый visual artifact и 2–3 сильные визуальные альтернативы, а затем останавливается на approval gate.
- Coding agent не начинает крупную реализацию до approval владельца, если владелец явно не попросил immediate implementation. После approval coding agent реализует только handoff, а существующий `reviewer` проверяет результат. Малые точечные UI-правки могут идти без полного designer pass, но не должны ломать зафиксированный visual language.

Каждая backlog-задача проходит lifecycle:

`BLOCKED → READY → IN_PROGRESS → DONE`

Перед началом работы:

1. Найти задачу в `docs/BACKLOG.md` и work plan.
2. Проверить её статус, зависимости, acceptance criteria и проверки.
3. Если задача `BLOCKED`, не начинать реализацию без необходимого решения владельца, доступа или завершения указанной зависимости.
4. Если задача `READY`, перед изменением кода перевести её в `IN_PROGRESS` в work plan.
5. Если в work plan используется промежуточный статус `DEPENDENCY`, сначала выполнить только разрешённую подготовку/исследование; реализацию начинать после перехода задачи в `READY`.

Во время реализации:

- работать только в scope текущей задачи;
- не выполнять несвязанный рефакторинг и улучшения;
- обнаруженную проблему другой backlog-задачи не смешивать с текущей работой;
- если проблема действительно необходима для текущей задачи, явно указать это в итоговом отчёте и обновить зависимость в work plan;
- не принимать молча архитектурные или продуктовые решения, которых нет в work plan или `docs/DECISIONS.md`.

### Existing quality baseline is not automatic task scope

- Существующие ESLint, Prettier, TypeScript, test, warning, formatting, line-ending, dependency, documentation и другие quality issues не входят в scope текущей задачи автоматически.
- Если проблема существовала до текущих изменений и не вызвана ими, не исправлять её автоматически и не расширять scope; её можно указать в итоговом отчёте как pre-existing baseline.
- Quality checks в первую очередь используются для обнаружения регрессий текущей задачи. Для изменённых файлов исправлять новые ошибки, непосредственно вызванные текущими изменениями, если это возможно без изменения scope и поведения.
- Массовое форматирование, изменение line endings, `eslint --fix`, массовый cleanup и dependency/config cleanup не выполнять как побочный эффект обычной задачи.
- Если baseline мешает объективно проверить задачу, предложить отдельную cleanup-задачу или запросить решение владельца. Не начинать cleanup самостоятельно и не проводить дорогостоящий исторический аудит только ради повторного доказательства baseline.
- В acceptance checks приоритет имеют typecheck, build, targeted tests, contract checks, diff inspection и отсутствие новых ошибок. Полный lint/test baseline может быть informational, если его ошибки pre-existing и не относятся к текущей задаче.
- Не отключать ESLint, Prettier, TypeScript или тесты для сокрытия ошибок; различать наличие quality tool и обязанность исправить весь исторический baseline.

## Обязательная проверка результата

После реализации обязательно:

1. Выполнить acceptance criteria текущей задачи.
2. Выполнить все проверки, указанные для неё в work plan.
3. Если затронут frontend, запустить:
   - `npx tsc --noEmit`;
   - `npm run lint` и отделить pre-existing baseline от новых ошибок текущей задачи;
   - `npm run build`.
4. Если затронут backend, выполнить доступные syntax/import/tests checks.
5. Для затронутых API проверить соответствующий frontend/backend contract и всех consumers.
6. Для security-related изменений добавить или обновить соответствующие tests.
7. Проверить `git diff` и `git status`.
8. Убедиться, что в изменениях нет secrets, `.env`, JWT secrets, service-role keys или production credentials.

Если обязательная проверка не прошла, задачу нельзя переводить в `DONE`.

## Обновление backlog и документации после задачи

Если задача полностью завершена:

- в work plan перевести её в `DONE`, сохранить краткий фактический результат и обновить только реально изменившиеся зависимости/статусы;
- в `docs/BACKLOG.md` отметить соответствующую задачу как `DONE` или `RESOLVED`, не удаляя её, и кратко описать решение;
- `docs/DECISIONS.md` обновлять только при новом или изменённом архитектурном решении либо новом важном системном ограничении;
- остальные документы обновлять только если фактическое поведение системы изменилось и прежнее описание стало неверным;
- не создавать новые документы без необходимости.

Если задача не завершена, оставить её в `IN_PROGRESS` и явно записать оставшуюся работу и причину.

## Git workflow для backlog-задач

После успешной реализации и всех проверок, только если владелец явно запросил commit/push:

1. Проверить `git diff`.
2. Проверить `git status`.
3. Убедиться, что commit содержит только изменения текущей задачи.
4. Создать один логический commit на одну завершённую backlog-задачу.
5. Использовать понятное commit message, например `fix(frontend): resolve TypeScript baseline errors` или `fix(auth): make Telegram login tokens single-use`.
6. После commit выполнить `git push` только если это явно запрошено владельцем.

Без явного запроса владельца не выполнять commit или push. Никогда не выполнять push напрямую в `origin/main`, если это явно не запрошено владельцем.

Без отдельного разрешения владельца запрещены:

- `git push --force`;
- `git reset --hard`;
- удаление веток;
- переписывание опубликованной истории;
- destructive database operations;
- изменения production infrastructure;
- изменение production secrets.

Эти операции требуют отдельного разрешения владельца. Обычный commit/push не даёт разрешения на production deploy.

`git push` не является ручным production deployment, но push в `main` с изменениями `backend/**` или `.github/workflows/backend-deploy.yml` запускает configured GitHub Actions backend deploy. Перед таким push проверить workflow scope; после push не выполнять дополнительно SSH, `git pull`, `systemctl restart` или другие direct production actions без отдельного запроса владельца.

### Default staging policy

Если владелец явно не сообщил о ручных или unrelated changes, считать текущие изменения результатом agent-assisted workflow и предпочитать практический staging вместо хирургического partial staging:

1. проверить `git status --short`;
2. исключить secrets, `.env`, private keys, build artifacts, caches, `node_modules`, `__pycache__` и temporary files;
3. stage-ить task-relevant files точным списком файлов/директорий;
4. при явном запросе проверить staged file list и создать commit/push.

Не тратить excessive time на сохранение гипотетических owner edits. Для docs/process задач допустимо stage-ить `AGENTS.md`, `docs/**` и `.github/workflows/**`, если это соответствует scope. Для code задач допустимо stage-ить все изменённые tracked source files, относящиеся к задаче. Не выполнять `git add .` без проверки status и staged file list.

Если есть явно обозначенные owner/manual changes или unrelated risky changes, остановиться и спросить владельца. Если `.git/index.lock` stale и активного Git-процесса нет, разрешено удалить только `.git/index.lock`.

Без отдельного разрешения запрещены `git reset --hard`, `git clean`, force push, rebase, destructive database operations и production operations. Цель — быстрый и практичный commit/push без over-engineering partial staging, когда владелец не пишет код вручную.

## Если требуется решение владельца

Если реализация требует решения, которого нет в work plan или `docs/DECISIONS.md`:

1. остановиться перед изменением, зависящим от этого решения;
2. объяснить проблему простыми словами;
3. предложить 2–3 конкретных варианта;
4. для каждого кратко указать плюсы, минусы, влияние на IslandQuiz и стоимость/сложность;
5. дать рекомендацию.

Не требовать от владельца технических знаний и не заставлять выбирать реализацию, которую можно безопасно определить самостоятельно.

## Итоговый отчёт по завершённой задаче

Каждый итоговый отчёт должен содержать:

1. задачу и её статус;
2. что изменено;
3. существенно изменившиеся файлы;
4. обновлённые документы;
5. выполненные проверки и их результат;
6. что сознательно не изменено;
7. Git commit hash;
8. выполнен ли `git push`;
9. какие задачи разблокированы;
10. какие решения нужны владельцу для следующей задачи.

Не повторять весь backlog и не проводить новый полный аудит после каждой задачи.

## Работа с work plan

Work plan — текущий порядок выполнения задач. Не перестраивать его после каждой мелкой реализации. Обновлять только затронутые зависимости и статусы, если завершение задачи действительно меняет доступность других задач.

Если обнаружена новая значимая проблема, которой нет в backlog:

- не исправлять её автоматически в рамках текущей задачи;
- добавить её в backlog только если она является отдельной задачей;
- связать её с текущей задачей, если существует реальная зависимость;
- сообщить об этом в итоговом отчёте.

Главный принцип: implementation agent самостоятельно реализует согласованные `READY`-задачи, проверяет результат, поддерживает backlog/work plan и Git history. Владелец принимает архитектурные и продуктовые решения, когда они действительно необходимы. Для однозначной `READY`-задачи не запрашивать разрешение на очевидные технические действия внутри согласованного scope.

## Scope-first: не переаудировать проект

Перед началом задачи сначала определить минимальный scope по `docs/BACKLOG.md`, `docs/WORKPLAN.md`, `docs/DECISIONS.md` и уже существующей документации.

Если необходимая информация уже зафиксирована в документации проекта или в предыдущем результате текущей задачи, не проводить повторный полный аудит. Не исследовать весь repository, backend, frontend, GitHub или Supabase, если задача затрагивает только конкретную часть системы.

Работать по принципу:

`task → required context → targeted inspection → implementation → verification`

## Supabase: targeted access only

Supabase не нужно исследовать целиком перед каждой задачей. Перед обращением к Supabase сначала определить конкретную необходимость:

- какие таблицы нужны;
- какие конкретные columns нужны;
- нужны ли RLS policies;
- нужны ли конкретные RPC/functions;
- нужны ли индексы или constraints.

Получать только необходимые данные. Не выполнять полный schema dump, полный аудит RLS, полный просмотр всех таблиц, функций или данных, если задача этого прямо не требует.

Если production schema уже описана в `docs/DATABASE.md` и этих данных достаточно для задачи, использовать документацию вместо повторного обращения к Supabase. Не читать реальные пользовательские данные, если достаточно metadata/schema.

Если требуется изменение production DB:

1. сначала выполнить read-only inspection;
2. сформировать предложение;
3. не менять production schema или data автоматически;
4. дождаться отдельного approval владельца.

## Git vs GitHub

Для обычной работы с кодом использовать локальные файлы и локальный Git repository. Приоритет:

`local files → local git status/diff/log → project documentation → GitHub only when actually required`

Не обращаться к GitHub только ради просмотра обычного кода, локального diff, локальной истории, определения изменённых файлов или текущей ветки.

GitHub использовать только когда задача действительно требует push/pull, GitHub Actions, pull request, issues, repository settings, remote-specific information, проверки remote state или release/deployment workflow, связанного с GitHub.

Push в настроенный remote всё равно требует явного запроса владельца; push напрямую в `origin/main` запрещён без такого запроса. Это не является production deployment.

## Лишние подтверждения

Не запрашивать подтверждение для обычного read-only действия в рамках текущей задачи. Commit и push выполнять только после явного запроса владельца, даже если они не связаны с production changes.

Если действие требует отдельного разрешения интерфейса, одной короткой фразой объяснить, зачем оно нужно. Не повторять уже подтверждённые факты.

## Контекст и лимиты

- Приоритет — минимально необходимое чтение.
- Не читать большие документы целиком, если достаточно конкретного раздела.
- Не выполнять широкие поиски по repository, если нужные файлы можно определить из work plan, backlog и decisions.
- Не запускать тяжёлые или широкие проверки только ради формального полного аудита, если они не являются acceptance check текущей задачи.
- Pre-existing проблемы не расширяют scope текущей задачи.

## Краткий user-facing summary

В конце задачи кратко объяснить:

- что было;
- что изменено;
- зачем;
- какие проверки прошли;
- что осталось.

Не пересказывать весь процесс исследования. Если техническое решение важно для понимания результата, объяснить его простыми словами в 1–3 предложениях.

## Обязательная проверка изменения AGENTS.md

После изменения этого файла:

1. проверить `git diff`;
2. убедиться, что application code не изменён;
3. выполнить `git diff --check`;
4. для текущей документальной задачи не выполнять commit или push, поскольку это не входит в запрошенный scope.

Для обычной завершённой backlog-задачи staging, commit и push выполняются только после явного запроса владельца; permission prompt ограничивать только необходимой операцией.

В рамках такого изменения запрещены любые изменения Supabase, GitHub, production или deployment.
