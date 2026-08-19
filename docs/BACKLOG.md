# IslandQuiz — практический backlog развития и стабилизации

Статус: рабочий backlog по аудиту на 2026-08-18.

Цель: снизить риски безопасности и потери данных, восстановить согласованность frontend/backend-контрактов, сделать deployment и проверку изменений воспроизводимыми, затем развивать продукт.

Источник: фактическое описание в `docs/ARCHITECTURE.md`, `docs/AI.md`, `docs/DEPLOYMENT.md`, `docs/DECISIONS.md`, legacy-документация и проверка текущего TypeScript baseline. Supabase production schema, RLS/RPC зафиксированы read-only snapshot в `docs/DATABASE.md`; изменения production требуют approval владельца.

Формат сложности: S — до 1 дня, M — несколько дней, L — до 1–2 недель, XL — крупная межслойная работа. Оценка предварительная.

## 🔴 Critical

### C1. Сделать Telegram login token одноразовым

- **Проблема/цель:** HMAC-токен живёт 5 минут, `nonce` подписывается, но не хранится и не помечается использованным. Один и тот же токен можно повторно отправить в `bot-login`/`complete` до истечения срока.
- **Почему важно:** replay может повторно завершить вход или привязку Telegram и привести к захвату login flow.
- **Затрагивает:** `backend/routes/telegram_auth.py`, `backend/bot.py`, frontend Telegram login flow, таблицу/механизм хранения использованных nonce.
- **Зависимости:** выбор server-side storage и атомарной операции consume; production schema snapshot уже проверен; для migration/storage proposal нужен approval владельца.
- **Сложность:** L.
- **Самостоятельность:** нет — нужен выбор владельца, где хранить nonce и как долго; после решения реализация локальна.

### C2. Ввести server-side authorization для WebSocket-комнат

- **Статус:** `DONE`. Сервер выдаёт host/player credentials, связывает действия с server-side role/player и блокирует spoofing/unauthorized actions. Reconnect поддерживается только в памяти текущего backend-процесса через короткое grace window; D4 persistence не реализована.
- **C3 bridge:** `correct`, `delta`, `score` и `streak` ещё являются legacy client-scored полями после identity check. C2 не делает их trusted и не пересчитывает результат; это обязательный scope C3 через game snapshot и server-side recalculation.

- **Проблема/цель:** WebSocket принимает соединение и действия, а `hostId`, `playerId`, score delta и переходы состояния в значительной степени приходят от клиента. Для host/player нет полноценной проверки прав на каждую команду.
- **Почему важно:** посторонний клиент может вмешаться в игру, изменить очки, kick/start/finish комнату или раскрыть состояние.
- **Затрагивает:** `backend/routes/rooms.py`, `frontend/src/lib/api.ts`, host/player room views, reconnect logic, протокол actions/state.
- **Зависимости:** server-issued player identity, способ передачи guest credential/JWT в WebSocket, матрица прав host/player, тесты протокола; отдельно — решение о persistence комнат.
- **Сложность:** XL.
- **Самостоятельность:** да в рамках принятой D2 policy; persistence комнат остаётся отдельным решением D4.

### C3. Перенести расчёт результата на доверенную сторону

- **Статус:** `DONE`. Quiz/Millionaire пересчитываются backend-side из signed snapshot; Jeopardy фиксирует auditable host decisions, а online results сохраняет room backend из server-held state. Для текущей реализации snapshot/version сохраняются в existing result JSON без production migration; нормализованная snapshot table остаётся target design P2/M11. Legacy rows без snapshot — untrusted.
- **Проблема/цель:** одиночный player считает ответы и score на frontend; room actions и result payload также передают `correct`, `delta`, `score` и историю от клиента. Нужен независимый пересчёт по game snapshot и правилам конкретного формата.
- **Почему важно:** иначе пользователь может отправить завышенный результат, а сохранённая статистика и leaderboard не являются доказательством прохождения.
- **Затрагивает:** players всех трёх форматов, `backend/routes/results.py`, `backend/routes/rooms.py`, `games.data`, `frontend/src/lib/api.ts`, таблицы результатов и online rooms.
- **Зависимости:** C2, versioned game snapshot, формат детальных ответов и реализация принятой D3 policy.
- **Сложность:** XL.
- **Самостоятельность:** да в рамках принятой D3 policy; потребуется синхронная backend/frontend работа.

### C4. Закрыть базовые риски JWT-аутентификации

- **Проблема/цель:** JWT stateless хранится в `localStorage`, logout удаляет его только на клиенте, server-side revocation не предусмотрен. Требуется формально проверить `exp`, secret rotation, инвалидирование banned/deleted пользователей и поведение refresh/повторного входа.
- **Почему важно:** украденный токен продолжает действовать, а изменение статуса пользователя не обязательно немедленно прекращает доступ.
- **Затрагивает:** `backend/routes/auth.py`, `frontend/src/lib/auth.ts`, `frontend/src/hooks/use-auth.tsx`, Bearer middleware/helpers, users schema.
- **Статус:** `DONE`. Access token сокращён до 1 часа; проверены `exp`, обязательные claims и HS256, ban/delete и frontend reaction на `401`.
- **Результат:** базовая JWT-защита завершена. Полный server-side session lifecycle вынесен в отдельную C4.1 и не является blocker’ом для C4.
- **Сложность:** L.
- **Самостоятельность:** да в рамках принятой D1 policy.

