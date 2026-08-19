# IslandQuiz — рабочий план разработки

Статус плана: 2026-08-18. Основан на `docs/BACKLOG.md`, `docs/ARCHITECTURE.md`, `docs/AI.md`, `docs/DEPLOYMENT.md`, `docs/DECISIONS.md` и текущих `AGENTS.md`.

Этот документ не заменяет backlog. Backlog фиксирует проблемы, а здесь определены порядок работы, блокеры, конкретные результаты и проверки.

## Как читать статусы

- **READY** — реализацию можно безопасно начать сейчас.
- **DEPENDENCY** — можно начать исследование или подготовку, но завершение зависит от другой задачи или подтверждения контракта.
- **BLOCKED** — корректная реализация невозможна без решения владельца, доступа к production-инфраструктуре или завершения обязательного аудита.
- **DONE** — задача завершена и подтверждена фактическими проверками.

Для задач со статусом `DEPENDENCY` или `BLOCKED` техническое исследование не считается готовой реализацией.

## OWNER DECISIONS

Ниже решения, которые нужны для ближайшего security/contract/deployment цикла. D4 и D8 сознательно остаются отдельными открытыми решениями: они нужны главным образом для более позднего масштабирования комнат и legacy-уборки.

### D1. Политика JWT и сессий — `RESOLVED`

Проблема простыми словами: украденный токен сейчас может работать до своего истечения, а logout действует только в браузере. Без общей политики нельзя безопасно менять auth-код.

Принято: короткоживущий access token, механизм продления сессии и server-side revoke/logout; block/delete инвалидируют выданные сессии. Конкретные TTL, storage и rotation выбираются при C4.

Нужно для: C4, части M2 и security-тестов.

### D2. Модель безопасности WebSocket-игрока — `RESOLVED`

Проблема простыми словами: сервер не всегда знает, кто именно отправил команду игрока, поэтому клиент может выдать себя за другого или изменить чужое состояние.

Принято: anonymous join по коду разрешён; серверная identity игровой сессии связывает reconnect с тем же игроком, не позволяет spoofing или изменение чужого состояния, а host/player имеют разные права. Формат credential выбирается при C2; D4 не требуется.

Нужно для: C2, части C3 и H10. D4 для самой авторизации не требуется и будет решаться отдельно при работе с сохранением комнат.

### D3. Канонический scoring и anti-cheat — `RESOLVED`

Проблема простыми словами: сейчас браузер сообщает серверу правильность ответа и итоговые очки, поэтому результат можно подделать.

Принято: правильность, очки и итог пересчитываются сервером; client score/correct/delta не доверяются. Host adjustment допускается только как отдельная явно фиксируемая ручная корректировка. Сохраняются ответы и snapshot/version, достаточные для проверки результата.

Нужно для: C3, P2, P5 и связанных result-тестов.

### D5. Правила владения Supabase — `RESOLVED`

Проблема простыми словами: фактическая production-схема, RLS и RPC не находятся в репозитории, поэтому нельзя безопасно добавлять nonce-хранилище, constraints или атомарные операции на предположениях.

Принято: production Supabase используется агентом только для read-only аудита. Изменения схемы, RLS, RPC, migrations и production data требуют явного approval; агент готовит предложение/migration, но не применяет его. Read-only аудит для C5 выполнен и зафиксирован в `docs/DATABASE.md`.

Нужно для: C1, C5, M4, M6 и части H9. На первом этапе достаточно read-only доступа; это не означает немедленное изменение базы.

### D6. Семантика visibility и результатов — `RESOLVED`

Проблема простыми словами: значения `private`, `link` и `public` могут по-разному трактоваться при редактировании, fork, anonymous draft и просмотре результатов.

Принято: `PRIVATE` доступна владельцу и явно разрешённым пользователям, `LINK` — любому обладателю ссылки без публичного каталога, `PUBLIC` — публичному каталогу. Fork независим, получает нового владельца и не расширяет доступ к исходной игре; edit применяет текущее visibility.

Нужно для: H3, H9 и позже P4.

### D7. Deployment topology и release process — `RESOLVED`

Проблема простыми словами: неизвестно, сколько production-процессов запущено, как загружаются secrets и какой именно commit публикуется. Это особенно опасно для Telegram polling и in-memory rooms.

Принято: frontend публикуется из GitHub `main` через Cloudflare Pages; backend — `main` на `77.221.137.100:22`, checkout `/opt/islandquiz`, unit `islandquiz.service`, working directory `/opt/islandquiz/backend`, user `root`, Python 3.12, venv `/opt/islandquiz/backend/venv`, один Uvicorn worker и утверждённый ExecStart из `docs/DECISIONS.md`. Secrets остаются на VPS в `/opt/islandquiz/backend/.env`. Backend deploy автоматизирован GitHub Actions для изменений `backend/**` и workflow: он проверяет конкретный SHA, systemd и local health endpoint; `workflow_dispatch(target_sha)` реализует rollback capability. Full production rollback rehearsal вынесен в H6.1. Docker не вводится.

