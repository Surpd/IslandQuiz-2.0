# IslandQuiz — рабочий план разработки

Статус плана: 2026-08-18. Основан на `docs/BACKLOG.md`, `docs/ARCHITECTURE.md`, `docs/AI.md`, `docs/DEPLOYMENT.md`, `docs/DECISIONS.md` и текущих `AGENTS.md`.

Этот документ не заменяет backlog. Backlog фиксирует проблемы, а здесь определены порядок работы, блокеры, конкретные результаты и проверки.

## Как читать статусы

- **READY** — реализацию можно безопасно начать сейчас.
- **DEPENDENCY** — можно начать исследование или подготовку, но завершение зависит от другой задачи или подтверждения контракта.
- **BLOCKED** — корректная реализация невозможна без решения владельца, доступа к production-инфраструктуре или завершения обязательного аудита.
- **DONE** — в исходных документах нет подтверждения завершения. Сейчас таких задач нет.

Для задач со статусом `DEPENDENCY` или `BLOCKED` техническое исследование не считается готовой реализацией.

## OWNER DECISIONS

Ниже только решения, которые нужны для ближайшего security/contract/deployment цикла. D4 и D8 сознательно не включены: они нужны главным образом для более позднего масштабирования комнат и legacy-уборки.

### D1. Политика JWT и сессий

Проблема простыми словами: украденный токен сейчас может работать до своего истечения, а logout действует только в браузере. Без общей политики нельзя безопасно менять auth-код.

Вопрос владельцу: **какими должны быть срок жизни входа и поведение после logout, блокировки или удаления аккаунта — достаточно ли короткого access-токена, или нужен отдельный механизм продления и отзыва сессий?**

Нужно для: C4, части M2 и security-тестов.

### D2. Модель безопасности WebSocket-игрока

Проблема простыми словами: сервер не всегда знает, кто именно отправил команду игрока, поэтому клиент может выдать себя за другого или изменить чужое состояние.

Вопрос владельцу: **может ли игрок входить анонимно по коду комнаты, как сервер должен узнавать этого игрока при reconnect и какие действия разрешены host и player?**

Нужно для: C2, части C3 и H10. D4 для самой авторизации не требуется и будет решаться отдельно при работе с сохранением комнат.

### D3. Канонический scoring и anti-cheat

Проблема простыми словами: сейчас браузер сообщает серверу правильность ответа и итоговые очки, поэтому результат можно подделать.

Вопрос владельцу: **должен ли итог всегда пересчитываться сервером по сохранённой игре, разрешены ли ручные поправки host и какие данные нужно сохранять как подтверждение ответа?**

Нужно для: C3, P2, P5 и связанных result-тестов.

### D5. Правила владения Supabase

Проблема простыми словами: фактическая production-схема, RLS и RPC не находятся в репозитории, поэтому нельзя безопасно добавлять nonce-хранилище, constraints или атомарные операции на предположениях.

Вопрос владельцу: **кто утверждает изменения таблиц, политик, индексов, RPC и восстановление данных?** Read-only аудит production Supabase для C5 уже выполнен и зафиксирован в `docs/DATABASE.md`.

Нужно для: C1, C5, M4, M6 и части H9. На первом этапе достаточно read-only доступа; это не означает немедленное изменение базы.

### D6. Семантика visibility и результатов

Проблема простыми словами: значения `private`, `link` и `public` могут по-разному трактоваться при редактировании, fork, anonymous draft и просмотре результатов.

Вопрос владельцу: **кто может открыть игру и результаты в каждом из трёх режимов, и должна ли видимость сохраняться при редактировании и копировании игры?**

Нужно для: H3, H9 и позже P4.

### D7. Deployment topology и release process

Проблема простыми словами: неизвестно, сколько production-процессов запущено, как загружаются secrets и какой именно commit публикуется. Это особенно опасно для Telegram polling и in-memory rooms.

Вопрос владельцу: **какие branch, VPS/systemd unit, число workers/instances и способ публикации frontend являются официальными, и можно ли автоматизировать deploy и rollback?**

Нужно для: H5, H6, M7 и M9.

### D9. AI product policy

Проблема простыми словами: AI проверяет форму вопроса, но не гарантирует истинность фактов; кроме того, модель, лимиты и хранение prompt/logs влияют на стоимость и ответственность продукта.

