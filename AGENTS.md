# IslandQuiz — постоянные инструкции для AI-агентов

## Назначение проекта

IslandQuiz — веб-платформа для создания и проведения игр Quiz, Jeopardy и Millionaire. Пользователь может собирать игру в браузере, сохранять её в Supabase, проводить одиночное или онлайн-прохождение, получать результаты и использовать AI для генерации контента.

Этот файл описывает фактическое состояние репозитория. Перед изменением сложной или связанной части системы агент обязан изучить все связанные frontend/backend/API/БД-компоненты. Нельзя делать изолированное изменение на основании одного файла.

## Стек

- Frontend: React 19, TypeScript, Vite, TanStack Start/Router, Tailwind CSS, dnd-kit, KaTeX, `xlsx`.
- Backend: Python, FastAPI, Uvicorn, Pydantic, Supabase Python client.
- Auth: собственные JWT HS256 и bcrypt; Supabase Auth не используется.
- AI: Groq OpenAI-compatible API, переменная окружения `OPENAI_API_KEY`.
- Online rooms: WebSocket-соединения FastAPI; состояние комнат хранится в памяти процесса.
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
```

Backend:

```powershell
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

В репозитории нет backend test suite и отдельной команды запуска backend-тестов. Текущий TypeScript check известен как не проходящий; после изменений его нужно запускать снова и отделять новые ошибки от существующих.

Backend ожидает переменные окружения. Код не загружает `.env` автоматически. Локальный запуск требует отдельно настроенного окружения и `JWT_SECRET`; startup также запускает Telegram bot и требует `TELEGRAM_BOT_TOKEN`.

## Архитектурные ограничения

- Каноническое хранилище игр, пользователей и результатов — Supabase через прямые вызовы `supabase.table(...)`. Не добавлять локальную БД или SQLAlchemy persistence без отдельного архитектурного решения.
- В проекте нет полноценного service/repository слоя: многие роуты напрямую работают с Supabase. Не переносить бизнес-логику между слоями без изучения всех consumers.
- Игра хранится одной JSON-структурой в `games.data`. Изменение её формы требует проверки трёх билдеров, трёх плееров, game dashboard, импортов/экспортов, online rooms, результатов и AI mapping.
- Frontend использует hardcoded production API/WS URLs в `frontend/src/lib/api.ts`; `VITE_API_URL` не является фактическим источником URL.
- Legacy localStorage-код всё ещё используется для draft/ID и сохранён в репозитории. Не удалять его изолированно.

## Database rules

- Сначала сверять фактические поля с текущими запросами роутеров и схемой Supabase. Миграций или SQL-схемы в репозитории нет.
- Проверять `None`, пустые `res.data` и ошибки API перед обращением к элементам результата.
- Не публиковать service-role ключ, JWT secret или другие ключи в коде, документации, логах и commit history.
- Комнаты не являются таблицей Supabase: `backend/routes/rooms.py` хранит их только в памяти backend-процесса.

## Authentication и Telegram

- Email/password auth находится в `backend/routes/auth.py`; JWT передаётся как `Authorization: Bearer` и хранится frontend в `localStorage` под ключом `islandquiz.token`.
- Logout stateless: сервер не отзывает JWT, frontend удаляет токен.
- Telegram flow связан между `telegram_auth.py`, `bot.py`, login/register pages и `api.ts`. Изменять его только после изучения всей цепочки.
- Telegram login token подписан HMAC и действует 5 минут. `nonce` подписывается, но не хранится и не помечается использованным; не считать токен одноразовым.
- Telegram bot запускается внутри FastAPI startup. Нельзя без проверки deployment запускать несколько polling workers.

## WebSocket rooms

- Протокол room actions и форма состояния определены совместно в `backend/routes/rooms.py` и `frontend/src/lib/api.ts`.
- Любое изменение action/state требует проверки host view, player view, Jeopardy components, reconnect logic и сохранения online results.
- Backend сейчас не выполняет полноценной server-side authorization команд комнаты. Не считать WebSocket-команды доверенными при добавлении чувствительных действий.
- Комнаты исчезают при потере последнего соединения или перезапуске процесса.

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

После успешной реализации и всех проверок:

1. Проверить `git diff`.
2. Проверить `git status`.
3. Убедиться, что commit содержит только изменения текущей задачи.
4. Создать один логический commit на одну завершённую backlog-задачу.
5. Использовать понятное commit message, например `fix(frontend): resolve TypeScript baseline errors` или `fix(auth): make Telegram login tokens single-use`.
6. После commit выполнить обычный `git push` в текущую рабочую ветку, если push для неё настроен.

Без отдельного разрешения владельца запрещены:

- `git push --force`;
- `git reset --hard`;
- удаление веток;
- переписывание опубликованной истории;
- destructive database operations;
- изменения production infrastructure;
- изменение production secrets.

`git push` не является production deployment. После push не выполнять автоматически SSH, `git pull`, `systemctl restart` и другие production deployment actions, если владелец отдельно этого не попросил.

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