Нужно для: H5, M7 и M9.

### D9. AI product policy — `DEFERRED`

Проблема простыми словами: AI проверяет форму вопроса, но не гарантирует истинность фактов; кроме того, модель, лимиты и хранение prompt/logs влияют на стоимость и ответственность продукта.

Решение принято, реализация отложена: AI не гарантирует абсолютную фактическую достоверность; учитываются стоимость моделей/лимитов и privacy/стоимость prompt/log storage; unnecessary expensive calls следует избегать. Внешний fact-checking сейчас не обязателен.

Нужно для: H8, M5 и P3.

## План по этапам

### Now — начать сразу

#### H1. Устранить текущий TypeScript baseline — `DONE`

- **Фактический результат:** устранены исходные 9 TypeScript-ошибок в пяти frontend-файлах; сохранены текущие builder URLs, result URLs и auth behavior. Новые lint-проблемы, вызванные H1-правками, устранены локально.
- **Проверки завершения:** `npx tsc --noEmit`, `npm run build`, `git diff --check` — успешно; targeted lint проверен, оставшиеся сообщения относятся к pre-existing Prettier baseline. Полный frontend lint baseline намеренно не исправлялся и находится вне scope H1.
- **Зависимости:** нет; сохранять существующие URL и поведение, исправляя только типовые несоответствия.
- **Блокирующие D1–D9:** нет.
- **Техническое исследование до решения:** да, но оно короткое — зафиксировать текущие route search params и result URLs.
- **Файлы:** `frontend/src/components/site-header.tsx`, `frontend/src/routes/index.tsx`, `frontend/src/lib/auth.ts`, `frontend/src/routes/game.$id.tsx`, `frontend/src/routes/library.tsx`, TanStack Router route tree.
- **Готово, когда:** текущие 9 ошибок устранены без изменения пользовательских маршрутов и API-контрактов; типы nullable/search params отражают фактическое поведение.
- **Проверки:** `npx tsc --noEmit`, `npm run lint`, `npm run build`; отдельно проверить переходы library → game → result и auth redirect.

#### H2. Синхронизировать Admin API и frontend contract — `DONE`

- **Фактический результат:** инвентаризированы AI test, users, games, stats, limits и logs endpoints. Frontend users/games переведён с ошибочного ожидания массива на backend envelope `{users|games,total,limit,offset}`; добавлены typed admin response helpers в `api.ts`, передача `limit/offset` и prev/next pagination в обеих таблицах. Остальные методы, payload и error propagation совпадают и не менялись.
- **Блокирующие D1–D9:** нет отдельного D-решения; нужен небольшой product review списка admin-операций после инвентаризации.
- **Техническое исследование до решения:** да — полностью: сравнить backend, `api.ts` и admin UI без изменения контракта.
- **Файлы:** `backend/routes/admin.py`, `frontend/src/routes/admin.tsx`, `frontend/src/lib/api.ts`, admin types и pagination/AI lab UI.
- **Готово, когда:** каждая операция UI имеет один документированный backend contract, корректные ошибки и одинаковую форму данных; неиспользуемые вызовы удалены или явно отмечены.
- **Проверки:** targeted admin contract/flow checks, `python -m py_compile backend/routes/admin.py`, `npx tsc --noEmit`, `npm run build`, `git diff --check`, secret scan — успешно. Полный lint не запускался: pre-existing Prettier/ESLint baseline вне scope.

#### H7. Добавить автоматические проверки критических API и room flows — `DEPENDENCY`

- **Зависимости:** утверждённые контракты C1–C5, H2 и H3; test doubles/fixtures для Supabase и WebSocket.
- **Блокирующие D1–D9:** нет; ожидаемое security-поведение уточняется по утверждённым контрактам.
- **Техническое исследование до решения:** да — определить test runner, fixtures, границы mock и минимальный CI command.
- **Файлы:** `backend/routes/*`, `backend/services/*`, `frontend/src/lib/api.ts`, room clients и новые backend/frontend test fixtures.
- **Готово, когда:** критические auth, Telegram replay, permissions, results, visibility, AI и WebSocket transitions имеют воспроизводимые проверки.
- **Проверки:** один локальный командный запуск всех тестов; негативные случаи с `None`, пустыми ответами Supabase, invalid JSON и malformed actions; отсутствие секретов в fixtures и логах.

#### H8. Согласовать фактический AI contract и документацию — `DEPENDENCY`