Вопрос владельцу: **что IslandQuiz обещает пользователю про качество AI-контента, какие лимиты и расходы допустимы и нужно ли проверять факты внешними источниками?**

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
- **Блокирующие D1–D9:** косвенно D1, D2, D3, D5 и D6 — только для ожидаемого security-поведения; каркас тестов можно готовить сейчас.
- **Техническое исследование до решения:** да — определить test runner, fixtures, границы mock и минимальный CI command.
- **Файлы:** `backend/routes/*`, `backend/services/*`, `frontend/src/lib/api.ts`, room clients и новые backend/frontend test fixtures.
- **Готово, когда:** критические auth, Telegram replay, permissions, results, visibility, AI и WebSocket transitions имеют воспроизводимые проверки.
- **Проверки:** один локальный командный запуск всех тестов; негативные случаи с `None`, пустыми ответами Supabase, invalid JSON и malformed actions; отсутствие секретов в fixtures и логах.

#### H8. Согласовать фактический AI contract и документацию — `DEPENDENCY`

- **Зависимости:** инвентаризация текущих shapes для Quiz, Jeopardy, improve и file flows; решение canonical JSON schema/error format.
- **Блокирующие D1–D9:** D9 для окончательной product policy; техническую сверку можно выполнить сейчас.
- **Техническое исследование до решения:** да — сравнить `ai.py`, prompts, validator, `api.ts`, builders и `docs/AI.md`.
- **Файлы:** `backend/routes/ai.py`, `backend/services/ai_prompts.py`, `backend/services/ai_validator.py`, `frontend/src/lib/api.ts`, AI components/builders, `docs/AI.md`, `md/AI_LOGIC.md`.
- **Готово, когда:** один contract описывает input, success и error для всех AI endpoints; prompt, validator, mapping и документация согласованы.
- **Проверки:** fixtures для valid/invalid Quiz и Jeopardy responses, count/type/difficulty validation, improve/file flows; backend syntax/import, frontend `tsc`, lint, build.

#### H10. Ограничить доверие к WebSocket input и стабилизировать protocol validation — `DEPENDENCY`

- **Зависимости:** сначала описать state machine и все action/state fields; реализация следует после C2 и согласования scoring/room protocol.
- **Блокирующие D1–D9:** D2 и D3 блокируют завершение, но inventory и schema draft доступны сейчас.
- **Техническое исследование до решения:** да — собрать таблицу действий Quiz/Jeopardy, полей, фаз, лимитов и ошибок.
- **Файлы:** `backend/routes/rooms.py`, `frontend/src/lib/api.ts`, Quiz/Jeopardy room components, reconnect/cache logic.
- **Готово, когда:** сервер валидирует shape, phase, IDs, bounds, размер/частоту сообщений и повторные действия; frontend отправляет только допустимые actions.
- **Проверки:** valid/invalid action tests, replay/out-of-order/oversized message tests, state transition tests для Quiz и Jeopardy, reconnect regression.

#### M3. Создать единый typed API/contract source of truth — `DEPENDENCY`

- **Зависимости:** результаты H2, H8 и H10; до выбора генерации типов нужен реестр текущих REST/WebSocket контрактов.
- **Блокирующие D1–D9:** косвенно D2, D3 и D9; выбор OpenAPI-generated или versioned manual contract нельзя делать до стабилизации базовых shapes.
- **Техническое исследование до решения:** да — сравнить стоимость и покрытие обоих подходов на одном admin, AI и room contract.
- **Файлы:** FastAPI request/response models, `frontend/src/lib/api.ts`, `frontend/src/lib/types.ts`, WebSocket action/state types, `docs/*`.
- **Готово, когда:** изменение request/response shape вызывает type/test failure до runtime, а версия контракта и compatibility policy описаны.
- **Проверки:** generated/manual type check, compile-time fixtures, REST contract tests, WebSocket serialization tests, `tsc` и backend import check.

На этом этапе параллельно можно подготовить инвентаризации C1–C5 и H3–H6: replay flow, room identity, scoring inputs, auth lifecycle, Supabase read-only checklist, visibility transitions и production facts. Это не требует изменения кода или принятия новых архитектурных решений.

### Next — после ближайших решений

#### C1. Сделать Telegram login token одноразовым — `BLOCKED`

