# IslandQuiz — Codex model guide

Статус: рекомендации для текущего `docs/WORKPLAN.md` и `docs/BACKLOG.md` на 2026-08-19.

Документ помогает выбрать минимально достаточные Codex mode и reasoning effort. Он не меняет порядок, scope или статусы backlog-задач. В таблицу включены активные/следующие задачи со статусами `READY`, `IN_PROGRESS`, `DEPENDENCY`, `BLOCKED`, а также открытые decision blockers. Завершённые `DONE`/`RESOLVED` задачи намеренно не включены.

## Как читать рекомендации

- **Luna / low** — документация, инвентаризация, локальная проверка с низким риском.
- **Luna / medium** — небольшая локальная задача, где нужно немного reasoning по существующему контракту.
- **Terra / medium** — обычная реализация в ограниченном scope или средняя frontend/backend задача.
- **Terra / high** — межслойная интеграция, тесты или deployment-related работа с понятной архитектурой.
- **Sol / high** — auth/security, DB integrity, server-authoritative scoring или room architecture.
- **Sol / highest** — только для неразрешённого архитектурного выбора с высокой стоимостью ошибки или безопасного production migration plan. В текущем work plan не является default-рекомендацией ни для одной задачи.

## Рекомендации

| Task ID | Task title | Recommended model | Recommended effort | Why | Escalate to Sol if... |
|---|---|---|---|---|---|
| H7 | Добавить автоматические проверки критических API и room flows | Terra | high | Межслойные backend/frontend tests, fixtures и negative security cases; контракты уже перечислены в work plan. | Нужно одновременно проектировать новую security policy, scoring model или persistent room architecture. |
| H8 | Согласовать фактический AI contract и документацию | Terra | high | Нужно сопоставить backend, prompts, validator, frontend mapping и документацию; это contract integration, но без DB/deploy риска. | Обнаружится необходимость менять форму `games.data`, типы вопросов или публичный API без утверждённой схемы совместимости. |
| H11 | Починить end-to-end AI generation в Quiz Builder | Terra | high | Реальный frontend/backend AI integration bug в главном demo flow; требуется понять response shape и исправить mapping, а не скрыть TypeError. | Потребуется менять canonical AI schema, `games.data`, backend contract или добавлять новый provider behavior. |
| H10 | Ограничить доверие к WebSocket input и стабилизировать protocol validation | Terra | high | State-machine inventory и schema validation затрагивают обе стороны WebSocket-протокола. | Меняется модель identity/permissions, scoring или lifecycle комнат; тогда это security/architecture work. |
| M3 | Создать единый typed API/contract source of truth | Terra | medium | Интеграционная задача после H2/H8/H10: реестр контрактов и выбор реализации в ограниченном scope. | Потребуется новый versioning strategy для REST/WS или широкая миграция consumers. |
| C1 | Сделать Telegram login token одноразовым | Sol | high | Auth security, replay prevention и atomic consume с возможной DB-зависимостью. | Не определены nonce storage/atomicity, нужен production schema change или есть race между bot-login и complete. |
| C4.1 | Ввести server-side session lifecycle: refresh и revoke/logout | Sol | high | Persistent sessions, revocation и replay-safe refresh — критический auth design. | Нужно выбирать новую session schema, миграцию production данных или менять trust boundary между JWT и Supabase. |
| H6 | Сделать production deployment повторяемым и проверяемым | Terra | high | Deployment checklist, artifact verification, health/smoke/rollback facts; production deploy в scope задачи не входит. | Требуется менять production infrastructure, secrets, systemd topology или выполнять реальный deploy. |
| H6.1 | Провести controlled production rollback rehearsal | Terra | high | Отдельная operational follow-up задача с понятным workflow и двумя ручными rollback/restore проверками. | Нужен новый deployment design, изменение production secrets/infrastructure или rehearsal нельзя провести без расширения approval. |
| H9 | Ввести единый контроль доступа к результатам и online results | Sol | high | Authorization matrix, PII exposure и cross-user tampering затрагивают security и DB data access. | Нужно менять RLS, Supabase identity model или правила публичности результатов. |
| C2 | Server-side authorization WebSocket-комнат | Sol | high | Server-side host/player identity и permissions — security-critical stateful protocol. | Не утверждены guest identity, reconnect semantics или требуется новый room persistence layer. |
| C3 | Перенести расчёт результата на доверенную сторону | Sol | high | Server-authoritative scoring, anti-cheat и snapshot consistency затрагивают все форматы и результаты. | Нужно менять scoring policy, исторические результаты, game snapshot schema или делать data migration. |
| H4 | Не терять комнаты при restart и не допустить split-brain | Sol | high | Persistence/worker topology и concurrent state — architecture risk с высокой ценой ошибки. | Выбирается Redis/внешний store, pub/sub, multi-worker rollout или recovery migration; `Sol / highest` нужен только для такого неопределённого redesign, не для заранее утверждённого варианта. |
| M4 | Унифицировать обработку ошибок и пустых ответов Supabase/API | Terra | medium | Точечная нормализация `None`/empty/error paths после schema audit, без изменения бизнес-правил. | Ошибки требуют менять DB constraints, transaction boundaries или RLS behavior. |
| M5 | Довести Jeopardy AI до уровня обычного Quiz | Terra | medium | Локальный validator/prompt/mapping contract с понятными fixtures. | Потребуется менять общий AI contract, `games.data` или policy по сохранению несовместимых старых вопросов. |
| M6 | Ввести индексы, constraints и безопасные RPC по фактической схеме | Sol | high | DB integrity, concurrency и reversible migration risk; production DDL запрещён без approval. | Нужен реальный production migration, изменение RLS/constraints с историческими данными или неизвестны orphan/race cases. `Sol / highest` — только для неразрешённого multi-step migration plan. |
| M10 | Закрыть RLS и policy gaps после фиксации модели identity | Sol | high | RLS и policy gaps — прямой security/DB access risk, особенно при custom JWT. | Меняется Supabase JWT identity, privileged backend role или требуется применять policies в production. |
| M11 | Согласовать referential integrity для result tables | Sol | high | FK/cascade/restrict policy влияет на сохранение исторических результатов и удаление игр. | Есть orphan data, нужен production DDL или решение о retention/cascade ещё не принято. |
| M7 | Добавить CI quality gates и безопасную проверку зависимостей | Terra | medium | CI commands, lockfiles, syntax/type/build/test gates — обычная engineering integration после H1/H7. | Меняются repository branch protections, GitHub Actions permissions или release/deploy authorization. |
| M9 | Укрепить monitoring, health checks и audit logging | Terra | high | Нужны deployment/health/logging integration, redaction и failure smoke checks. | Требуется менять production monitoring, retention/PII policy, secrets handling или infrastructure. |
| P1 | Поддержать восстановление онлайн-игры после краткого disconnect | Sol | high | Resume/idempotency и room persistence связаны с C2/H4 и состоянием игры. | Выбирается новая durable room architecture или нужна гарантия восстановления после process restart. |
| P2 | Добавить версионирование игры и snapshot для результатов | Terra | high | Data model и cross-format result integration, но policy D3 уже определена. | Требуется migration существующих `games.data`/results или меняется retention policy. |
| P3 | Улучшить AI review workflow | Terra | medium | Product/UI workflow поверх уже определённых AI contract и D9 policy. | Нужны внешние fact sources, новая privacy/cost policy или изменение AI provider architecture. |
| P4 | Сделать полноценные share/invite flows для игр и комнат | Terra | high | Frontend/backend integration с access matrix, expiration и revoke. | Нужны новые signed link tokens, identity changes, room persistence или production auth policy. |
| P5 | Расширить аналитику автора и результаты | Terra | high | Charts/aggregations/export зависят от trusted scoring, snapshot и privacy; это не простая UI-only задача. | Потребуется менять result schema, RLS/PII policy или вводить новые DB aggregates/RPC. |
| M1 | Убрать двусмысленность вокруг legacy `backend/models.py` | Luna | low | Import/reference inventory и документационное решение с небольшим локальным scope. | Обнаружатся runtime imports, startup dependency или необходимость менять persistence architecture. |
| M2 | Развести legacy localStorage и каноническое состояние | Terra | high | Storage migration затрагивает drafts, auth, visibility, multi-tab и user switching. | Меняется JWT storage/session policy, нужна миграция пользовательских данных или новый client persistence layer. |
| M8 | Обновить документацию и удалить устаревшие operational утверждения | Luna | low | Docs-only cleanup после H6/H8 и D8; application behavior не меняется. | Документ начинает фиксировать новое production/API/DB решение, которое ещё не принято. |
| P6 | Добавить accessibility/mobile quality pass | Terra | medium | Реальная UI-проверка и исправления в shared components/builders/players требуют больше, чем docs-only reasoning. | Нужно массово менять дизайн-систему, navigation architecture или затрагивать сложные room interactions. |
| D4 | Persistence и масштабирование комнат | Sol | high | Это owner decision по room architecture; нужен trade-off analysis, а не обычная реализация. | Сравниваются несколько новых distributed architectures с migration/availability plan; только тогда возможен `Sol / highest`. |
| D8 | Стратегия legacy-кода | Luna | low | Небольшое policy/documentation решение: удалить, архивировать или явно пометить legacy. | Обнаружится скрытая runtime dependency или решение затрагивает persistence migration. |