### C4.1. Ввести server-side session lifecycle: refresh и revoke/logout

- **Статус:** `BACKLOG` / `DEPENDENCY`, не `READY`.
- **Проблема/цель:** текущий JWT lifecycle stateless; logout удаляет token на frontend, но server-side sessions и refresh/revocation отсутствуют.
- **Зависимости:** отдельное решение по persistent session storage; вероятно потребуется изменение production Supabase schema и approval владельца. C4.1 не блокирует уже выполненную базовую JWT-защиту C4.
- **Acceptance direction:** login создаёт server-side session; короткоживущий access token продлевается через refresh; logout отзывает session; revoked/expired refresh token не работает; повторное использование отозванного refresh token безопасно блокируется; при необходимости можно отозвать все sessions пользователя; secrets и raw refresh tokens не попадают в логи.
- **Проверки:** login/refresh/logout, expiry/revocation/replay refresh token, revoke-all, повторный login и secret/token log scan.
- **Сложность:** L/XL.
- **Самостоятельность:** нет — требуется архитектурное решение по storage и production schema.

### C5. Провести аварийную проверку Supabase schema, RLS и ограничений целостности — DONE

- **Проблема/цель:** фактическая production schema не хранится в репозитории; роуты напрямую используют таблицы и поля, а legacy `models.py` им не соответствует. Нужно сверить таблицы, типы, nullable, unique/foreign keys, индексы, RLS и существующие RPC.
- **Почему важно:** несоответствие может приводить к потере записей, частично успешным операциям, утечке данных или поломке после deployment.
- **Затрагивает:** `backend/database.py`, все routers, `games.data`, users/results/AI/settings/log tables, Supabase policies и RPC.
- **Зависимости:** read-only доступ к production Supabase и выгрузка схемы; инвентаризация реальных RLS/RPC; решение о том, какие constraints и migrations допустимы.
- **Сложность:** L.
- **Самостоятельность:** нет — нужен доступ владельца к production и подтверждение границ допустимых изменений БД.
- **Результат:** read-only аудит выполнен 2026-08-18; snapshot схемы и code mapping зафиксированы в `docs/DATABASE.md`, production schema/data/RLS не изменялись.

## 🟠 High

### H1. Устранить текущий TypeScript baseline

- **Статус реализации:** `DONE`. Исходные 9 TypeScript-ошибок устранены; текущие URL и API-контракты не изменены. Полный frontend lint baseline (pre-existing Prettier/CRLF и прочие quality issues) не исправлялся в рамках H1.
- **Проблема/цель:** `npx tsc --noEmit` завершается ошибкой; зафиксировано 9 ошибок в `site-header.tsx`, `index.tsx`, `auth.ts`, `game.$id.tsx`, `library.tsx` — обязательные search params, nullable values и неописанные dynamic result routes.
- **Почему важно:** типовой check не защищает от регрессий и блокирует предсказуемый build/CI.
- **Затрагивает:** `frontend/src/components/site-header.tsx`, `frontend/src/routes/index.tsx`, `frontend/src/lib/auth.ts`, `frontend/src/routes/game.$id.tsx`, `frontend/src/routes/library.tsx`, TanStack Router route tree.
- **Зависимости:** согласовать канонические route search params и result URLs; после исправлений повторить lint, typecheck и build.
- **Сложность:** M.
- **Самостоятельность:** да, после подтверждения требуемого UX маршрутов.

### H2. Синхронизировать Admin API и frontend contract

- **Статус реализации:** `DONE`. Users/games frontend теперь использует backend envelope с typed helpers и pagination; остальные admin calls сверены без изменения их методов и payload.
- **Проблема/цель:** admin backend содержит users/games/stats/logs/limits и AI test endpoints, но frontend contract и фактические запросы/ответы нужно привести к одному набору путей, методов, payload и response shapes.
- **Почему важно:** админские операции могут выглядеть доступными в UI, но не работать или работать с неправильными данными; это затрудняет управление пользователями, играми и AI.
- **Затрагивает:** `backend/routes/admin.py`, `frontend/src/routes/admin.tsx`, `frontend/src/lib/api.ts`, admin types и pagination/AI lab UI.
- **Зависимости:** таблица endpoint contract, решение о необходимом объёме admin-функций, затем интеграционные tests.
- **Сложность:** L.
- **Самостоятельность:** выполнено в минимальном текущем наборе операций; новые admin operations не добавлялись.

### H3. Исключить потерю visibility при редактировании игры

- **Статус реализации:** `DONE`; edit/create/save visibility исправлены, anonymous draft всегда `private` согласно D6.