- **Зависимости:** D5, read-only проверка production schema и выбор server-side storage/атомарного consume.
- **Блокирующие D1–D9:** D5; срок TTL и способ очистки nonce нужно зафиксировать вместе с владельцем хранения.
- **Техническое исследование до решения:** да — описать bot-login/complete flow, replay points и варианты atomic consume; production implementation нет.
- **Файлы:** `backend/routes/telegram_auth.py`, `backend/bot.py`, frontend Telegram login flow, выбранная таблица/механизм nonce.
- **Готово, когда:** один токен принимается ровно один раз, expired/unknown/replayed token получает безопасную ошибку, параллельные запросы не проходят дважды.
- **Проверки:** valid token, expiry, replay через оба endpoint, parallel consume race, bot-to-web completion и отсутствие утечки токена в логах.

#### C4. Закрыть базовые риски JWT-аутентификации — `BLOCKED`

- **Зависимости:** D1; затем аудит текущей проверки `exp`, secret rotation, ban/delete и client storage.
- **Блокирующие D1–D9:** D1.
- **Техническое исследование до решения:** да — составить lifecycle matrix текущего JWT и определить места проверки пользователя.
- **Файлы:** `backend/routes/auth.py`, `frontend/src/lib/auth.ts`, `frontend/src/hooks/use-auth.tsx`, Bearer middleware/helpers, users schema.
- **Готово, когда:** сроки, logout/revocation, ban/delete, повторный вход и rotation одинаково реализованы backend и frontend и описаны без секретов.
- **Проверки:** valid/expired/wrong-algorithm token, revoked session, banned/deleted user, logout, rotation compatibility, protected endpoint matrix; `tsc`, lint, backend syntax.

#### H3. Исключить потерю visibility при редактировании игры — `BLOCKED`

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

#### H6. Сделать production deployment повторяемым и проверяемым — `BLOCKED`

- **Зависимости:** D7; нужны exact branch, unit, checkout path, env loading, frontend publish и rollback facts.
- **Блокирующие D1–D9:** D7.
- **Техническое исследование до решения:** да — собрать checklist из подтверждённых фактов, не выдумывая SSH-команды и secrets.
- **Файлы:** VPS, Cloudflare Pages, systemd/Uvicorn, Git workflow, `docs/DEPLOYMENT.md`, health endpoint и frontend/API URLs.
- **Готово, когда:** по commit можно повторить deploy, проверить health/API/frontend, увидеть неверный env и откатиться на предыдущий рабочий release.
- **Проверки:** dry-run checklist, artifact/commit verification, `GET /`, frontend smoke, API/WS smoke, rollback rehearsal без секретов.

#### H9. Ввести единый контроль доступа к результатам и online results — `BLOCKED`

- **Зависимости:** D6, D5 и аудит identity/production schema; затем единая matrix owner/non-owner/admin/public/link.
- **Блокирующие D1–D9:** D5 и D6.
- **Техническое исследование до решения:** да — инвентаризация всех result branches и полей PII возможна сейчас.
- **Файлы:** `backend/routes/results.py`, `backend/routes/games.py`, frontend results/dashboard/profile routes, result tables.
- **Готово, когда:** один принцип доступа действует одинаково для Quiz, Jeopardy, Millionaire и online results; userId из клиента не расширяет права.
- **Проверки:** owner/non-owner/admin/anonymous/link tests, cross-user ID tampering, PII exposure checks, empty/error Supabase responses.

После D1/D5/D6/D7 можно последовательно запускать C1, C4, H3, H5, H6 и H9. H2, H7 и H8 переходят из исследовательской фазы в реализацию после фиксации соответствующих contract tables.

### Blocked — не реализовывать до снятия блокеров

#### C2. Server-side authorization WebSocket-комнат — `BLOCKED`

- **Зависимости:** D2; затем матрица host/player permissions, JWT/guest identity в WS и протокол reconnect.
- **Блокирующие D1–D9:** D2.
- **Техническое исследование до решения:** да — подготовить threat model и action permission matrix.
- **Файлы:** `backend/routes/rooms.py`, `frontend/src/lib/api.ts`, host/player room views, reconnect logic, protocol/state types.
- **Готово, когда:** сервер сам определяет участника и право каждой команды; client-supplied `hostId`, `playerId`, score и phase не являются источником доверия.
- **Проверки:** spoofed identity, unauthorized start/kick/finish/score, guest join/reconnect, host/player permission matrix, multi-client WS integration.

