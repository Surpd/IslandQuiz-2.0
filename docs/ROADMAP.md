# IslandQuiz — текущая карта и ближайший маршрут

Статус: краткая roadmap-карта на 2026-08-19. Источники статусов и acceptance criteria: `docs/WORKPLAN.md` и `docs/BACKLOG.md`; модель для выполнения задач — `docs/CODEX_MODEL_GUIDE.md`.

## Current state

- Основные frontend baseline/contracts уже приведены в рабочее состояние: H1, H2, H3 и C4 отмечены `DONE`.
- Supabase production snapshot и deployment topology документированы; H5 и C5 закрыты.
- Backend deployment automation H6 закрыта: GitHub Actions публикует exact SHA на VPS, проверяет syntax/systemd/local health и SHA. Documentation-only и frontend-only push не запускают backend deploy.
- Cloudflare public check остаётся diagnostic warning: `403` от edge не означает failure backend deployment.
- Rollback capability через `workflow_dispatch(target_sha)` существует, но полный controlled rehearsal ещё не проведён.
- Codex model routing зафиксирован в `docs/CODEX_MODEL_GUIDE.md` и связан с процессом через `AGENTS.md`.

## Recently completed

- **H1 / DONE:** устранены исходные TypeScript errors.
- **H2 / DONE:** синхронизирован Admin API/frontend contract.
- **H3 / DONE:** visibility сохраняется при edit/create/fork по D6.
- **C4 / DONE:** базовая JWT-защита усилена.
- **H5 / DONE:** подтверждена single-instance Telegram polling topology.
- **C5 / DONE:** выполнен read-only Supabase schema/RLS/RPC snapshot.
- **H6 / DONE:** backend deployment automation работает; rollback rehearsal вынесен в H6.1.
- **CODEX_MODEL_GUIDE:** для задач добавлен выбор Luna/Terra/Sol с условиями escalation.

## Broken / needs fix now

### H11 — Quiz Builder AI generation (`DONE`, Terra / high)

Исправлены два пользовательских сбоя:

- full quiz generation падает с `Cannot read properties of undefined (reading 'map')`;
- per-question AI helper падает с `Cannot read properties of undefined (reading 'length')`.

Frontend теперь нормализует success payload и переводит error/empty/malformed response в controlled UI error до `.map`/`.length`; legacy malformed QuizData не ломает builder. Jeopardy raw-response backend validation остаётся H8 follow-up.

Завершённый scope H11: `ai-generate-quiz.tsx`, `ai-helper.tsx`, `ai-jeopardy-category.tsx`, `builder.quiz.tsx`, `api.ts` и проверка фактического backend AI contract. Canonical AI schema и `games.data` не менялись.

## Next 3–5 recommended tasks

1. **H8 — Согласовать AI contract и документацию** — **Terra / high**. Закрепить response shapes, включая server-side Jeopardy validation.
2. **H7 — Добавить критические API/room/AI tests** — **Terra / high**. Зафиксировать full quiz и per-question regression cases.
3. **C2 — Server-side authorization WebSocket-комнат** — **Sol / high**. Главный security blocker онлайн-режима.
4. **C3 — Server-side scoring и trusted results** — **Sol / high**. Закрыть целостность результатов после C2.

Отдельный operational follow-up: **H6.1 — rollback rehearsal**, **Terra / high**, только после отдельного owner approval на production operation. Он важен для восстановления, но не является причиной блокировать текущий AI demo fix.

## Deferred / not now

- **H4 / P1 / P4:** persistence и resume комнат — ждут решения D4.
- **M6 / M10 / M11:** production DB constraints/RPC/RLS/FK — только после targeted proposal и отдельного approval; ничего не менять автоматически.
- **C1:** Telegram single-use nonce — ждёт выбранного storage/atomic consume и approval.
- **C4.1:** server-side session lifecycle — отдельная auth-задача, не blocker базовой C4.
- **M1 / M2 / M8:** legacy models/localStorage/docs cleanup — ждут D8 и не должны отвлекать от demo blocker.
- **P3 / P5 / P6:** AI review, analytics и accessibility — после исправления основного AI flow и критической security/data-integrity работы.
- **D9:** fact-checking и расширенная AI policy остаются deferred; H11 не должен превращаться в новую AI product architecture.

## Risks / do not touch without approval

- Не менять production DB, RLS, RPC, constraints, migrations или data.
- Не выполнять H6.1 rollback rehearsal без отдельного approval; не путать capability workflow с проведённым rehearsal.
- Не менять `.github/workflows/backend-deploy.yml`, VPS, secrets, Cloudflare или nginx в рамках H11/roadmap cleanup.
- Не менять canonical AI schema или `games.data` в рамках точечного bugfix без обновления H8 и проверки всех consumers.
- Security/room/auth задачи выполнять на рекомендованном Sol и не принимать новые архитектурные решения молча.

## Working formula

Сначала закрыть H11 → закрепить contract H8 → добавить regression coverage H7 → затем двигаться к C2/C3. Для обычных docs/process изменений использовать Luna; для AI/frontend integration — Terra; для auth/security/rooms/DB — Sol. Подробные правила выбора находятся в `docs/CODEX_MODEL_GUIDE.md`.
