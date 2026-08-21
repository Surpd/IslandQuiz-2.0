# IslandQuiz — актуальный backlog

Статус: re-audit current `main`, 2026-08-21. В active backlog находятся только незавершённые задачи. История выполненного — в конце файла и в Git history.

## Baseline

- Backend tests: **125/125**.
- Playwright: **41/41**, известных failing tests нет.
- TypeScript: проходит.
- Основной demo-flow работает.
- Repository-wide lint остаётся красным на CRLF/Prettier baseline (~18 915 сообщений); это не runtime blocker.

## Technical debt

### Security / high priority

#### C1 — Telegram login replay protection

- **Не сделано:** HMAC nonce подписывается, но не хранится и не consume-ится атомарно; один token можно повторно использовать в течение 5 минут.
- **Почему важно:** replay может повторно завершить Telegram login/linking flow.
- **Severity:** critical. **Effort:** large. **User blocker:** для безопасного Telegram login — да; для email/password demo — нет.
- **Порядок:** 1. Нужны storage и atomic consume decision.

#### S1 — Password reset token hardening

- **Не сделано:** reset token хранится в открытом виде; expiry и одноразовое consume не объединены в атомарную операцию.
- **Почему важно:** компрометация служебной таблицы или race при повторной отправке увеличивает риск смены пароля.
- **Severity:** high. **Effort:** medium. **User blocker:** нет, но это security debt.
- **Порядок:** вместе с C1/C4.1.

#### C4.1 — Server-side session lifecycle

- **Не сделано:** нет refresh sessions, server-side revoke/logout и replay-safe rotation; access token stateless на 1 час.
- **Почему важно:** украденный token действует до expiry.
- **Severity:** high. **Effort:** large. **User blocker:** нет для основного flow.
- **Порядок:** после решения о persistent session storage.

#### M10 — Supabase RLS и custom JWT identity strategy

- **Не сделано:** application использует собственные JWT, а существующие policies ориентированы на `auth.uid()`; RLS disabled на `settings`, `error_logs`, `ai_logs`, `ai_usage`, `feedback`, `password_resets`; `jeopardy_results` и `online_quiz_results` имеют RLS без policies.
- **Почему важно:** нельзя считать Supabase RLS корректным owner/non-owner boundary без явного решения о роли backend client и Data API.
- **Severity:** high. **Effort:** large. **User blocker:** conditional; зависит от прямого Supabase access.
- **Порядок:** 2, после read-only verification и owner approval.

### Reliability / operations

#### R1 — Atomic AI quota enforcement

- **Не сделано:** дневной quota проверяется как `SELECT count` затем `INSERT`; concurrent requests могут пройти одну и ту же границу.
- **Почему важно:** возможен перерасход provider quota/cost.
- **Severity:** medium. **Effort:** medium. **User blocker:** нет.
- **Порядок:** 3; нужен concurrency test и безопасная RPC/transaction strategy.

#### H4/P1 — Room persistence and resume

- **Не сделано:** room state in-memory; backend restart удаляет комнаты, а reconnect работает только в коротком grace window того же процесса.
- **Почему важно:** активная online game может потеряться.
- **Severity:** high для online users. **Effort:** large. **User blocker:** только для online game при restart.
- **Порядок:** 4, после решения D4 о persistence/shared state.

#### H6.1 — Controlled rollback rehearsal

- **Не сделано:** rollback workflow и `workflow_dispatch(target_sha)` существуют, но production rehearsal не проводился.
- **Почему важно:** capability ещё не подтверждена реальным incident path.
- **Severity:** high operational. **Effort:** medium. **User blocker:** нет.
- **Порядок:** 5, только с отдельным owner approval.

#### M9 — Production monitoring and alerting

- **Не сделано:** есть local health, request ID и sanitized 5xx logging, но нет подтверждённых внешних alerts, retention policy и production dependency checks.
- **Почему важно:** outage/Telegram/AI/room failures могут обнаруживаться только по жалобам.
- **Severity:** medium. **Effort:** medium. **User blocker:** нет.
- **Порядок:** 5 вместе с rollback readiness.