#### C3. Перенести расчёт результата на доверенную сторону — `BLOCKED`

- **Зависимости:** D2, D3 и C2; нужен versioned game snapshot и единые правила для трёх форматов.
- **Блокирующие D1–D9:** D2 и D3.
- **Техническое исследование до решения:** да — каталогизировать scoring inputs и result payloads всех players/rooms.
- **Файлы:** players трёх форматов, `backend/routes/results.py`, `backend/routes/rooms.py`, `games.data`, `frontend/src/lib/api.ts`, result tables.
- **Готово, когда:** сервер независимо пересчитывает score из snapshot и ответов; подмена `correct`, `delta`, `score` или history не меняет итог.
- **Проверки:** golden fixtures для Quiz/Jeopardy/Millionaire, tampered payloads, duplicate submit, online/standalone parity, old snapshot regression.

#### C5. Аварийная проверка Supabase schema, RLS и ограничений — `DONE`

- **Зависимости:** D5 и read-only доступ к production Supabase; read-only аудит выполнен.
- **Блокирующие D1–D9:** D5.
- **Техническое исследование до решения:** выполнено — production metadata audit и code-to-schema mapping.
- **Файлы:** `backend/database.py`, все routers, `games.data`, users/results/AI/settings/log tables, Supabase policies и RPC.
- **Готово, когда:** зафиксированы реальные таблицы, поля, nullable, keys, indexes, RLS и RPC; расхождения оформлены в `docs/DATABASE.md` без изменений production.
- **Проверки:** read-only schema export, route/query mapping, RLS/policy inventory, constraint/index/RPC inventory; metadata reads без изменения production. RLS owner/non-owner behavior не выполнялся: это потребовало бы credentials/test actors и не нужно для документационного snapshot.

#### H4. Не терять комнаты при restart и не допустить split-brain — `BLOCKED`

- **Зависимости:** D4 и D7; нужно выбрать single-worker ограничение или внешний room store/pub-sub, а также TTL/versioning.
- **Блокирующие D1–D9:** D4 и D7 (D4 отложено до отдельного решения владельца).
- **Техническое исследование до решения:** да — измерить текущий lifecycle комнаты, worker topology и reconnect failure modes.
- **Файлы:** `backend/routes/rooms.py`, deployment/systemd/Uvicorn, host/player views, reconnect logic, online results.
- **Готово, когда:** выбранная topology не теряет или явно корректно завершает комнату при restart и не допускает расходящихся состояний между workers.
- **Проверки:** restart test, two-worker test, concurrent actions/version conflict, TTL cleanup, reconnect and result finalization.

#### M4. Унифицировать обработку ошибок и пустых ответов Supabase/API — `DEPENDENCY`

- **Зависимости:** C5; сначала карта реальных ошибок и полей, затем стабильный HTTP error mapping.
- **Блокирующие D1–D9:** D5 косвенно через C5.
- **Техническое исследование до решения:** да — найти прямые обращения к `res.data`, `data[0]`, nullable fields и frontend error branches.
- **Файлы:** `backend/database.py`, затронутые routers/services, frontend API facade и error UI.
- **Готово, когда:** empty/None/error от Supabase не превращаются в случайный 500 или частичное сохранение; frontend получает понятную стабильную ошибку.
- **Проверки:** empty result, `None`, DB error, duplicate/constraint error, timeout и malformed response tests; backend syntax и frontend checks.

#### M5. Довести Jeopardy AI до уровня обычного Quiz — `BLOCKED`

- **Зависимости:** H8 и D9; утвердить required fields, points, difficulty и slot count.
- **Блокирующие D1–D9:** D9.
- **Техническое исследование до решения:** да — собрать реальные Jeopardy response shapes и builder assumptions.
- **Файлы:** `backend/routes/ai.py`, `backend/services/ai_prompts.py`, `backend/services/ai_validator.py`, Jeopardy AI components и builder mapping.
- **Готово, когда:** invalid category/question JSON отклоняется до builder, valid response имеет точное число slots и допустимые points.
- **Проверки:** missing fields, wrong points/difficulty/count, malformed JSON, valid category/question fixtures, frontend no-crash mapping.