- **Проблема/цель:** visibility живёт одновременно в builder state и legacy `localStorage`; при edit/save есть риск заменить существующее значение default-значением (`private`/`link`) или отправить устаревшее значение.
- **Почему важно:** публичная игра может внезапно стать приватной, либо приватный контент — открытым по ссылке.
- **Затрагивает:** `frontend/src/components/builder-actions.tsx`, `frontend/src/lib/api.ts`, `backend/routes/games.py`, edit flows всех builders и `games.visibility`.
- **Зависимости:** зафиксировать семантику visibility для create/edit/unauthenticated draft; добавить regression tests для всех значений `private/link/public`.
- **Сложность:** M.
- **Самостоятельность:** нет — нужна явная политика владельца для visibility при редактировании и anonymous save.

### H4. Не терять комнаты при restart и не допустить split-brain между workers

- **Проблема/цель:** `rooms` и `connections` хранятся в памяти одного процесса; комнаты исчезают при restart и не синхронизируются между workers.
- **Почему важно:** production restart или масштабирование может оборвать активную игру и привести к разным состояниям у участников.
- **Затрагивает:** `backend/routes/rooms.py`, deployment/systemd/Uvicorn, host/player views, reconnect logic, online results.
- **Зависимости:** решение о single-worker ограничении или внешнем room store/pub-sub; versioning и TTL состояния комнаты.
- **Сложность:** XL.
- **Самостоятельность:** нет — архитектурный выбор должен принять владелец.

### H5. Зафиксировать безопасную topology для Telegram polling — RESOLVED

- **Проблема/цель:** Telegram bot запускается task внутри FastAPI startup; несколько backend instances могут одновременно выполнять polling.
- **Почему важно:** Telegram polling конфликтует между экземплярами, а login flow становится нестабильным или теряет события.
- **Затрагивает:** `backend/main.py`, `backend/bot.py`, `telegram_auth.py`, systemd/Uvicorn deployment.
- **Зависимости:** подтверждение числа workers/instances и решение: отдельный bot service, single worker или другой механизм доставки.
- **Сложность:** M/L.
- **Самостоятельность:** нет — требуется решение владельца и подтверждение VPS topology.
- **Решение:** D7 подтверждает `islandquiz.service` на VPS с одним Uvicorn worker и одним backend instance. Startup запускает одну polling task на процесс, поэтому duplicate polling не возникает; отдельный bot service или кодовый guard не требуется.
- **Проверка:** сверены `backend/main.py`, `backend/bot.py`, `backend/routes/telegram_auth.py` и зафиксированный systemd/Uvicorn `ExecStart`; Telegram login flow сохраняется.

### H6. Сделать production deployment повторяемым и проверяемым — DONE

- **Результат:** backend deployment автоматизирован GitHub Actions: exact SHA, dependency update, syntax, restart `islandquiz.service`, systemd status, local VPS health и SHA verification прошли на production.
- **Ограничение:** Cloudflare public URL может вернуть GitHub runner `403`; это diagnostic warning, не backend deploy gate. Frontend Cloudflare Pages остаётся отдельным pipeline.
- **Rollback:** ручной `workflow_dispatch(target_sha)` реализован; full production rehearsal намеренно вынесен в H6.1.

### H6.1. Провести controlled production rollback rehearsal — DEPENDENCY

- **Проблема/цель:** проверить на production rollback к предыдущему подтверждённому SHA и возврат на актуальный SHA без изменения secrets или данных.
- **Зависимости:** отдельный approval владельца на production operation.
- **Проверки:** exact SHA, `islandquiz.service`, blocking local health gate до и после возврата; Cloudflare check только diagnostic.

### H7. Добавить автоматические проверки критических API и room flows

- **Статус реализации:** `DONE` как baseline critical regression suite. Backend suite вырос с 16 до 35 tests: JWT basics, Telegram verify/bot-login/complete, D6 visibility/results, AI contracts/errors и room lifecycle/malformed input.
- **Проблема/цель:** в репозитории нет backend test suite; отсутствуют системные проверки auth, Telegram replay, permissions, results, visibility, AI contracts и WebSocket state transitions.
- **Почему важно:** изменения в связанных frontend/backend слоях легко ломают security и сохранение данных незаметно.
- **Текущее состояние:** `cd backend; python -m unittest discover -s tests -p 'test*.py'` выполняет 35 isolated tests с test doubles, без production data/credentials. Playwright smoke остаётся mocked frontend coverage. H7 фиксирует текущие contracts; не заменяет production/Supabase integration coverage.
- **Затрагивает:** `backend/routes/*`, `backend/services/*`, `frontend/src/lib/api.ts`, room clients и Supabase test doubles/fixtures.
- **Зависимости:** C1–C5 и H2–H3 для утверждённых контрактов; выбор test DB/mocks и CI environment.
- **Сложность:** XL.
- **Самостоятельность:** частично; инфраструктура тестов может быть подготовлена самостоятельно, но ожидаемые security/scoring правила требует утвердить владелец.
- **Follow-up:** C1, C2, C3, C4.1 и H9 сохраняют собственные acceptance criteria. В частности, H9 исправляет current private Jeopardy/online result submit gap: owner identity не передаётся в route-level access check, поэтому owner получает `403`; H7 test документирует это поведение, не исправляет его.