## Группы по экономии лимитов

### Можно делать дешёво на Luna

- **M1** — inventory и legacy status.
- **M8** — документация после подтверждения фактов.
- **D8** — фиксация policy по legacy-коду.
- Подготовительные read-only инвентаризации внутри H7/H8/H10/M3 можно начинать на **Luna / low–medium**, если не принимаются новые решения и не меняется код.

### По умолчанию Terra

- **Terra / medium:** M3, M4, M5, P3, P6, M7.
- **Terra / high:** H6, H6.1, H7, H8, H10, H11, M9, P2, P4, P5.

Это задачи с понятным scope, но с несколькими файлами, contract checks, UI/backend integration или deployment documentation.

### Требуют Sol

- **Sol / high:** C1, C2, C3, C4.1, H4, H9, M6, M10, M11, P1 и D4.
- **Sol / highest:** сейчас нет задачи, для которой этот уровень нужен по умолчанию. Он оправдан только при одновременном выборе новой архитектуры и подготовке необратимой/production-sensitive миграции.

## Практическое правило эскалации

Начинать с указанной рекомендации. Эскалировать на Sol только если в ходе задачи появляется новый security boundary, незафиксированная архитектура, production DB/infrastructure change, миграция исторических данных или конфликт между несколькими слоями, который нельзя безопасно разрешить по `WORKPLAN.md` и `docs/DECISIONS.md`.
