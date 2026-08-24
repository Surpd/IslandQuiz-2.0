# IslandQuiz — verification policy

Статус: canonical policy для проверки задач на 2026-08-24.

Эта policy определяет, как выбирать минимально достаточную проверку после изменения. Она согласована с `AGENTS.md`, `docs/WORKPLAN.md`, `docs/BACKLOG.md`, `docs/ROADMAP.md` и локальными agent skills. Она не требует менять Playwright config или package scripts.

## Главный принцип

Verification должна быть пропорциональна scope и риску задачи. Агент выбирает самый дешёвый уровень, который надёжно подтверждает изменённое поведение:

| Уровень | Когда использовать | Примеры |
|---|---|---|
| Static | Всегда первым | diff, typecheck, syntax, contract inspection |
| Unit/integration | Для затронутой логики/API | backend tests, validator, API fixtures |
| Targeted E2E | Если меняется user-facing browser flow | один spec/test через `--grep` |
| Targeted spec | После того, как новые scenarios по одному green | один итоговый spec без лишних reruns |
| Full E2E | Только для broad/high-risk change или явного acceptance criterion | `cd frontend; npm run test:e2e` один раз как final gate |

Full regression suite не является обязательным финалом каждой небольшой задачи. PASS targeted regression вместе с подходящими static/unit/integration checks может быть достаточным `DONE` gate.

## Recommended loop

1. Прочитать acceptance criteria и определить affected subsystem.
2. Проверить существующие specs, fixtures, mocks, helpers, locators и established patterns до написания нового E2E.
3. Выполнить static/unit/integration checks.
4. Если нужен E2E, отлаживать новые или изменённые scenarios по одному:

   `scenario 1 → targeted test → PASS → scenario 2 → targeted test → PASS`

5. После green отдельных scenarios разрешён максимум один итоговый targeted-spec run, если он действительно добавляет уверенность.
6. Full E2E запускать только по risk/acceptance criteria и не повторять после каждого небольшого исправления.

Пример targeted запуска:

```powershell
cd frontend
npx playwright test e2e/<spec>.spec.ts --grep "<scenario>"
```

или через существующий script:

```powershell
npm run test:e2e -- e2e/<spec>.spec.ts --grep "<scenario>"
```

## E2E не является development loop

Playwright не использовать как основной пошаговый debugger продукта или самого теста. Сначала проверить очевидные причины статически и по существующему коду: неправильный locator, mock path, fixture/setup, validation state, readiness/hydration, API shape и route.

После failure/timeout сначала классифицировать причину:

- product regression;
- test implementation/locator;
- mock/fixture/setup;
- validation/readiness/hydration;
- network/provider;
- test infrastructure.

Только после классификации запускать минимальный тест, который воспроизводит проблему. После двух неудачных запусков с неясной причиной нужно менять диагностический подход, а не повторять длинную команду.

## Time budget

Для небольшой или средней задачи verification/debugging не должен бесконтрольно занимать десятки минут. Если после примерно 10 минут причина ещё не установлена:

1. остановить автоматический цикл;
2. сообщить, что уже PASS и что FAIL;
3. указать количество запусков и зависшую/падающую команду;
4. классифицировать failure;
5. предложить следующий диагностический шаг.

Исключение — явный запрос на глубокую диагностику test infrastructure или обязательный full regression gate.

## Server lifecycle и cold Vite

- Не перезапускать test server без необходимости при iterative targeted debugging, если текущая инфраструктура позволяет безопасный reuse.
- Final/CI regression должен оставаться воспроизводимым в clean environment.
- Не объяснять длительность проверки просто cold Vite. При подозрении измерить: process start → server ready → page hydrated → test start → test finish → teardown.
- Если server ready занимает секунды или десятки секунд, искать следующий blocker; не увеличивать timeout без доказанной причины.
- Текущий Playwright config использует `reuseExistingServer: false`; изменение этого поведения или package scripts — отдельная follow-up задача, не часть обычного product task.

## Diagnostic artifacts

Trace, screenshot и video включать для диагностики реального failure. Не создавать тяжёлый diagnostic cycle автоматически для каждого обычного targeted запуска.

## Unrelated failures и baseline

Если product scope выполнен, а проверка обнаружила unrelated test infrastructure или pre-existing baseline проблему:

- подтвердить, что failure не вызван текущей задачей;
- не расширять scope автоматически;
- зафиксировать отдельную follow-up задачу;
- сообщить пользователю.

Статические числа test counts в roadmap/docs могут устареть после добавления specs. Источником фактического результата является конкретный выполненный command и его output, а не сохранённое число в документации.

## Final report

Указывать только реально выполненные проверки и их результат: command, targeted/full scope, PASS/FAIL и важные ограничения evidence. Не запускать дорогие проверки только для более полного вида отчёта и не утверждать PASS без фактического запуска.

## Follow-up, не входящий в эту policy

Если для более быстрого targeted workflow потребуется изменить `playwright.config.ts`, package scripts, fixture architecture или server lifecycle, сначала создать отдельную задачу с конкретным acceptance criterion. В рамках изменения этой policy такие технические изменения не выполняются.