### H8. Согласовать фактический AI contract и документацию

- **Статус реализации:** `DONE`. Canonical schema закрепляет 3 Quiz variants, точный Quiz count, 5 уникальных Jeopardy categories и Jeopardy questions точно по `emptySlots`; malformed/provider output возвращается как controlled `{error, code?}`. Добавлены server-side validators и минимальные contract fixtures. Future generation preferences будут расширять input без изменения текущих success shapes.

- **Проблема/цель:** старый `md/AI_LOGIC.md` описывает один объект `question/options/correct`, а фактический API возвращает `{variants: [...]}` и поддерживает improve/file flows; frontend mapping и backend validator должны быть единым контрактом.
- **Почему важно:** рассинхронизация ломает AI buttons, builders и дальнейшее изменение prompt/validator.
- **Затрагивает:** `backend/routes/ai.py`, `backend/services/ai_prompts.py`, `backend/services/ai_validator.py`, `frontend/src/lib/api.ts`, AI components/builders, `docs/AI.md`, legacy `md/AI_LOGIC.md`.
- **Зависимости:** выбрать canonical JSON schema, error format и compatibility policy; затем добавить contract tests для Quiz и Jeopardy.
- **Сложность:** L.
- **Самостоятельность:** частично; техническое описание можно обновить самостоятельно, но canonical contract должен подтвердить владелец.
- **H11 note:** Jeopardy endpoints возвращают raw parsed JSON без server-side validation; H11 ограничился frontend normalization и controlled error. В H8 нужно выбрать и закрепить backend validation/error envelope.

### H9. Ввести единый контроль доступа к результатам и online results

- **Статус:** `DONE`. Закрыты admin/private result view, owner identity для Jeopardy submit, cross-user tampering в `/played-games/{user_id}`, endpoint-level access matrix, nested PII filtering и PII/malformed-row regression tests; production DB/RLS не изменялись.
- **Проблема/цель:** доступ к результатам реализован отдельными endpoint-ветками и разными payload; нужно проверить owner/admin/public/link semantics, userId filters и доступ к online player data.
- **Почему важно:** результаты могут раскрывать персональные данные или быть недоступны законному владельцу; разрозненная authorization логика создаёт обходы.
- **Затрагивает:** `backend/routes/results.py`, `backend/routes/games.py`, frontend results/dashboard/profile routes, `quiz_results`, `jeopardy_results`, `millionaire_results`, `online_quiz_results`.
- **Зависимости:** принятая visibility policy, user identity policy и production schema/RLS snapshot; tests на owner/non-owner/admin/anonymous.
- **Сложность:** L.
- **Самостоятельность:** нет — нужны правила владельца для публичности результатов и персональных данных.
- **H7 handoff:** private Jeopardy/online result submit сейчас не получает owner identity в `_check_can_submit`, поэтому private owner получает `403`. Нужны единая owner/non-owner/admin/public/link matrix и endpoint-level regression tests.

### H10. Ограничить доверие к WebSocket input и стабилизировать protocol validation

- **Статус:** `DONE`; backend и frontend validation закрывают room message size, phases, IDs, bounds, timer/answer/bet limits и duplicate/replay actions для Quiz и Jeopardy. Добавлены invalid и valid state-transition regressions.
- **Проблема/цель:** действия room могут передавать произвольные значения `delta`, timestamps, IDs, индексы и phase-related fields; нет единой schema validation и понятных ошибок для invalid state.
- **Почему важно:** даже после базовой авторизации malformed/replayed actions могут ломать состояние или вызывать исключения.
- **Затрагивает:** `backend/routes/rooms.py`, `frontend/src/lib/api.ts`, Quiz/Jeopardy room components, reconnect/cache.
- **Зависимости:** C2–C3, формальная state machine и лимиты размера/частоты сообщений.
- **Сложность:** L.
- **Самостоятельность:** да после утверждения room protocol; изменения должны идти синхронно в обеих сторонах.

### H11. Починить end-to-end AI generation в Quiz Builder

