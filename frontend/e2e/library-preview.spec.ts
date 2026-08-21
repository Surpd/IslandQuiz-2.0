import { expect, test } from "@playwright/test";

const apiOrigin = "https://api.islandquiz.online";

test.use({ viewport: { width: 390, height: 844 } });

test("Library preview respects show_answers and renders all game kinds", async ({ page }) => {
  let showAnswers = false;
  await page.route(`${apiOrigin}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path !== "/api/games/")
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    const games = [
      {
        id: "preview-quiz",
        kind: "quiz",
        data: {
          config: {
            title: "Preview Quiz",
            description: "Описание quiz",
            theme: "amber",
            orderMode: "sequential",
            showResult: "end",
            defaultTime: 30,
            totalTime: 10,
          },
          questions: [
            {
              id: "q1",
              type: "choice",
              q: "Столица Франции?",
              options: ["Париж", "Рим", "Берлин", "Мадрид"],
              answer: "Париж",
              points: 100,
              time: 30,
            },
            {
              id: "q2",
              type: "bool",
              q: "Земля круглая?",
              options: [],
              answer: "true",
              points: 100,
              time: 30,
            },
            {
              id: "q3",
              type: "text",
              q: "Столица Исландии?",
              options: [],
              answer: "Рейкьявик, Reykjavik",
              points: 100,
              time: 30,
            },
            {
              id: "q4",
              type: "matching",
              q: "Сопоставьте вулканы и страны",
              options: [],
              answer: JSON.stringify([
                { left: "Везувий", right: "Италия" },
                { left: "Фьорды", right: "Норвегия" },
              ]),
              points: 100,
              time: 30,
            },
            {
              id: "q5",
              type: "ordering",
              q: "Порядок стран",
              options: [],
              answer: JSON.stringify(["Португалия", "Франция", "Австрия", "Венгрия"]),
              points: 100,
              time: 30,
            },
            {
              id: "q6",
              type: "close",
              q: "Кровь переносит кислород ___ и ___",
              options: [],
              answer: JSON.stringify(["эритроцитами", "гемоглобин"]),
              points: 100,
              time: 30,
            },
            {
              id: "q7",
              type: "ordering",
              q: "Повреждённый ответ",
              options: [],
              answer: "[malformed",
              points: 100,
              time: 30,
            },
          ],
        },
        visibility: "public",
        owner_id: "owner",
        tags: ["География"],
        show_answers: showAnswers,
        updated_at: "2026-08-20T00:00:00Z",
      },
      {
        id: "preview-jeopardy",
        kind: "jeopardy",
        data: {
          config: {
            title: "Preview Jeopardy",
            theme: "ocean",
            timeBase: 30,
            timeStep: 15,
            timeFinal: 90,
          },
          rounds: [
            [
              {
                category: "Столицы",
                questions: [{ points: 100, q: "Столица Франции?", a: "Париж" }],
              },
            ],
          ],
          final: { category: "Европа", q: "Финальный вопрос", a: "Ответ" },
        },
        visibility: "public",
        owner_id: "owner",
        tags: [],
        show_answers: true,
        updated_at: "2026-08-20T00:00:00Z",
      },
      {
        id: "preview-millionaire",
        kind: "millionaire",
        data: {
          config: {
            title: "Preview Millionaire",
            theme: "classic",
            timePerQuestion: 30,
            moneyScale: "normal",
            milestones: "three",
          },
          questions: [
            {
              q: "Столица Германии?",
              money: 500,
              options: [
                { text: "Берлин", correct: true },
                { text: "Вена", correct: false },
                { text: "Прага", correct: false },
                { text: "Рим", correct: false },
              ],
            },
          ],
        },
        visibility: "public",
        owner_id: "owner",
        tags: [],
        show_answers: true,
        updated_at: "2026-08-20T00:00:00Z",
      },
    ];
    games.push({
      ...games[0],
      id: "preview-locked",
      data: {
        ...games[0].data,
        config: { ...games[0].data.config, title: "Preview Locked", allowPreview: false },
      },
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ games, total: games.length, limit: 100, offset: 0 }),
    });
  });

  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Preview Quiz" })).toBeVisible();
  await page.getByRole("button", { name: "Просмотреть Preview Quiz" }).click();
  const dialog = page.getByRole("dialog", { name: "Предпросмотр Preview Quiz" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Описание quiz")).toBeVisible();
  await expect(dialog.getByText("Париж", { exact: true })).toBeVisible();
  await expect(dialog.locator('[data-quiz-question-content="bool"]')).toContainText("Да");
  await expect(dialog.locator('[data-quiz-question-content="bool"]')).toContainText("Нет");
  await expect(dialog.locator('[data-quiz-question-content="matching"]')).toContainText("Везувий");
  await expect(dialog.locator('[data-quiz-question-content="matching"]')).toContainText("Италия");
  await expect(dialog.locator('[data-quiz-question-content="matching"]')).not.toContainText("Везувий → Италия");
  const matchingContent = dialog.locator('[data-quiz-question-content="matching"]');
  await expect(matchingContent.locator("ul").first().locator("li").first()).toHaveText("Фьорды");
  await expect(matchingContent.locator("ul").last().locator("li").first()).toHaveText("Италия");
  await expect(dialog.locator('[data-quiz-question-content="ordering"]')).toContainText("Португалия");
  await expect(dialog.locator('[data-quiz-question-content="ordering"]')).toContainText("Венгрия");
  await expect(dialog.locator('[data-quiz-question-content="ordering"]')).not.toContainText("1. Португалия");
  await expect(dialog.locator('[data-quiz-question="close"]')).toContainText("Кровь переносит кислород ___ и ___");
  await expect(dialog).not.toContainText("Рейкьявик · Reykjavik");
  await expect(dialog).not.toContainText("эритроцитами");
  await expect(dialog.getByText("Ответы скрыты настройками игры.")).toBeVisible();
  await expect(dialog.locator("[data-quiz-answer]")).toHaveCount(0);
  await expect(dialog.locator('[data-quiz-correct="true"]')).toHaveCount(0);
  await expect(dialog).not.toContainText("Ответ:");
  await dialog.getByRole("button", { name: "Закрыть предпросмотр" }).click();
  await page.getByRole("button", { name: "Просмотреть Preview Locked" }).click();
  const lockedDialog = page.getByRole("dialog", { name: "Предпросмотр Preview Locked" });
  await expect(lockedDialog).toContainText("Автор не разрешил просмотр вопросов до игры");
  await expect(lockedDialog).not.toContainText("Столица Франции?");
  await lockedDialog.getByRole("button", { name: "Закрыть предпросмотр" }).click();

  showAnswers = true;
  await page.reload();
  await page.getByRole("button", { name: "Просмотреть Preview Quiz" }).click();
  const openDialog = page.getByRole("dialog", { name: "Предпросмотр Preview Quiz" });
  await expect(openDialog.getByText("Ответы доступны согласно настройкам игры.")).toBeVisible();
  await expect(openDialog.locator("[data-quiz-answer]")).toHaveCount(7);
  await expect(openDialog.locator('[data-quiz-answer="choice"]')).toContainText("Правильный ответ: Париж");
  await expect(openDialog.locator('[data-quiz-answer="bool"]')).toContainText("Правильный ответ: Да");
  await expect(openDialog.locator('[data-quiz-answer="text"]')).toContainText("Правильный ответ: Рейкьявик · Reykjavik");
  await expect(openDialog.locator('[data-quiz-answer="matching"]')).toContainText("Везувий → Италия");
  await expect(openDialog.locator('[data-quiz-answer="matching"]')).toContainText("Фьорды → Норвегия");
  await expect(openDialog.locator('[data-quiz-answer="ordering"]').first()).toContainText("1. Португалия");
  await expect(openDialog.locator('[data-quiz-answer="ordering"]').first()).toContainText("4. Венгрия");
  await expect(openDialog.locator('[data-quiz-answer="close"]')).toContainText("1. эритроцитами");
  await expect(openDialog.locator('[data-quiz-answer="close"]')).toContainText("2. гемоглобин");
  await expect(openDialog.locator('[data-quiz-answer="ordering"]').last()).toContainText("Ответ недоступен");
  await expect(openDialog.locator('[data-quiz-option="Париж"][data-quiz-correct="true"]')).toBeVisible();
  await expect(openDialog).toContainText("Выбор ответа");
  await expect(openDialog).toContainText("Да/Нет");
  await expect(openDialog).toContainText("Сопоставление");
  await expect(openDialog).toContainText("Порядок");
  await expect(openDialog).toContainText("Пропуски");
  await expect(openDialog).toContainText("Да");
  await expect(openDialog).toContainText("Рейкьявик · Reykjavik");
  await expect(openDialog).toContainText("Везувий → Италия");
  await expect(openDialog).toContainText("Фьорды → Норвегия");
  await expect(openDialog).not.toContainText('["Португалия"');
  const previewHeader = openDialog.locator("header");
  const previewScroll = openDialog.locator("div.overflow-y-auto");
  const headerBox = await previewHeader.boundingBox();
  const firstQuestionBox = await openDialog.locator("ol > li").first().boundingBox();
  expect(headerBox).not.toBeNull();
  expect(firstQuestionBox).not.toBeNull();
  expect(firstQuestionBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
  await previewScroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const lastQuestionBox = await openDialog.locator("ol > li").last().boundingBox();
  expect(lastQuestionBox).not.toBeNull();
  expect(lastQuestionBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
  await openDialog.getByRole("button", { name: "Закрыть предпросмотр" }).click();

  await page.getByRole("button", { name: "Просмотреть Preview Jeopardy" }).click();
  await expect(
    page.getByRole("dialog", { name: "Предпросмотр Preview Jeopardy" }).getByText("Столицы"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть предпросмотр" }).click();
  await page.getByRole("button", { name: "Просмотреть Preview Millionaire" }).click();
  const millionaire = page.getByRole("dialog", { name: "Предпросмотр Preview Millionaire" });
  await expect(millionaire.getByText("Берлин", { exact: true }).first()).toBeVisible();
  await expect(millionaire.getByText("Ответ:")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Закрыть предпросмотр" }).click();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await page.getByRole("button", { name: "Просмотреть Preview Quiz" }).click();
  const desktopDialog = page.getByRole("dialog", { name: "Предпросмотр Preview Quiz" });
  await expect(desktopDialog.locator('[data-quiz-answer="matching"]')).toContainText("Везувий → Италия");
  await expect(desktopDialog.locator('[data-quiz-answer="ordering"]').first()).toContainText("1. Португалия");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
});
