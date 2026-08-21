# Demo readiness — school beta

Статус: operational checklist, актуально на 2026-08-21.

## Основной demo-flow

1. Войти подготовленным email/password аккаунтом.
2. Открыть Quiz Builder и создать короткий Quiz вручную или через AI.
3. Просмотреть и при необходимости отредактировать вопросы.
4. Сохранить игру и открыть её из Library.
5. Запустить offline player, ответить на вопросы и показать Results.

## Что подтверждено automated baseline

- Backend tests: `125/125`.
- Playwright: `41/41`.
- TypeScript: `npx tsc --noEmit` проходит.
- Save → Library → reopen → offline player → answer → finish покрыт mocked E2E flow.

## Manual pre-demo checklist

- [ ] Открывается production frontend.
- [ ] Подготовленный аккаунт входит.
- [ ] Quiz Builder открывается без console-breaking error.
- [ ] Можно добавить и отредактировать вопрос.
- [ ] AI generation работает или подготовлен fallback Quiz.
- [ ] Перед сохранением вопросы просмотрены человеком.
- [ ] Save завершается успешно.
- [ ] Игра открывается повторно из Library.
- [ ] Offline player принимает ответы.
- [ ] Finish показывает Results.

## Не использовать как основной demo proof

- Telegram login и password reset.
- Online rooms, reconnect после backend restart и room persistence.
- Production rollback, monitoring/alerting и реальные Supabase/RLS checks.
- AI как источник проверенной фактической истины.

Admin Panel v2, preview/permissions, tags и official import реализованы, но не входят в основной школьный demo-flow; их можно показывать отдельным сценариям после соответствующей manual smoke-проверки.

## Известные non-blockers

- `npm run lint` выдаёт repository-wide CRLF/Prettier baseline (~18 915 сообщений), но это не runtime failure.
- AI validator проверяет структуру, а не факты.
- Historical AI telemetry неполна и не должна восстанавливаться искусственно.
- E2E использует mocked API и не доказывает production persistence.