- **Статус:** `DONE`; `ae47585` устранил frontend TypeError, а production Groq response подтвердил root cause: configured `llama-3.3-70b-versatile` была недоступна текущему key (`model_not_found`). H11 использует configurable `GROQ_MODEL`, Groq JSON mode и controlled 502 для provider/parser failures. Production smoke подтвердил full Quiz, per-question/helper, matching, Jeopardy categories/questions и save/open/play path. Canonical backend validation остаётся H8 scope.
- **Проблема/цель:** full quiz generation падает с `Cannot read properties of undefined (reading 'map')`, а per-question AI helper — с `Cannot read properties of undefined (reading 'length')`. Нужно восстановить полный flow от AI response до builder state, а не скрыть TypeError защитной проверкой.
- **Почему важно:** основная AI-функция Quiz Builder сейчас не работает и блокирует нормальную демонстрацию и практическое использование продукта.
- **Затрагивает:** `frontend/src/components/ai-generate-quiz.tsx`, `frontend/src/components/ai-helper.tsx`, `frontend/src/routes/builder.quiz.tsx`, `frontend/src/lib/api.ts`, `backend/routes/ai.py` и mapping в builder.
- **Зависимости:** точная сверка success/error/empty response shapes; H8 остаётся отдельной задачей по документированию и стабилизации общего AI contract.
- **Рекомендуемая модель:** Terra / high.
- **Готово, когда:** full quiz и per-question generation работают end-to-end для валидного ответа, пустого/неполного ответа и API error; builder получает корректные questions/variants; TypeError не маскируется и не возникает повторно.
- **Проверки:** authenticated Quiz Builder smoke, full generation, per-question helper для нескольких question types, invalid/empty/error response fixtures, `npx tsc --noEmit`, targeted lint/build и сохранение сгенерированной игры.
- **Сложность:** L.
- **Самостоятельность:** да в рамках текущего API contract; если потребуется менять canonical AI schema или `games.data`, остановиться и вынести решение в H8.
- **Результат:** error/empty/malformed payload отклоняется до использования в UI; full/file Quiz и helpers больше не блокируются strict server validator. Transient Groq `429 rate_limit_exceeded` возвращается controlled 502 и не блокирует H11; отдельные UX, retry/monitoring contract checks — H8/H7/M9 follow-up.

## 🟡 Medium

### M1. Убрать двусмысленность вокруг legacy `backend/models.py`

- **Проблема/цель:** SQLAlchemy-модели описывают старый persistence layer и не используются текущими Supabase routers.
- **Почему важно:** разработчик может принять legacy schema за источник истины и внести несовместимое изменение или попытаться запустить несуществующую SQLite-архитектуру.
- **Затрагивает:** `backend/models.py`, `backend/requirements.txt`, `docs/ARCHITECTURE.md`, README и onboarding.
- **Зависимости:** проверить импорты/entry points и решить, удалить файл, архивировать его или явно пометить deprecated.
- **Сложность:** S.
- **Самостоятельность:** нет — способ удаления/архивирования должен подтвердить владелец.

### M2. Развести legacy localStorage и каноническое состояние

- **Проблема/цель:** drafts/ID/visibility и auth token используют localStorage; legacy `src/lib/storage.ts` сосуществует с backend persistence и может давать stale values.
- **Почему важно:** возможны потеря draft, конфликт между вкладками/пользователями и неправильная visibility; удалять legacy код изолированно нельзя.
- **Затрагивает:** `frontend/src/hooks/use-draft.ts`, `frontend/src/lib/storage.ts`, `frontend/src/lib/auth.ts`, builders, `builder-actions.tsx`, backend save flows.
- **Зависимости:** D8, политика миграции draft, TTL/очистки, multi-tab conflict и результат C4.
- **Сложность:** L.
- **Самостоятельность:** нет — нужен владелец для правил совместимости и удаления legacy поведения.

### M3. Создать единый typed API/contract source of truth

- **Проблема/цель:** контракты REST/WebSocket частично вручную отражены в `api.ts`, backend models и документации; это уже проявилось в Admin и AI mismatch.
- **Почему важно:** изменения одного слоя не обнаруживаются до runtime.
- **Затрагивает:** FastAPI response/request models, `frontend/src/lib/api.ts`, `frontend/src/lib/types.ts`, WebSocket action/state types, docs.
- **Зависимости:** H2, H8, H10; выбор OpenAPI-generated types или ручного versioned contract.
- **Сложность:** L.
- **Самостоятельность:** нет — подход к генерации/версионированию нужно выбрать владельцу.

### M4. Унифицировать обработку ошибок и пустых ответов Supabase/API

- **Статус:** `DONE`; targeted backend router slices завершены без изменения schema, business rules, API success contracts или production data.
- **Проблема/цель:** прямые обращения роутов к `res.data`, `data[0]` и полям разных таблиц требуют единой проверки ошибок, `None` и пустых результатов.
- **Почему важно:** редкие ошибки БД/неполная запись превращаются в 500, частичное сохранение или неясную ошибку пользователю.
- **Затрагивает:** `backend/database.py`, все затронутые routers/services, frontend API facade и error UI.
- **Зависимости:** C5; определить mapping Supabase errors в стабильные HTTP errors и logging policy.
- **Сложность:** L.
- **Самостоятельность:** да после schema audit, без изменения бизнес-правил.
- **Решение:** локальные DB/API normalization helpers добавлены в `games.py`, `admin.py`, `users.py`, `results.py`, `feedback.py`, `ai.py`, `auth.py` и `telegram_auth.py`; room result persistence отправляет controlled WebSocket error при exception/`None`/empty response. Добавлены regression tests для DB exceptions, `None`, empty, malformed rows, provider failures и duplicate/constraint semantics.
- **Проверки:** backend regression — 80 passed; Python compile и `git diff --check` — passed. Frontend contract не менялся.