- **Зависимости:** инвентаризация текущих shapes для Quiz, Jeopardy, improve и file flows; решение canonical JSON schema/error format.
- **H11 handoff:** Jeopardy endpoints пока возвращают raw parsed JSON без backend validator; H11 добавил frontend guard и controlled error, а server-side schema/error normalization остаётся scope H8.
- **Блокирующие D1–D9:** нет; техническая сверка и дальнейшая реализация зависят от contract tables.
- **Техническое исследование до решения:** да — сравнить `ai.py`, prompts, validator, `api.ts`, builders и `docs/AI.md`.
- **Файлы:** `backend/routes/ai.py`, `backend/services/ai_prompts.py`, `backend/services/ai_validator.py`, `frontend/src/lib/api.ts`, AI components/builders, `docs/AI.md`, `md/AI_LOGIC.md`.
- **Готово, когда:** один contract описывает input, success и error для всех AI endpoints; prompt, validator, mapping и документация согласованы.
- **Проверки:** fixtures для valid/invalid Quiz и Jeopardy responses, count/type/difficulty validation, improve/file flows; backend syntax/import, frontend `tsc`, lint, build.

#### H11. Починить end-to-end AI generation в Quiz Builder — `IN_PROGRESS`

- **Приоритет:** главный practical blocker для working product/demo.
- **Проблема:** full quiz generation падает с `Cannot read properties of undefined (reading 'map')`; per-question AI helper падает с `Cannot read properties of undefined (reading 'length')`.
- **Цель:** восстановить полный flow AI response → normalization/mapping → Quiz Builder state для full quiz и per-question generation; не маскировать TypeError защитной проверкой.
- **Рекомендуемая модель:** Terra / high, согласно `docs/CODEX_MODEL_GUIDE.md`.
- **Зависимости:** точечная сверка текущих success/error/empty response shapes; H8 остаётся отдельной задачей по canonical AI contract.
- **Файлы:** `frontend/src/components/ai-generate-quiz.tsx`, `frontend/src/components/ai-helper.tsx`, `frontend/src/routes/builder.quiz.tsx`, `frontend/src/lib/api.ts`, `backend/routes/ai.py`.
- **Готово, когда:** full quiz и per-question generation работают для валидного ответа, empty/incomplete response и API error; вопросы корректно попадают в builder; TypeError не возникает и не скрывается.
- **Проверки:** authenticated Quiz Builder smoke, full generation, helper для нескольких question types, invalid/empty/error fixtures, `npx tsc --noEmit`, targeted lint/build и сохранение результата.
- **Граница scope:** если потребуется менять canonical AI schema или `games.data`, остановиться и обновить зависимость H8; не начинать архитектурное изменение в H11.
- **Фактический результат:** production Groq response подтвердил root cause: configured `llama-3.3-70b-versatile` больше недоступна текущему key (`model_not_found`). Strict backend validation из `6f6b3d6` маскировал provider error как invalid Quiz/variants, но не был первопричиной. Qwen JSON-mode probe с full prompt вернул valid `{title, questions}` с 10 вопросами; H11 использует `response_format: json_object`, configurable `GROQ_MODEL` и controlled 502 для provider/parser failures. Successful authenticated smoke, сохранение и play остаются обязательными.
- **Проверки:** current-key Groq model listing; Qwen JSON-mode probes для full Quiz (10 questions) и helper (3 variants); Python syntax, `npx tsc --noEmit`, `npm run build`, `git diff --check`. `npm run lint` не проходит на существующем общем Prettier/ESLint baseline (2145 problems), не исправлявшемся в H11.

#### H10. Ограничить доверие к WebSocket input и стабилизировать protocol validation — `DEPENDENCY`

- **Зависимости:** сначала описать state machine и все action/state fields; реализация следует после C2 и согласования scoring/room protocol.
- **Блокирующие D1–D9:** нет; inventory и schema draft доступны, завершение зависит от C2 и protocol/scoring contracts.
- **Техническое исследование до решения:** да — собрать таблицу действий Quiz/Jeopardy, полей, фаз, лимитов и ошибок.
- **Файлы:** `backend/routes/rooms.py`, `frontend/src/lib/api.ts`, Quiz/Jeopardy room components, reconnect/cache logic.
- **Готово, когда:** сервер валидирует shape, phase, IDs, bounds, размер/частоту сообщений и повторные действия; frontend отправляет только допустимые actions.
- **Проверки:** valid/invalid action tests, replay/out-of-order/oversized message tests, state transition tests для Quiz и Jeopardy, reconnect regression.

#### M3. Создать единый typed API/contract source of truth — `DEPENDENCY`

- **Зависимости:** результаты H2, H8 и H10; до выбора генерации типов нужен реестр текущих REST/WebSocket контрактов.
- **Блокирующие D1–D9:** нет; выбор OpenAPI-generated или versioned manual contract нельзя делать до стабилизации базовых shapes.
- **Техническое исследование до решения:** да — сравнить стоимость и покрытие обоих подходов на одном admin, AI и room contract.
- **Файлы:** FastAPI request/response models, `frontend/src/lib/api.ts`, `frontend/src/lib/types.ts`, WebSocket action/state types, `docs/*`.
- **Готово, когда:** изменение request/response shape вызывает type/test failure до runtime, а версия контракта и compatibility policy описаны.
- **Проверки:** generated/manual type check, compile-time fixtures, REST contract tests, WebSocket serialization tests, `tsc` и backend import check.