#### M6. Ввести индексы, constraints и безопасные RPC по фактической схеме — `BLOCKED`

- **Зависимости:** C5 и D5; сначала schema diff, затем отдельное согласование DDL/RPC/RLS.
- **Блокирующие D1–D9:** D5.
- **Техническое исследование до решения:** частично — performance/query inventory можно начать без DDL.
- **Файлы:** Supabase PostgreSQL, backend queries, `ai_usage`, users/games/results/settings.
- **Готово, когда:** индексы и constraints подтверждены фактической схемой, race-prone операции атомарны, миграции обратимы или имеют rollback.
- **Проверки:** migration dry-run, constraint violation tests, concurrent usage/insert tests, query plan review, RLS regression.

#### M10. Закрыть RLS и policy gaps после фиксации модели identity — `DEPENDENCY`

- **Зависимости:** D5 и решение о Supabase JWT identity versus privileged backend client; затем owner/non-owner policy tests.
- **Блокирующие D1–D9:** D5; C4 влияет на identity lifecycle.
- **Техническое исследование до решения:** выполнено частично — gaps и текущие `auth.uid()` policies зафиксированы в `docs/DATABASE.md`; production DDL не выполнялся.
- **Файлы:** Supabase RLS/policies, `backend/database.py`, auth identity и admin/results routes.
- **Готово, когда:** каждая public application table имеет намеренно выбранный RLS режим и policies, а backend/frontend access tests подтверждают owner/non-owner/admin behavior.
- **Проверки:** policy matrix, anon/authenticated/backend-role reads and writes, negative cross-user cases, security advisor; без изменения production до approval.

#### M11. Согласовать referential integrity для result tables — `DEPENDENCY`

- **Зависимости:** D3, H9 и решение о retention/cascade behavior; перед DDL нужен orphan-data audit.
- **Блокирующие D1–D9:** D3 и D5.
- **Техническое исследование до решения:** выполнено — result `game_id` links используются backend, но FK отсутствуют.
- **Файлы:** `backend/routes/results.py`, `backend/routes/games.py`, result tables и Supabase constraints.
- **Готово, когда:** выбранный restrict/cascade/history policy документирован, orphan rows обработаны безопасно, а constraint не ломает delete и result flows.
- **Проверки:** orphan audit, delete-game behavior, result insert for all four formats, FK violation and rollback checks; DDL только после approval.

#### M7. Добавить CI quality gates и безопасную проверку зависимостей — `BLOCKED`

- **Зависимости:** H1 и H7; нужен минимальный release/branch policy из D7.
- **Блокирующие D1–D9:** D7.
- **Техническое исследование до решения:** да — перечислить команды, duration и секреты, необходимые для CI.
- **Файлы:** frontend scripts, backend requirements, CI/repository settings, deployment checklist.
- **Готово, когда:** clean checkout автоматически запускает lint, typecheck, build, backend syntax/tests и dependency audit; failing gate блокирует release согласно policy.
- **Проверки:** CI на clean checkout, intentional failure cases, lockfile/dependency audit, secrets scan, artifact build.

#### M9. Укрепить monitoring, health checks и audit logging — `BLOCKED`

- **Зависимости:** H6; нужны topology, monitoring budget/retention и список допустимых PII.
- **Блокирующие D1–D9:** D7.
- **Техническое исследование до решения:** частично — инвентаризация health endpoint, logs и потенциальных secret leaks доступна сейчас.
- **Файлы:** `backend/main.py`, error/AI logs, VPS/Cloudflare/UptimeRobot, admin logs UI, deployment docs.
- **Готово, когда:** deployment, Telegram, AI, Supabase и WS failures имеют обнаруживаемый сигнал без записи secrets/лишней PII.
- **Проверки:** health/alert smoke, log redaction, correlation ID propagation, failed dependency simulation, retention check.

#### P1. Восстановление онлайн-игры после disconnect — `BLOCKED`

- **Зависимости:** C2, H4 и D4; нужен session/resume protocol и решение о persistent room store.
- **Блокирующие D1–D9:** D2 и D4.
- **Техническое исследование до решения:** да — описать reconnect/cache failure modes и требования к idempotency.
- **Файлы:** room backend, reconnect logic, host/player views, result finalization, storage/pub-sub.
- **Готово, когда:** краткий disconnect сохраняет участника и состояние по выбранной policy, повторное подключение не дублирует ответы/result.
- **Проверки:** network drop/reconnect, duplicate resume, stale client, host reconnect, restart behavior согласно D4, result once-only.