### M5. Довести Jeopardy AI до уровня валидации обычного Quiz

- **Статус реализации:** `DONE`. Canonical H8 implementation валидирует Jeopardy categories и questions server-side: 5 уникальных categories, непустые required fields, точное соответствие unique `points` списку `emptySlots` и controlled invalid-response error до builder. Frontend facade и builder сохраняют defensive shape/slot checks; DB/schema не менялись.
- **Проблема/цель:** категории и Jeopardy questions после JSON parse проверяются слабее, чем обычные Quiz variants.
- **Почему важно:** builder может получить missing points/question/answer или неверное количество slots и сломать игру уже после генерации.
- **Затрагивает:** `backend/routes/ai.py`, `ai_prompts.py`, `ai_validator.py`, Jeopardy AI components и builder mapping.
- **Зависимости:** H8 canonical schema; набор обязательных полей и допустимые difficulty/points.
- **Сложность:** M.
- **Самостоятельность:** да после утверждения схемы Jeopardy.

### M6. Ввести индексы, constraints и безопасные RPC только по фактической схеме

- **Проблема/цель:** после schema audit нужно проверить индексы для owner/visibility/results/created_at, unique Telegram/email, каскады и атомарные операции usage/visibility/result insert.
- **Почему важно:** это уменьшит race conditions, ускорит library/results/admin и снизит риск дубликатов.
- **Затрагивает:** Supabase PostgreSQL, backend queries, `ai_usage`, users/games/results/settings.
- **Зависимости:** C5; нельзя проектировать SQL по legacy `md/DATABASE_STRUCTURE.md`. C5 подтвердил duplicate unique indexes, mutable `search_path` у `increment_play_count` и отсутствие FK у result `game_id`; исправления требуют отдельного согласования.
- **Сложность:** L.
- **Самостоятельность:** нет — DDL/RPC и RLS изменения требуют согласования владельца.

### M10. Закрыть RLS и policy gaps после фиксации модели identity

- **Проблема/цель:** Supabase advisor подтвердил отключённый RLS на `settings`, `error_logs`, `ai_logs`, `ai_usage`, `feedback`, `password_resets`; `jeopardy_results` и `online_quiz_results` имеют RLS без policies. Существующие policies используют `auth.uid()`, а приложение — собственные JWT.
- **Почему важно:** таблицы public schema могут быть доступны через PostgREST, а policies могут не ограничивать строки так, как предполагает backend.
- **Затрагивает:** Supabase RLS/policies, `backend/database.py`, auth identity и admin/results routes.
- **Зависимости:** решение о Supabase JWT identity versus privileged backend client; затем owner/non-owner policy tests. Любые RLS changes требуют approval.
- **Сложность:** L.
- **Самостоятельность:** нет — нельзя включать RLS или добавлять policies в production без согласования доступа.

### M11. Согласовать referential integrity для result tables

- **Проблема/цель:** `quiz_results.game_id`, `jeopardy_results.game_id`, `millionaire_results.game_id` и `online_quiz_results.game_id` используются кодом как связи, но FK на `games(id)` отсутствуют.
- **Почему важно:** база не предотвращает orphan results после удаления игры.
- **Затрагивает:** result routes, delete/fork game flows, Supabase constraints и возможное сохранение исторических результатов.
- **Зависимости:** H9 и решение о retention/cascade behavior; перед DDL нужен orphan-data audit и approval владельца.
- **Сложность:** M.
- **Самостоятельность:** нет — каскад, restrict или сохранение исторических результатов требует решения владельца.

### M7. Добавить CI quality gates и безопасную проверку зависимостей

- **Статус реализации:** `DONE`. Добавлен отдельный GitHub CI на PR/push в `main`: frontend clean install/typecheck/build и production `npm audit`, backend compile/tests и `pip-audit`, а также hygiene gate для whitespace, secrets и отслеживаемых artifacts. Branch protection намеренно не настраивался; красный CI означает unsafe release, а merge-blocking остаётся follow-up.
- **Проблема/цель:** typecheck уже красный; нет автоматического обязательного набора lint/build/backend syntax/tests и проверки уязвимых зависимостей.
- **Почему важно:** broken frontend или несовместимые Python/npm зависимости могут попасть в production.
- **Затрагивает:** frontend scripts, backend requirements, CI/repository settings, deployment checklist.
- **Зависимости:** H1 и H7; решение о CI provider и минимально допустимых gates.
- **Сложность:** M.
- **Самостоятельность:** частично; CI policy и branch protection подтверждает владелец.

### M8. Обновить документацию и удалить устаревшие operational утверждения