На этом этапе параллельно можно подготовить инвентаризации C1–C5 и H3–H6: replay flow, room identity, scoring inputs, auth lifecycle, Supabase read-only checklist, visibility transitions и production facts. Это не требует изменения кода или принятия новых архитектурных решений.

### Next — после ближайших решений

#### C1. Сделать Telegram login token одноразовым — `BLOCKED`

- **Зависимости:** D5, read-only проверка production schema и выбор server-side storage/атомарного consume.
- **Блокирующие D1–D9:** нет; production schema change/nonce storage требует отдельного approval владельца после подготовки предложения.
- **Техническое исследование до решения:** да — описать bot-login/complete flow, replay points и варианты atomic consume; production implementation нет.
- **Файлы:** `backend/routes/telegram_auth.py`, `backend/bot.py`, frontend Telegram login flow, выбранная таблица/механизм nonce.
- **Готово, когда:** один токен принимается ровно один раз, expired/unknown/replayed token получает безопасную ошибку, параллельные запросы не проходят дважды.
- **Проверки:** valid token, expiry, replay через оба endpoint, parallel consume race, bot-to-web completion и отсутствие утечки токена в логах.

#### C4. Закрыть базовые риски JWT-аутентификации — `DONE`

- **Фактический результат:** backend выдаёт 1-часовой access token, требует `sub` и `exp`, принимает только HS256, повторно проверяет наличие и `banned` пользователя на каждом protected-запросе; frontend централизует token storage и очищает сессию при `401`.
- **Граница scope:** C4 закрывает базовую JWT-защиту; server-side session lifecycle вынесен в отдельную будущую C4.1 и не является blocker’ом для C4.
- **Техническое исследование до решения:** да — составить lifecycle matrix текущего JWT и определить места проверки пользователя.
- **Файлы:** `backend/routes/auth.py`, `frontend/src/lib/auth.ts`, `frontend/src/hooks/use-auth.tsx`, Bearer middleware/helpers, users schema.
- **Проверки:** valid/expired/wrong-algorithm token, banned/deleted user, protected endpoint matrix; `tsc`, build, backend syntax.

#### C4.1. Ввести server-side session lifecycle: refresh и revoke/logout — `DEPENDENCY`

- **Статус:** будущая задача; не является blocker’ом для DONE-защиты C4.
- **Зависимости:** отдельное решение по persistent session storage; вероятно потребуется изменение production Supabase schema и отдельное approval владельца.
- **Acceptance direction:** login создаёт server-side session; access token остаётся короткоживущим; refresh выдаёт новый access token; logout отзывает session; revoked/expired refresh token и повторное использование отозванного refresh token безопасно блокируются; при необходимости отзываются все sessions пользователя; secrets и raw refresh tokens не попадают в логи.
- **Проверки:** login/refresh/logout, expiry/revocation/replay refresh token, revoke-all, повторный login и отсутствие secret/token утечек в логах.

#### H3. Исключить потерю visibility при редактировании игры — `DONE`

- **Зависимости:** D6; затем проверить create/edit/fork/anonymous draft и источник значения visibility.
- **Блокирующие D1–D9:** нет.
- **Техническое исследование до решения:** да — проследить builder state, localStorage и payload save без изменения поведения.
- **Файлы:** `frontend/src/components/builder-actions.tsx`, `frontend/src/lib/api.ts`, `backend/routes/games.py`, edit flows builders, `games.visibility`.
- **Готово, когда:** `private`, `link`, `public` сохраняются и редактируются предсказуемо; stale localStorage не перезаписывает актуальное server value.
- **Проверки:** create/edit/fork для всех трёх visibility, anonymous draft, reload и multi-tab stale value regression; API payload assertions.
- **Фактический результат:** server visibility стала источником истины для edit; stale localStorage больше не участвует в save; create/copy/fork и anonymous draft используют предсказуемое значение согласно D6.

#### H5. Зафиксировать безопасную topology для Telegram polling — `DONE`

- **Зависимости:** D7 и подтверждение числа workers/instances на VPS.
- **Блокирующие D1–D9:** нет.
- **Техническое исследование до решения:** да — сверить `main.py`, bot startup и systemd/Uvicorn факты.
- **Файлы:** `backend/main.py`, `backend/bot.py`, `backend/routes/telegram_auth.py`, systemd/Uvicorn deployment.
- **Готово, когда:** production запускает ровно допустимое число polling consumers, duplicate polling невозможен или явно предотвращён, login flow не теряет события.
- **Проверки:** startup smoke, duplicate-instance test/guard, Telegram bot login smoke, systemd/Uvicorn configuration review.
- **Фактический результат:** `main.py` создаёт ровно одну polling task на backend-процесс, `bot.py` содержит единственный `start_polling`, а D7 фиксирует один `islandquiz.service` instance с одним Uvicorn worker. Дополнительных polling consumers нет; Telegram login flow bot → `bot-login` → frontend → `complete` не изменён и topology не нарушает.
- **Выполненные проверки:** точечный review startup/bot/auth цепочки и systemd/Uvicorn facts из D7; duplicate polling при утверждённой single-instance topology не возникает. Код не изменялся.

