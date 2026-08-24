# IslandQuiz — текущая карта и ближайший маршрут

Статус: актуально на 2026-08-22. Подробные acceptance criteria — `docs/BACKLOG.md`; порядок работ — `docs/WORKPLAN.md`.

## Где проект находится сейчас

Основной demo-flow работает: email/password login → Quiz Builder → save → Library → reopen → offline player → answer → finish → Results.

В текущем `main` также работают Admin Panel v2, Tag System v1, Official Content Import, Library preview, permissions `show_answers`/`preview/copy`, единый Quiz answer formatter, mobile Results, offline completion, Admin analytics, AI telemetry, WebSocket authorization и server-side scoring.

Закрыты последние security/reliability этапы: Telegram replay protection, password-reset hardening, backend-only Supabase RLS boundary, atomic AI quota и durable room resume after restart. Внешнего alerting provider пока нет; production rollback rehearsal ещё не выполнялся.

## Baseline проверок

Объём проверки конкретной задачи выбирается по [канонической verification policy](VERIFICATION.md); сохранённые числа ниже являются ориентиром, а фактическим evidence считается output реально выполненной команды.

- Backend: `python -m unittest discover -s backend/tests -p 'test*.py'` — **133/133**.
- Frontend TypeScript: `cd frontend; npx tsc --noEmit` — проходит.
- Browser suite: `cd frontend; npm run test:e2e` — текущий подтверждённый baseline **41/41**.
- Известных failing tests нет.
- `npm run lint` остаётся красным из-за repository-wide CRLF/Prettier baseline (~18 915 сообщений); это не runtime blocker.

Playwright использует mocked auth/games/results API. Он подтверждает frontend flow, но не заменяет production/Supabase, Telegram provider, real AI provider, room restart и migration checks.

## Следующие пять задач

1. **Controlled production rollback rehearsal** — безопасно пройти exact-SHA rollback procedure с owner approval и health verification; не выполнять реальный откат без отдельного approval.
2. **External monitoring channel** — подключить один реальный notification provider/credential и alert rules для unavailable backend, health failure, 5xx spike и failed deployment.
3. **DB integrity/RPC hardening** — отдельно согласовать FK/orphan/cascade policy для result tables и remaining database constraints.
4. **Typed REST/WS contracts** — уменьшить ручное расхождение backend models, `api.ts` и room protocol.
5. **Legacy cleanup и drift prevention** — провести отдельный audit `backend/models.py`/localStorage и добавить lightweight docs/status check.

## Product backlog

AI review workflow; share/invite improvements; author-facing analytics/exports; accessibility audit.

## Сознательно отложено

- normalized `game_snapshots` table — optional hardening; results уже содержат immutable signed snapshot/version в JSON;
- historical AI telemetry не восстанавливать искусственно: старые rows не имеют полного provider/token/error контекста;
- repository-wide CRLF/Prettier cleanup — quality debt, но не product/runtime blocker;
- server-side session lifecycle/refresh rotation — отдельное архитектурное решение, текущий access JWT остаётся stateless;
- Redis/shared pub-sub и multi-worker room architecture — не нужны для текущего single-process resume и не добавлялись;
- внешний alerting — до появления согласованного provider и credentials.

## Baseline и операционные ограничения

- Backend service-role client — единственный путь к service-only tables; custom IslandQuiz JWT не подменяется `auth.uid()`.
- Supabase Advisor INFO `RLS enabled, no policy` для service-only tables ожидаем: direct `PUBLIC/anon/authenticated` grants отозваны.
- Комнаты сохраняют snapshot/state в `online_rooms`, raw credentials не сохраняются; WebSocket connections остаются process-local, TTL — 30 минут.
- `/api/admin/observability/summary` показывает окно 5xx, а cleanup endpoint использует 90-day error-log retention.
- Production deployment workflow проверяет exact SHA, restart, local health и deployed SHA; public Cloudflare check остаётся diagnostic.