- **Проблема/цель:** README всё ещё указывает Render, legacy docs описывают SQLite и старый AI contract; документация расходится с VPS/Supabase/Groq фактическим состоянием.
- **Почему важно:** onboarding и incident response будут следовать неверным инструкциям.
- **Затрагивает:** `README.md`, `md/DATABASE_STRUCTURE.md`, `md/AI_LOGIC.md`, `docs/*`, frontend FAQ.
- **Зависимости:** H6, H8 и решение о сохранении legacy документов как historical material.
- **Сложность:** S.
- **Самостоятельность:** да для пометки статуса и ссылок; содержательные продуктовые формулировки требуют ревью владельца.

### M9. Укрепить мониторинг, health checks и audit logging

- **Safe local slice:** HTTP responses получают `X-Request-ID`; 5xx и unhandled failures пишут sanitized structured signal с route template, method, status и duration, а health endpoint возвращает machine-readable `status: ok`. Raw answers, emails, names, tokens и secrets не логируются этим slice. External monitoring/alerts, production config, database retention и PII policy не менялись и остаются за отдельным owner decision.
- **Проблема/цель:** есть health endpoint и таблицы logs, но нет подтверждённого production smoke-check, alerting, correlation ID, метрик WebSocket/AI/Supabase и контроля утечки secrets в логах.
- **Почему важно:** ошибки deployment, polling, AI и комнат будут обнаруживаться только по жалобам пользователей.
- **Затрагивает:** `backend/main.py`, error/AI logs, VPS/Cloudflare/UptimeRobot, admin logs UI, deployment docs.
- **Зависимости:** H6; выбрать monitoring/retention/budget и список PII, которую разрешено логировать.
- **Сложность:** M/L.
- **Самостоятельность:** нет — инфраструктуру и retention policy должен утвердить владелец.

## 🔵 Product

### P1. Поддержать восстановление онлайн-игры после краткого disconnect

- **Проблема/цель:** reconnect/cache есть на frontend, но состояние комнаты живёт в памяти и не имеет устойчивого session/resume механизма.
- **Почему важно:** игрок или host не должны терять игру из-за мобильной сети или краткого restart.
- **Затрагивает:** room backend, reconnect logic, host/player views, result finalization, storage/pub-sub.
- **Зависимости:** C2, H4 и решение о persistent room store.
- **Сложность:** XL.
- **Самостоятельность:** нет — зависит от архитектуры комнат.

### P2. Добавить версионирование игры и snapshot для результатов

- **Проблема/цель:** игра хранится одним JSON в `games.data`; результату нужен точный snapshot/version, по которому проходили игру.
- **Почему важно:** редактирование игры не должно менять смысл старых результатов и облегчает независимый пересчёт.
- **Затрагивает:** builders, `games` persistence, players, results tables, dashboards, online rooms.
- **Зависимости:** C3, H3 и решение о versioning/retention.
- **Сложность:** L.
- **Самостоятельность:** нет — нужна политика владельца по версиям и хранению snapshot.

### P3. Улучшить AI review workflow

- **Проблема/цель:** AI проверяет форму, но не фактологическую корректность; добавить явный review, предупреждения, повторную генерацию и редактирование перед сохранением.
- **Почему важно:** снизить риск публикации ошибочных вопросов и повысить доверие к AI.
- **Затрагивает:** AI components, builders, `ai_validator.py`, prompts, usage/AI logs и UI предупреждений.
- **Зависимости:** H8 и реализация принятой AI policy; внешние fact sources не обязательны.
- **Сложность:** L.
- **Самостоятельность:** нет — нужен продуктовый выбор, какой уровень проверки обещает IslandQuiz.

### P4. Сделать полноценные share/invite flows для игр и комнат

- **Проблема/цель:** развить visibility/link сценарии: безопасные share links, QR для room, понятный invite и expiration/revoke.
- **Почему важно:** это сокращает путь от создания игры до запуска и делает online play удобнее.
- **Затрагивает:** library, game routes, builder actions, join route, room backend/frontend, visibility.
- **Зависимости:** H3, C2, H4 и решение о lifetime/доступе link tokens.
- **Сложность:** L.
- **Самостоятельность:** нет — нужны правила доступа и сроков ссылок.

### P5. Расширить аналитику автора и результаты

- **Проблема/цель:** добавить сравнение попыток, сложность вопросов, completion/time metrics и экспорт отчёта после появления доверенного scoring.
- **Почему важно:** превращает результаты в полезный инструмент для автора и обучения.
- **Затрагивает:** results routes/tables, dashboards, players, online results, frontend charts/export.
- **Зависимости:** C3, P2, schema/index audit и privacy policy.
- **Сложность:** L.
- **Самостоятельность:** нет — нужны решения по метрикам и персональным данным.

### P6. Добавить accessibility/mobile quality pass для builders и players