#### H6. Сделать production deployment повторяемым и проверяемым — `DONE`

- **Результат:** GitHub Actions deploy-ит exact commit SHA на VPS, обновляет зависимости, проверяет syntax, перезапускает только `islandquiz.service`, ждёт local backend health на `127.0.0.1:8000` и сверяет опубликованный SHA. Secrets остаются на VPS; Actions использует только deploy secrets/variables.
- **Проверки:** production deploy успешен; прошли exact SHA, dependencies, syntax, systemd status и blocking local health gate. Cloudflare URL из GitHub runner иногда возвращает `403`, поэтому остаётся diagnostic warning, а не deployment gate. Frontend Cloudflare Pages не участвует в backend workflow.
- **Rollback:** `workflow_dispatch` с полным `target_sha` реализован. Полный production rollback rehearsal сознательно перенесён в H6.1.

#### H6.1. Провести controlled production rollback rehearsal — `DEPENDENCY`

- **Зависимости:** отдельный approval владельца на production rollback.
- **Готово, когда:** workflow вручную публикует предыдущий подтверждённый SHA, проходят exact SHA/systemd/local health checks, затем workflow возвращает актуальный SHA с теми же проверками.
- **Проверки:** два ручных `workflow_dispatch`; Cloudflare URL остаётся diagnostic и не блокирует backend rollback.

#### H9. Ввести единый контроль доступа к результатам и online results — `DEPENDENCY`

- **Зависимости:** D6, D5 и аудит identity/production schema; затем единая matrix owner/non-owner/admin/public/link.
- **Блокирующие D1–D9:** нет; остаются identity/schema audit и authorization matrix.
- **Техническое исследование до решения:** да — инвентаризация всех result branches и полей PII возможна сейчас.
- **Файлы:** `backend/routes/results.py`, `backend/routes/games.py`, frontend results/dashboard/profile routes, result tables.
- **Готово, когда:** один принцип доступа действует одинаково для Quiz, Jeopardy, Millionaire и online results; userId из клиента не расширяет права.
- **Проверки:** owner/non-owner/admin/anonymous/link tests, cross-user ID tampering, PII exposure checks, empty/error Supabase responses.

После закрытия D1/D2/D3/D5/D6/D7 C4 закрыта, а C4.1 остаётся отдельной зависимой задачей; H3 и H5 можно запускать, H6 завершена, C2 также готова к реализации. C1 требует отдельного approval для production storage/migration. H9 переходит в подготовку после завершения identity/schema audit. C3, H10, M5 и P3 больше не заблокированы решениями, но зависят от C2, H8 и соответствующих контрактов.

### Blocked — не реализовывать до снятия блокеров

#### C2. Server-side authorization WebSocket-комнат — `READY`

- **Зависимости:** D2; затем матрица host/player permissions, JWT/guest identity в WS и протокол reconnect.
- **Блокирующие D1–D9:** нет.
- **Техническое исследование до решения:** да — подготовить threat model и action permission matrix.
- **Файлы:** `backend/routes/rooms.py`, `frontend/src/lib/api.ts`, host/player room views, reconnect logic, protocol/state types.
- **Готово, когда:** сервер сам определяет участника и право каждой команды; client-supplied `hostId`, `playerId`, score и phase не являются источником доверия.
- **Проверки:** spoofed identity, unauthorized start/kick/finish/score, guest join/reconnect, host/player permission matrix, multi-client WS integration.

#### C3. Перенести расчёт результата на доверенную сторону — `DEPENDENCY`

- **Зависимости:** D2, D3 и C2; нужен versioned game snapshot и единые правила для трёх форматов.
- **Блокирующие D1–D9:** нет; завершение зависит от C2 и versioned game snapshot.
- **Техническое исследование до решения:** да — каталогизировать scoring inputs и result payloads всех players/rooms.
- **Файлы:** players трёх форматов, `backend/routes/results.py`, `backend/routes/rooms.py`, `games.data`, `frontend/src/lib/api.ts`, result tables.
- **Готово, когда:** сервер независимо пересчитывает score из snapshot и ответов; подмена `correct`, `delta`, `score` или history не меняет итог.
- **Проверки:** golden fixtures для Quiz/Jeopardy/Millionaire, tampered payloads, duplicate submit, online/standalone parity, old snapshot regression.

#### C5. Аварийная проверка Supabase schema, RLS и ограничений — `DONE`

