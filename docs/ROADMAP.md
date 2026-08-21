# IslandQuiz — текущая карта и ближайший маршрут

Статус: актуально на 2026-08-21. Источник подробных acceptance criteria — `docs/BACKLOG.md`; порядок выполнения и owner decisions — `docs/WORKPLAN.md`.

## Где проект находится сейчас

Основной demo-flow работает: email/password login → Quiz Builder → сохранение → Library → повторное открытие → offline player → answer → finish → Results.

В текущем `main` подтверждены:

- Admin Panel v2 и Admin analytics;
- Tag System v1;
- Official Content Import `library-v1`;
- Library preview, `show_answers`, `preview/copy` permissions;
- единый Quiz answer formatter;
- mobile Results и offline completion screen;
- canonical AI contract и AI telemetry;
- server-side WebSocket identity/authorization и trusted scoring.

## Baseline проверок

- Backend: `python -m unittest discover -s backend/tests -p 'test*.py'` — **125/125**.
- Frontend TypeScript: `cd frontend; npx tsc --noEmit` — проходит.
- Browser suite: `cd frontend; npm run test:e2e` — **41/41**.
- Известных failing tests нет.
- `npm run lint` остаётся красным из-за repository-wide CRLF/Prettier baseline (~18 915 сообщений); это не runtime blocker.

Playwright использует mocked auth/games/results API. Он подтверждает frontend flows, но не заменяет production/Supabase, Telegram, provider, online-room restart и real-result integration checks.

## Следующие пять задач

1. **Telegram replay protection и password-reset token hardening** — закрыть повторное использование Telegram nonce и усилить хранение/одноразовое consume password-reset tokens.
2. **Supabase RLS/custom JWT strategy** — определить trust boundary между application JWT и Supabase roles, затем закрыть наиболее опасные policy gaps.
3. **Atomic AI quota enforcement** — заменить `count → insert` на атомарную серверную операцию и добавить concurrent regression test.
4. **Room persistence/resume** — принять D4 policy и решить потерю онлайн-комнат после backend restart.
5. **Rollback rehearsal и production monitoring** — провести controlled rehearsal с approval и добавить внешний alerting/retention policy.

## Дальше

Technical debt: DB integrity/RPC hardening, typed REST/WS contracts, legacy models/localStorage cleanup и documentation drift prevention.

Product backlog: AI review workflow, share/invite improvements, author-facing analytics/exports и accessibility audit.

## Сознательно отложено

- normalized `game_snapshots` table — optional hardening; новые результаты уже содержат signed snapshot/version в существующем JSON;
- полное восстановление historical AI telemetry — старые `ai_usage` rows не имеют полного provider/token/error контекста и не должны искусственно восстанавливаться;
- repository-wide CRLF/Prettier cleanup — quality debt, но не product/runtime blocker;
- расширенная AI fact-checking policy — AI не является источником фактической истины;
- production schema/RLS/RPC/constraint changes — только после read-only verification и owner approval.

## Completed history

Закрыты: C2–C5, H1–H3, H5–H12, M4, M5, M7, P7, P8. Дополнительные completed slices: Admin Panel v2, Tag System v1, preview/permissions, formatter, mobile Results, offline completion, Admin analytics и AI telemetry.

## Операционные ограничения

- Комнаты хранятся в памяти одного backend-процесса и исчезают после restart.
- Telegram bot запускается внутри единственного production backend process.
- Production Supabase не меняется documentation-only задачами.
