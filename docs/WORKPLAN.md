# IslandQuiz — рабочий план

Статус: актуально на 2026-08-22. Security/reliability этапы C1/S1, M10, R1 и H4/P1 закрыты; активный порядок теперь начинается с operational verification.

## Current position

Основной demo-flow работает. Подтверждены Playwright **41/41**, TypeScript pass и backend **133/133**.

## Ordered execution plan

0. **P9 — расширенная AI-генерация Quiz — DONE:** quick mode сохранён; advanced mode управляет точным распределением через единый backend contract и строгую проверку AI-ответа.
1. **H6.1 — controlled rollback rehearsal:** проверить exact-SHA recovery procedure и health gates с owner approval; не делать реальный rollback только ради теста.
2. **M9 — external monitoring:** выбрать реальный notification provider/credentials и настроить alerts поверх существующих request IDs, 5xx summary, health endpoint и deployment gates.
3. **M6/M11 — DB integrity/RPC hardening:** провести targeted orphan/FK/cascade audit и согласовать additive-safe policy.
4. **M3 — typed REST/WS contracts:** подготовить совместимый source of truth для frontend/backend/room protocol.
5. **M1/M2 + M8:** legacy storage/model audit и lightweight documentation drift check.

Product tasks P3–P6 идут отдельно и не смешиваются с technical debt.

## Resolved implementation checkpoints

- Auth: Telegram nonce durable single-use, password reset token hash/expiry/atomic consume.
- Supabase: service-only RLS/grants зафиксированы; custom JWT не переводился на Supabase Auth; `increment_play_count` search path hardened.
- AI: quota reservation выполняется единым PostgreSQL RPC с transaction-scoped advisory lock; provider failures сохраняют текущую quota semantics.
- AI Quiz: существующий modal поддерживает secondary advanced type distribution, backend-owned стартовые пропорции и exact response validation только для manual mode.
- Rooms: `online_rooms` хранит resumable state/snapshot с HMAC-digested credentials, TTL 30 минут; WebSocket connections остаются process-local.
- Operations: request IDs, sanitized 5xx logs, admin 5xx summary, 90-day error-log cleanup и exact-SHA deployment gates.

## Owner decisions

- **D1:** server-side refresh sessions/revocation — отдельное решение storage, TTL и rotation.
- **D4:** Redis/shared pub-sub не требуется текущей минимальной persistence/resume реализации; пересматривать только при multi-worker deployment.
- **D5:** backend privileged Supabase client остаётся trust boundary; не добавлять `auth.uid()` policies для custom JWT без смены auth architecture.
- **D8:** удалить, архивировать или пометить legacy models/localStorage после targeted audit.
- **D9:** AI validator проверяет структуру, не фактологическую истину.

## Baseline checks

- `git diff --check`;
- `python -m unittest discover -s backend/tests -p 'test*.py'`;
- `cd frontend; npx tsc --noEmit`;
- `cd frontend; npm run build`;
- `cd frontend; npm run test:e2e` (**41/41**);
- `npm run lint` informational only for the known repository-wide CRLF/Prettier baseline (~18 915 messages), unless new errors are introduced by the task;
- Supabase schema/policy/advisor checks after every production migration.

## Deliberately deferred

normalized `game_snapshots`; historical AI telemetry reconstruction; repository-wide CRLF/Prettier cleanup; external alerting until provider/credentials exist; real production rollback until owner-approved rehearsal; Redis/shared pub-sub; server-side sessions until D1.