- **Зависимости:** D5 и read-only доступ к production Supabase; read-only аудит выполнен.
- **Блокирующие D1–D9:** нет; read-only audit уже завершён.
- **Техническое исследование до решения:** выполнено — production metadata audit и code-to-schema mapping.
- **Файлы:** `backend/database.py`, все routers, `games.data`, users/results/AI/settings/log tables, Supabase policies и RPC.
- **Готово, когда:** зафиксированы реальные таблицы, поля, nullable, keys, indexes, RLS и RPC; расхождения оформлены в `docs/DATABASE.md` без изменений production.
- **Проверки:** read-only schema export, route/query mapping, RLS/policy inventory, constraint/index/RPC inventory; metadata reads без изменения production. RLS owner/non-owner behavior не выполнялся: это потребовало бы credentials/test actors и не нужно для документационного snapshot.

#### H4. Не терять комнаты при restart и не допустить split-brain — `BLOCKED`

- **Зависимости:** D4 и D7; нужно выбрать single-worker ограничение или внешний room store/pub-sub, а также TTL/versioning.
- **Блокирующие D1–D9:** D4 (отложено до отдельного решения владельца).
- **Техническое исследование до решения:** да — измерить текущий lifecycle комнаты, worker topology и reconnect failure modes.
- **Файлы:** `backend/routes/rooms.py`, deployment/systemd/Uvicorn, host/player views, reconnect logic, online results.
- **Готово, когда:** выбранная topology не теряет или явно корректно завершает комнату при restart и не допускает расходящихся состояний между workers.
- **Проверки:** restart test, two-worker test, concurrent actions/version conflict, TTL cleanup, reconnect and result finalization.

#### M4. Унифицировать обработку ошибок и пустых ответов Supabase/API — `DEPENDENCY`

- **Зависимости:** C5; сначала карта реальных ошибок и полей, затем стабильный HTTP error mapping.
- **Блокирующие D1–D9:** нет; C5 и read-only schema audit уже выполнены.
- **Техническое исследование до решения:** да — найти прямые обращения к `res.data`, `data[0]`, nullable fields и frontend error branches.
- **Файлы:** `backend/database.py`, затронутые routers/services, frontend API facade и error UI.
- **Готово, когда:** empty/None/error от Supabase не превращаются в случайный 500 или частичное сохранение; frontend получает понятную стабильную ошибку.
- **Проверки:** empty result, `None`, DB error, duplicate/constraint error, timeout и malformed response tests; backend syntax и frontend checks.

#### M5. Довести Jeopardy AI до уровня обычного Quiz — `DEPENDENCY`

- **Зависимости:** H8 и D9; утвердить required fields, points, difficulty и slot count.
- **Блокирующие D1–D9:** нет; остаётся зависимость от H8.
- **Техническое исследование до решения:** да — собрать реальные Jeopardy response shapes и builder assumptions.
- **Файлы:** `backend/routes/ai.py`, `backend/services/ai_prompts.py`, `backend/services/ai_validator.py`, Jeopardy AI components и builder mapping.
- **Готово, когда:** invalid category/question JSON отклоняется до builder, valid response имеет точное число slots и допустимые points.
- **Проверки:** missing fields, wrong points/difficulty/count, malformed JSON, valid category/question fixtures, frontend no-crash mapping.

#### M6. Ввести индексы, constraints и безопасные RPC по фактической схеме — `BLOCKED`

- **Зависимости:** C5 и D5; сначала schema diff, затем отдельное согласование DDL/RPC/RLS.
- **Блокирующие D1–D9:** нет; DDL/RPC/RLS выполняются только после отдельного approval владельца.
- **Техническое исследование до решения:** частично — performance/query inventory можно начать без DDL.
- **Файлы:** Supabase PostgreSQL, backend queries, `ai_usage`, users/games/results/settings.
- **Готово, когда:** индексы и constraints подтверждены фактической схемой, race-prone операции атомарны, миграции обратимы или имеют rollback.
- **Проверки:** migration dry-run, constraint violation tests, concurrent usage/insert tests, query plan review, RLS regression.

#### M10. Закрыть RLS и policy gaps после фиксации модели identity — `DEPENDENCY`

- **Зависимости:** D5 и решение о Supabase JWT identity versus privileged backend client; затем owner/non-owner policy tests.
- **Блокирующие D1–D9:** нет; остаются identity choice, C4 и policy tests.
- **Техническое исследование до решения:** выполнено частично — gaps и текущие `auth.uid()` policies зафиксированы в `docs/DATABASE.md`; production DDL не выполнялся.
- **Файлы:** Supabase RLS/policies, `backend/database.py`, auth identity и admin/results routes.
- **Готово, когда:** каждая public application table имеет намеренно выбранный RLS режим и policies, а backend/frontend access tests подтверждают owner/non-owner/admin behavior.
- **Проверки:** policy matrix, anon/authenticated/backend-role reads and writes, negative cross-user cases, security advisor; без изменения production до approval.

#### M11. Согласовать referential integrity для result tables — `DEPENDENCY`

