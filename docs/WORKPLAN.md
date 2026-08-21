# IslandQuiz — рабочий план

Статус: re-audit current `main`, 2026-08-21. План содержит только активный порядок работ и owner decisions; выполненные задачи перечислены компактно в `docs/BACKLOG.md`.

## Current position

Основной demo-flow работает. Baseline: backend **125/125**, Playwright **41/41**, TypeScript проходит, известных failing tests нет. `npm run lint` падает на repository-wide CRLF/Prettier baseline (~18 915 сообщений), который не является runtime blocker’ом.

Playwright использует mocked auth/games/results API и не доказывает production persistence, Telegram, provider, online-room restart или real Supabase/RLS behavior.

## Owner decisions

### D1 — Server-side sessions

Оставить короткий access token, добавить persistent refresh session, revoke/logout и replay-safe rotation. Storage, TTL и migration требуют отдельного решения.

### D4 — Room persistence

Выбрать между сознательным single-process/in-memory режимом и persistent/shared room state. До решения H4/P1 не закрывать.

### D5 — Supabase governance

Перед RLS/DDL/RPC изменениями выполнить targeted read-only verification и получить owner approval. Определить, должен ли backend использовать privileged role как единственный trust boundary или приложение будет передавать Supabase identity.

### D8 — Legacy code policy

Выбрать для `backend/models.py`, legacy localStorage и старых docs: удалить, архивировать или явно пометить deprecated. Не удалять изолированно.

### D9 — AI product policy

AI остаётся инструментом генерации. Validator проверяет структуру, но не гарантирует фактологическую корректность; fact-checking infrastructure deferred.

## Ordered execution plan

1. **C1 + S1:** Telegram replay protection и password-reset token hardening. Security-critical, требуют atomic consume/storage design.
2. **M10:** Supabase RLS/custom JWT identity strategy и наиболее опасные policy gaps.
3. **R1:** atomic AI quota operation и concurrent regression test.
4. **H4/P1:** room persistence/resume after backend restart, после D4.
5. **H6.1 + M9:** controlled rollback rehearsal, затем production monitoring/alerting/retention.

После этого:

- M6/M11 DB integrity/RPC hardening;
- M3 typed REST/WS contracts;
- M1/M2 legacy cleanup;
- M8 documentation drift prevention;
- P3–P6 product backlog.

## Acceptance baseline for every task

- `git diff --check` проходит;
- изменены только согласованные файлы;
- backend changes: Python compile и relevant backend tests;
- frontend changes: TypeScript, build, lint с отделением pre-existing baseline и relevant Playwright coverage;
- security/DB changes: negative-path tests и отсутствие secrets/production credentials;
- documentation changes: status, counts, dependencies и claims совпадают с current code.

## Deliberately deferred

- normalized `game_snapshots` table — optional hardening; new results already persist signed snapshot/version in result JSON;
- historical AI telemetry reconstruction — старые rows нельзя достоверно дополнить задним числом;
- repository-wide CRLF/Prettier cleanup — quality debt, не runtime blocker;
- production schema/data/RLS/RPC/migrations — только после approval;
- Telegram primary demo, online restart recovery, production rollback operation и external monitoring — не показывать как готовые без соответствующих operational checks.

## Completed checkpoint

C2–C5, H1–H3, H5–H12, M4, M5, M7, P7/P8, Admin Panel v2, Tag System v1, preview/permissions, formatter, mobile Results, offline completion, Admin analytics и AI telemetry подтверждены current main и baseline checks.