### Medium / long-term technical debt

#### M6/M11 — DB integrity and RPC hardening

- **Не сделано:** result tables не имеют FK на `games`, есть duplicate indexes, у `increment_play_count` остаётся mutable `search_path`; constraints/cascade/orphan policy не согласованы.
- **Почему важно:** слабее referential integrity и concurrency/security posture базы.
- **Severity:** medium. **Effort:** large. **User blocker:** нет.
- **Порядок:** после M10, orphan audit и owner approval на DDL/RPC.

#### M3 — Typed REST/WS contract source of truth

- **Не сделано:** backend models, `api.ts` и WebSocket state/action types поддерживаются вручную.
- **Почему важно:** contract drift обнаруживается поздно, несмотря на текущий passing baseline.
- **Severity:** medium. **Effort:** large. **User blocker:** нет.
- **Порядок:** после security/reliability work.

#### M1/M2 — Legacy models и localStorage cleanup

- **Не сделано:** `backend/models.py`, legacy storage keys и draft/auth compatibility layers ещё сосуществуют с canonical Supabase/backend state.
- **Почему важно:** stale values и legacy schema могут вводить разработчиков в заблуждение; удаление требует отдельной migration policy.
- **Severity:** medium. **Effort:** large. **User blocker:** нет.
- **Порядок:** только после решения D8 и отдельного storage audit.

#### M8 — Documentation drift prevention

- **Не сделано:** нужна постоянная проверка stale claims в onboarding/operational docs и компактное обновление baseline counts/statuses после крупных задач.
- **Почему важно:** неверные инструкции ломают incident response и планирование.
- **Severity:** low. **Effort:** small. **User blocker:** нет.
- **Порядок:** поддерживать при каждом значимом релизе.

## Product backlog

Эти пункты не являются техническими blocker’ами основного demo-flow.

### P3 — AI review workflow

Показать границы структурной AI-проверки, сохранить review-before-save, warnings и edit/regenerate states. **Severity:** medium. **Effort:** medium.

### P4 — Share/invite improvements

Добавить предсказуемые share/QR/invite flows, expiration/revoke policy и UX для private/link/public и rooms. **Severity:** medium. **Effort:** large. Зависит от D4/D6.

### P5 — Author-facing analytics and exports

Расширить author dashboard метриками, time/completion/attempt views и exports на trusted results без лишней PII. **Severity:** medium. **Effort:** large.

### P6 — Accessibility audit

Проверить keyboard/focus/contrast/screen-reader labels и narrow touch flows для builders/players. **Severity:** medium. **Effort:** medium.

## Optional hardening / deferred

- **P2:** normalized `game_snapshots` table, retention и FK. Новые результаты уже содержат immutable signed snapshot/version в существующем JSON; отдельная table не блокирует пользователей.
- Historical AI telemetry не восстанавливать искусственно: старые rows не имеют полного provider/token/error контекста.
- CRLF/Prettier cleanup не включать в product/security work: baseline noisy, но runtime не ломает.
- AI fact-checking и расширенная policy остаются deferred; validator проверяет структуру, не истинность фактов.
- `xlsx@0.18.5` остаётся owner-approved dependency risk до отдельной замены/изоляции.

## Open decisions

- D1/C4.1: storage, TTL и rotation для server-side sessions.
- D4: persistence/shared state policy для rooms.
- D5/M10: Supabase JWT identity versus privileged backend client и точная RLS policy model.
- D8: судьба legacy models/localStorage.
- M9: production monitoring budget, retention и допустимая PII.

## Compact completed history

C2–C5, H1–H3, H5–H12, M4, M5, M7, P7 и P8 закрыты. Отдельно завершены Admin Panel v2, Tag System v1, Library preview, `show_answers`/preview/copy permissions, unified answer formatter, mobile Results, offline completion, Admin analytics и AI telemetry.