- **Зависимости:** D3, H9 и решение о retention/cascade behavior; перед DDL нужен orphan-data audit.
- **Блокирующие D1–D9:** нет; остаются H9, retention/cascade decision и отдельное approval для DDL.
- **Техническое исследование до решения:** выполнено — result `game_id` links используются backend, но FK отсутствуют.
- **Файлы:** `backend/routes/results.py`, `backend/routes/games.py`, result tables и Supabase constraints.
- **Готово, когда:** выбранный restrict/cascade/history policy документирован, orphan rows обработаны безопасно, а constraint не ломает delete и result flows.
- **Проверки:** orphan audit, delete-game behavior, result insert for all four formats, FK violation and rollback checks; DDL только после approval.

#### M7. Добавить CI quality gates и безопасную проверку зависимостей — `DEPENDENCY`

- **Зависимости:** H1 и H7; нужен минимальный release/branch policy из D7.
- **Блокирующие D1–D9:** нет; остаются H1/H7 и release implementation.
- **Техническое исследование до решения:** да — перечислить команды, duration и секреты, необходимые для CI.
- **Файлы:** frontend scripts, backend requirements, CI/repository settings, deployment checklist.
- **Готово, когда:** clean checkout автоматически запускает lint, typecheck, build, backend syntax/tests и dependency audit; failing gate блокирует release согласно policy.
- **Проверки:** CI на clean checkout, intentional failure cases, lockfile/dependency audit, secrets scan, artifact build.

#### M9. Укрепить monitoring, health checks и audit logging — `DEPENDENCY`

- **Зависимости:** H6 завершена; нужны monitoring budget/retention и список допустимых PII.
- **Блокирующие D1–D9:** нет; остаётся отдельная policy по monitoring/retention/PII.
- **Техническое исследование до решения:** частично — инвентаризация health endpoint, logs и потенциальных secret leaks доступна сейчас.
- **Файлы:** `backend/main.py`, error/AI logs, VPS/Cloudflare/UptimeRobot, admin logs UI, deployment docs.
- **Готово, когда:** deployment, Telegram, AI, Supabase и WS failures имеют обнаруживаемый сигнал без записи secrets/лишней PII.
- **Проверки:** health/alert smoke, log redaction, correlation ID propagation, failed dependency simulation, retention check.

#### P1. Восстановление онлайн-игры после disconnect — `BLOCKED`

- **Зависимости:** C2, H4 и D4; нужен session/resume protocol и решение о persistent room store.
- **Блокирующие D1–D9:** D4.
- **Техническое исследование до решения:** да — описать reconnect/cache failure modes и требования к idempotency.
- **Файлы:** room backend, reconnect logic, host/player views, result finalization, storage/pub-sub.
- **Готово, когда:** краткий disconnect сохраняет участника и состояние по выбранной policy, повторное подключение не дублирует ответы/result.
- **Проверки:** network drop/reconnect, duplicate resume, stale client, host reconnect, restart behavior согласно D4, result once-only.

#### P2. Версионирование игры и snapshot для результатов — `DEPENDENCY`

- **Зависимости:** C3, H3 и D3; определить version increment, retention и snapshot size.
- **Блокирующие D1–D9:** нет; остаются C3/H3 и versioning/retention.
- **Техническое исследование до решения:** да — найти все места чтения `games.data` и формирования result payload.
- **Файлы:** builders, `games` persistence, players, result tables, dashboards, online rooms.
- **Готово, когда:** каждый результат ссылается на неизменяемую версию/snapshot, а edit игры не меняет смысл старого результата.
- **Проверки:** edit-after-play, old-version replay, snapshot integrity, storage/retention, standalone/online result consistency.

#### P3. Улучшить AI review workflow — `DEPENDENCY`

- **Зависимости:** H8 и D9; нужен продуктовый уровень предупреждений и ответственность пользователя за фактологию.
- **Блокирующие D1–D9:** нет; остаётся зависимость от H8 и product implementation.
- **Техническое исследование до решения:** да — инвентаризация текущих review/edit/regenerate states.
- **Файлы:** AI components, builders, `backend/services/ai_validator.py`, prompts, usage/AI logs, warning UI.
- **Готово, когда:** пользователь видит границы AI-проверки, может проверить/изменить вопрос до save, а предупреждения не теряются при reroll.
- **Проверки:** review-before-save, edit/regenerate, invalid/factually uncertain warning states, usage/error logging and UI regression.

#### P4. Полноценные share/invite flows для игр и комнат — `BLOCKED`

- **Зависимости:** H3, C2, H4 и D6; нужен lifetime/revoke policy для link tokens и room invites.
- **Блокирующие D1–D9:** D4.
- **Техническое исследование до решения:** да — можно описать текущие visibility, join route и room code flows.
- **Файлы:** library, game routes, builder actions, join route, room backend/frontend, visibility.
- **Готово, когда:** share link/QR/invite имеют предсказуемые права, expiration/revoke и понятный UX для private/link/public.
- **Проверки:** access matrix, expired/revoked links, QR join, unauthorized room join, mobile/share regression.