#### P2. Версионирование игры и snapshot для результатов — `BLOCKED`

- **Зависимости:** C3, H3 и D3; определить version increment, retention и snapshot size.
- **Блокирующие D1–D9:** D3.
- **Техническое исследование до решения:** да — найти все места чтения `games.data` и формирования result payload.
- **Файлы:** builders, `games` persistence, players, result tables, dashboards, online rooms.
- **Готово, когда:** каждый результат ссылается на неизменяемую версию/snapshot, а edit игры не меняет смысл старого результата.
- **Проверки:** edit-after-play, old-version replay, snapshot integrity, storage/retention, standalone/online result consistency.

#### P3. Улучшить AI review workflow — `BLOCKED`

- **Зависимости:** H8 и D9; нужен продуктовый уровень предупреждений и ответственность пользователя за фактологию.
- **Блокирующие D1–D9:** D9.
- **Техническое исследование до решения:** да — инвентаризация текущих review/edit/regenerate states.
- **Файлы:** AI components, builders, `backend/services/ai_validator.py`, prompts, usage/AI logs, warning UI.
- **Готово, когда:** пользователь видит границы AI-проверки, может проверить/изменить вопрос до save, а предупреждения не теряются при reroll.
- **Проверки:** review-before-save, edit/regenerate, invalid/factually uncertain warning states, usage/error logging and UI regression.

#### P4. Полноценные share/invite flows для игр и комнат — `BLOCKED`

- **Зависимости:** H3, C2, H4 и D6; нужен lifetime/revoke policy для link tokens и room invites.
- **Блокирующие D1–D9:** D2, D4 и D6.
- **Техническое исследование до решения:** да — можно описать текущие visibility, join route и room code flows.
- **Файлы:** library, game routes, builder actions, join route, room backend/frontend, visibility.
- **Готово, когда:** share link/QR/invite имеют предсказуемые права, expiration/revoke и понятный UX для private/link/public.
- **Проверки:** access matrix, expired/revoked links, QR join, unauthorized room join, mobile/share regression.

#### P5. Расширить аналитику автора и результаты — `BLOCKED`

- **Зависимости:** C3, P2, C5 и privacy policy; нельзя строить метрики на недоверенном score.
- **Блокирующие D1–D9:** D3 и D5; visibility/privacy details также связаны с D6.
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
- **Блокирующие D1–D9:** D1 и D8.
- **Техническое исследование до решения:** да — карта storage keys, владельцев данных и stale-value paths.
- **Файлы:** `frontend/src/hooks/use-draft.ts`, `frontend/src/lib/storage.ts`, `frontend/src/lib/auth.ts`, builders, `builder-actions.tsx`, backend save flows.
- **Готово, когда:** draft/ID/visibility/auth не конфликтуют между вкладками и пользователями, а migration/cleanup безопасны.
- **Проверки:** reload, expired draft, multi-tab conflict, logout/login user switch, edit/save visibility regression, localStorage migration tests.

#### M8. Обновить документацию и удалить устаревшие operational утверждения — `BLOCKED`

- **Зависимости:** H6, H8 и D8; нельзя удалять legacy material до определения его historical/deprecated статуса.
- **Блокирующие D1–D9:** D8; содержательные обновления зависят от H6/H8.
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

Она не требует решения владельца, ограничена frontend-контрактами, даёт объективный критерий готовности и разблокирует H7/M7 и последующую безопасную синхронизацию API. Параллельно можно вести только исследовательские треки security и production, не меняя код до ответов на D1–D7 и D9.

## Контроль после каждого изменения

1. Проверить `git diff` и убедиться, что изменены только согласованные файлы.
2. Для frontend запускать `npx tsc --noEmit`, `npm run lint`, `npm run build`; существующие baseline-ошибки отделять от новых.
3. Для backend минимум запускать Python syntax/import check в настроенном окружении.
4. Для затронутого endpoint проверять backend contract и всех frontend consumers.
5. Не добавлять secrets, `.env`, service-role keys, JWT secrets или реальные production values.