- **Проблема/цель:** системно проверить keyboard navigation, focus, contrast, screen readers, narrow screens и touch interactions.
- **Почему важно:** builder и player — основные пользовательские поверхности; ошибки особенно заметны на телефонах во время игры.
- **Затрагивает:** shared UI, builders, players, rooms, themes/styles.
- **Зависимости:** H1/build baseline; согласовать минимальный accessibility target.
- **Сложность:** L.
- **Самостоятельность:** да после утверждения target уровня.

## ⚪ Decisions

Принятые решения фиксируют policy; технические детали выбираются внутри соответствующих задач. D4 и D8 остаются открытыми decision blockers.

### D1. Политика JWT и сессий — RESOLVED

- Короткоживущий access token, продление сессии и server-side revoke/logout; ban/delete инвалидируют сессии. TTL, storage и rotation выбираются при C4. Разблокирует C4 и снимает decision dependency с M2.

### D2. Модель безопасности WebSocket player — RESOLVED

- Anonymous join по коду разрешён; server-issued identity связывает reconnect с игроком; spoofing и изменение чужого состояния запрещены; host/player имеют разные права. Разблокирует C2 и снимает decision dependency с C3/H10; H4/P1 всё ещё зависят от D4.

### D3. Канонический scoring и anti-cheat — RESOLVED

- Сервер определяет правильность, очки и итог; client score/correct/delta не доверяются. Host adjustment — отдельная явно фиксируемая ручная корректировка; сохраняются ответы и snapshot/version для проверки. Снимает decision dependency с C3/P2/P5.

### D4. Persistence и масштабирование комнат

- Выбрать single-worker/in-memory как временное ограничение или внешний store/pub-sub (например, отдельный managed service); определить, переживают ли комнаты restart и сколько хранятся.
- Блокирует H4 и P1; влияет на H5/H6.

### D5. Supabase governance — RESOLVED

- Read-only аудит и snapshot выполнены в `docs/DATABASE.md`. Production changes к tables/columns/constraints/indexes/RLS/RPC/migrations/data требуют явного approval; агент готовит предложение, но не применяет его. C5 закрыта; DDL/RLS задачи требуют отдельного approval.

### D6. Семантика visibility и результатов — RESOLVED

- `PRIVATE` — владелец/явно разрешённые пользователи, без публичного каталога; `LINK` — любой по ссылке, без каталога; `PUBLIC` — публичный каталог. Fork независим и не расширяет доступ к source; edit применяет текущее visibility. Разблокирует H3/H9; P4 всё ещё зависит от D4 и C2/H4.

### D7. Deployment topology и release process — RESOLVED

- Утверждены GitHub `main` → Cloudflare Pages для frontend и backend topology на VPS `77.221.137.100:22`, `/opt/islandquiz`, `islandquiz.service`, один Uvicorn worker, Python 3.12 и `.env` только на VPS; полный release policy находится в `docs/DECISIONS.md`. Backend GitHub Actions реализован в H6; full rollback rehearsal остаётся H6.1. Разблокирует H5/M7/M9.

### D8. Стратегия legacy-кода

- Решить, удаляем ли `backend/models.py`, `md/*`, старые localStorage paths и устаревшие README claims, или сохраняем их как явно маркированный historical материал.
- Блокирует M1, M2 и M8.

### D9. AI product policy — DEFERRED

- Решение принято, реализация отложена: AI не гарантирует абсолютную фактическую достоверность; учитываются стоимость моделей/лимитов и privacy/стоимость prompt/log storage; unnecessary expensive calls следует избегать; fact-checking не обязателен. Снимает decision dependency с H8/M5/P3.

## Recommended order

Практический порядок ближайших задач:

1. **H11 — Починить end-to-end AI generation в Quiz Builder.**
2. **H8 — Согласовать фактический AI contract и документацию.**
3. **H7 — Добавить автоматические проверки критических API и room flows.**
4. **C2 — Ввести server-side authorization для WebSocket-комнат.**
5. **C3 — Перенести расчёт результата на доверенную сторону.**
6. **H6.1 — Провести controlled production rollback rehearsal** *(после отдельного approval владельца)*.
7. **H9 — Ввести единый контроль доступа к результатам и online results.**
8. **C1 — Сделать Telegram login token одноразовым** *(после approval для nonce storage/migration)*.
9. **H10 — Ограничить доверие к WebSocket input и стабилизировать protocol validation.**
10. **M3 — Создать единый typed API/contract source of truth.**

Почему первыми именно первые три:

1. **H11:** сейчас это главный blocker working product/demo: ключевой Quiz Builder AI flow падает у пользователя.
2. **H8:** после фикса нужно закрепить фактические response shapes и mapping, чтобы тот же класс ошибки не возвращался в других AI flows.
3. **H7:** воспроизводимые smoke/contract tests должны закрепить full quiz и per-question flows вместе с критическими auth/room сценариями.

Порядок предполагает, что D1–D3, D5–D7 закрыты, D9 отложено без блокировки текущей реализации, а D4 и D8 остаются открытыми. H6 уже завершён; H6.1 остаётся отдельной production follow-up задачей. H4/P1 и legacy tracks сохраняют свои отдельные блокеры.
