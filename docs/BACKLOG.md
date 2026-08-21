# IslandQuiz — актуальный backlog

Статус: re-audit current `main`, 2026-08-22. В active backlog находятся только реальные незавершённые задачи; выполненные задачи не дублируются мелким списком.

## Baseline

- Backend: **133/133**.
- Playwright: **41/41**, известных failing tests нет.
- TypeScript: проходит.
- Основной demo-flow работает.
- Repository-wide lint: около 18 915 CRLF/Prettier сообщений; это не runtime blocker.

## Active technical debt

### HIGH / SECURITY

#### C4.1 — Server-side session lifecycle

Persistent refresh sessions, server-side revoke/logout и replay-safe rotation ещё не внедрены; текущий access JWT stateless на 1 час. Это не блокирует основной demo-flow, но ограничивает отзыв украденного токена. **Severity:** high. **Effort:** large. **User blocker:** нет. **Порядок:** 6.

#### M10 — Supabase RLS/custom JWT strategy — RESOLVED, policy model documented

Service-only tables теперь имеют RLS и direct `PUBLIC/anon/authenticated` grants отозваны; backend service-role flow сохранён. `auth.uid()`-policies для custom IslandQuiz JWT не добавлялись. Advisor INFO «RLS enabled, no policy» для этих таблиц ожидаем и не является открытым доступом.

### RELIABILITY / OPERATIONS

#### H6.1 — Controlled production rollback rehearsal

Workflow exact-SHA checkout, restart, local health и SHA verification подтверждены кодом; безопасный локальный rehearsal procedure документирован, но реальный production rollback ещё не выполнялся. **Severity:** high. **Effort:** medium. **User blocker:** нет. **Порядок:** 1, только с owner approval.

#### M9 — External monitoring/alerting channel

Внутренняя основа готова: request IDs, safe 5xx logs, `/api/admin/observability/summary`, 90-day cleanup и deployment health gates. Не хватает реального внешнего notification provider/credentials и настроенных alerts для unavailable backend, health failure, 5xx spike и failed deployment. **Severity:** medium. **Effort:** medium. **User blocker:** нет. **Порядок:** 2.

### MEDIUM / LONG TERM

#### M6/M11 — DB integrity и RPC hardening

`games`/results сохраняются через существующую JSON-модель; часть result `game_id` всё ещё без FK, orphan/cascade policy не согласована. `increment_play_count` получил fixed `search_path`, но полноценный integrity audit и безопасная FK policy не сделаны. **Severity:** medium. **Effort:** large. **User blocker:** нет. **Порядок:** 3.

#### M3 — Typed REST/WS contracts

Backend models, `frontend/src/lib/api.ts` и room action/state types поддерживаются вручную. Нужен единый typed contract без breaking change. **Severity:** medium. **Effort:** large. **User blocker:** нет. **Порядок:** 4.

#### M1/M2 — Legacy models и localStorage cleanup

`backend/models.py`, legacy storage keys и draft/auth compatibility layers ещё сосуществуют с canonical backend/Supabase state. Удаление требует отдельного storage audit. **Severity:** medium. **Effort:** large. **User blocker:** нет. **Порядок:** 5.

#### M8 — Documentation drift prevention

Нужна лёгкая автоматическая проверка stale status/count/architecture claims после крупных изменений. **Severity:** low. **Effort:** small. **User blocker:** нет. **Порядок:** 5.

## Product backlog

Эти пункты не являются technical debt и не блокируют основной demo-flow:

- **P3 — AI review workflow:** review-before-save, warnings, edit/regenerate states. **Medium / medium.**
- **P4 — Share/invite improvements:** share/QR/invite UX, expiration/revoke policy для link/public/private и rooms. **Medium / large.**
- **P5 — Author-facing analytics and exports:** метрики completion/attempt/time и exports без лишней PII. **Medium / large.**
- **P6 — Accessibility audit:** keyboard/focus/contrast/screen-reader и narrow touch flows. **Medium / medium.**

## Optional / deliberately deferred

- normalized `game_snapshots` table — optional hardening; signed snapshot/version уже хранится в result JSON;
- historical AI telemetry не восстанавливать искусственно;
- repository-wide CRLF/Prettier cleanup не смешивать с product/security work;
- Redis/shared pub-sub и multi-worker rooms не нужны для текущего single-process resume;
- внешний alerting до появления согласованных provider и credentials;
- server-side sessions до отдельного решения о storage/TTL/rotation;
- `xlsx@0.18.5` — отдельный dependency risk, не blocker текущего flow.

## Closed in current main

Telegram replay protection; password-reset hardening; C2 WebSocket authorization; C3 server-side scoring; C4 basic JWT protection; C5 read-only Supabase audit; H1–H3, H5 и H7–H12; M4/M5/M7; P7/P8; Admin Panel v2; Tag System v1; Official Content Import; Library preview; permissions; unified answer formatter; mobile Results; offline completion; Admin analytics; AI telemetry; atomic AI quota; room persistence/resume. H6.1 rollback rehearsal remains active.