#### P5. Расширить аналитику автора и результаты — `DEPENDENCY`

- **Зависимости:** C3, P2, C5 и privacy policy; нельзя строить метрики на недоверенном score.
- **Блокирующие D1–D9:** нет; остаются C3/P2/C5 и privacy implementation.
- **Техническое исследование до решения:** да — инвентаризация доступных result fields и существующих dashboard queries.
- **Файлы:** results routes/tables, dashboards, players, online results, frontend charts/export.
- **Готово, когда:** метрики считаются из trusted snapshot/scoring, не раскрывают лишнюю PII и одинаковы для standalone/online.
- **Проверки:** aggregate correctness fixtures, privacy/access matrix, time/completion/attempt metrics, export consistency.

### Later — пока не имеет смысла трогать

#### M1. Убрать двусмысленность вокруг legacy `backend/models.py` — `BLOCKED`

- **Зависимости:** проверить imports/entry points; затем D8 — удалить, архивировать или явно пометить deprecated.
- **Блокирующие D1–D9:** D8.
- **Техническое исследование до решения:** да — dependency/import scan и список ссылок в onboarding можно сделать сейчас.
- **Файлы:** `backend/models.py`, `backend/requirements.txt`, `docs/ARCHITECTURE.md`, `README.md`, onboarding.
- **Готово, когда:** ни один runtime path не зависит от legacy-моделей, а выбранный статус файла очевиден разработчику.
- **Проверки:** import/startup smoke, clean backend install, `rg` по imports/references, documentation link check.

#### M2. Развести legacy localStorage и каноническое состояние — `BLOCKED`

- **Зависимости:** D1 и D8, политика draft migration, TTL/cleanup и multi-tab conflict.
- **Блокирующие D1–D9:** D8.
- **Техническое исследование до решения:** да — карта storage keys, владельцев данных и stale-value paths.
- **Файлы:** `frontend/src/hooks/use-draft.ts`, `frontend/src/lib/storage.ts`, `frontend/src/lib/auth.ts`, builders, `builder-actions.tsx`, backend save flows.
- **Готово, когда:** draft/ID/visibility/auth не конфликтуют между вкладками и пользователями, а migration/cleanup безопасны.
- **Проверки:** reload, expired draft, multi-tab conflict, logout/login user switch, edit/save visibility regression, localStorage migration tests.

#### M8. Обновить документацию и удалить устаревшие operational утверждения — `BLOCKED`

- **Зависимости:** H6 завершена; остаются H8 и D8. Нельзя удалять legacy material до определения его historical/deprecated статуса.
- **Блокирующие D1–D9:** D8; содержательные обновления зависят от H8.
- **Техническое исследование до решения:** да — список устаревших Render/SQLite/старых AI claims доступен сейчас.
- **Файлы:** `README.md`, `md/DATABASE_STRUCTURE.md`, `md/AI_LOGIC.md`, `docs/*`, frontend FAQ.
- **Готово, когда:** operational docs соответствуют VPS/Supabase/Groq, legacy документы явно помечены, а ссылки не ведут к ложным инструкциям.
- **Проверки:** grep/search по устаревшим claims, документационные link checks, manual onboarding/deployment walkthrough.

#### P6. Accessibility/mobile quality pass — `DEPENDENCY`

- **Зависимости:** H1/build baseline и согласованный минимальный accessibility target; продуктовая срочность ниже security/data-integrity задач.
- **Блокирующие D1–D9:** нет обязательного D-решения, но нужен target уровня доступности.
- **Техническое исследование до решения:** да — keyboard/focus/contrast/narrow-screen audit можно провести на текущем UI.
- **Файлы:** shared UI, builders, players, rooms, themes/styles.
- **Готово, когда:** выбранные основные сценарии работают с клавиатурой, корректным focus/contrast, screen reader labels и узкими touch-экранами.
- **Проверки:** keyboard walkthrough, axe/accessibility scan, responsive viewport matrix, touch interaction regression, `tsc`, lint, build.

## Рекомендуемая первая задача

Первая задача — **H1: устранить текущий TypeScript baseline**.

Она не требует решения владельца, ограничена frontend-контрактами, даёт объективный критерий готовности и разблокирует H7/M7 и последующую безопасную синхронизацию API. Параллельно можно вести security, contract и production tracks согласно закрытым D1–D3, D5–D7; D4 и D8 остаются отдельными decision blockers.

## Контроль после каждого изменения

1. Проверить `git diff` и убедиться, что изменены только согласованные файлы.
2. Для frontend запускать `npx tsc --noEmit`, `npm run lint`, `npm run build`; существующие baseline-ошибки отделять от новых.
3. Для backend минимум запускать Python syntax/import check в настроенном окружении.
4. Для затронутого endpoint проверять backend contract и всех frontend consumers.
5. Не добавлять secrets, `.env`, service-role keys, JWT secrets или реальные production values.
