import { expect, test } from "@playwright/test";

const apiOrigin = "https://api.islandquiz.online";

test.use({ viewport: { width: 390, height: 844 } });

test("Quiz results format correct and user answers without mobile overflow", async ({ page }) => {
  const questions = [
    { id: "choice", type: "choice", q: "Страна", options: ["Италия", "Швейцария"], answer: "Швейцария", points: 100, time: 30 },
    { id: "bool", type: "bool", q: "Земля круглая?", options: [], answer: "true", points: 100, time: 30 },
    { id: "text", type: "text", q: "Столица Исландии?", options: [], answer: "Рейкьявик, Reykjavik", points: 100, time: 30 },
    { id: "matching", type: "matching", q: "Вулканы и страны", options: [], answer: JSON.stringify([{ left: "Везувий", right: "Италия" }, { left: "Фьорды", right: "Норвегия" }]), points: 100, time: 30 },
    { id: "ordering", type: "ordering", q: "Порядок стран", options: [], answer: JSON.stringify(["Португалия", "Франция", "Австрия"]), points: 100, time: 30 },
    { id: "close", type: "close", q: "Кровь переносит кислород ___ и ___", options: [], answer: JSON.stringify(["эритроцитами", "гемоглобин"]), points: 100, time: 30 },
    { id: "long", type: "text", q: "Длинный ответ", options: [], answer: "Очень длинный допустимый ответ, который должен переноситься на несколько строк на узком экране", points: 100, time: 30 },
  ];

  await page.route(`${apiOrigin}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/games/results-display/play") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "results-display",
          kind: "quiz",
          data: {
            config: { title: "Results Display", description: "", orderMode: "sequential", showResult: "end", defaultTime: 30, totalTime: 10 },
            questions,
          },
        }),
      });
    }
    if (path === "/api/games/results-display") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "results-display",
          kind: "quiz",
          data: {
            config: { title: "Results Display", description: "", orderMode: "sequential", showResult: "end", defaultTime: 30, totalTime: 10 },
            questions,
          },
          visibility: "private",
          owner_id: "owner",
          show_answers: true,
          updated_at: "2026-08-20T00:00:00Z",
        }),
      });
    }
    if (path === "/api/quiz/results-display/results") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          id: "result-1",
          game_id: "results-display",
          player_name: "Аня",
          score: 200,
          max_score: 700,
          correct_count: 2,
          total_questions: 7,
          time_sec: 120,
          finished_at: "2026-08-20T00:00:00Z",
          answers: [
            { qId: "choice", question: "Страна", given: "Италия", correctAnswer: "Швейцария", isCorrect: false, earned: 0, points: 100 },
            { qId: "bool", question: "Земля круглая?", given: "false", correctAnswer: "true", isCorrect: false, earned: 0, points: 100 },
            { qId: "text", question: "Столица Исландии?", given: "Reykjavik", correctAnswer: "Рейкьявик, Reykjavik", isCorrect: true, earned: 100, points: 100 },
            { qId: "matching", question: "Вулканы и страны", given: JSON.stringify({ Везувий: "Италия", Фьорды: "Норвегия" }), correctAnswer: "legacy raw value", isCorrect: true, earned: 100, points: 100 },
            { qId: "ordering", question: "Порядок стран", given: JSON.stringify(["Франция", "Португалия", "Австрия"]), correctAnswer: "legacy raw value", isCorrect: false, earned: 0, points: 100 },
            { qId: "close", question: "Кровь переносит кислород ___ и ___", given: JSON.stringify(["эритроцитами", "гемоглобин"]), correctAnswer: "legacy raw value", isCorrect: true, earned: 100, points: 100 },
            { qId: "long", question: "Длинный ответ", given: "Очень длинный ответ пользователя, который тоже должен переноситься на несколько строк", correctAnswer: "legacy raw value", isCorrect: false, earned: 0, points: 100 },
          ],
        }]),
      });
    }
    if (path === "/api/quiz/results-display/online-results") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/quiz/results-display/results");
  await expect(page.getByRole("heading", { name: "Результаты" })).toBeVisible();
  await page.getByRole("button").filter({ hasText: "Аня" }).click();
  const detail = page.locator("article").filter({ hasText: "Аня" });
  await expect(detail.getByTestId("result-question-card")).toHaveCount(7);
  await expect(detail.locator("thead:visible")).toHaveCount(0);
  await expect(detail).toContainText("Да");
  await expect(detail).toContainText("Нет");
  await expect(detail).toContainText("Рейкьявик · Reykjavik");
  await expect(detail).toContainText("Везувий → Италия");
  await expect(detail).toContainText("1. Франция");
  await expect(detail).toContainText("2. Португалия");
  await expect(detail).toContainText("1. эритроцитами");
  await expect(detail).not.toContainText("true");
  await expect(detail).not.toContainText("false");
  await expect(detail).not.toContainText('[{"left"');
  await expect(detail).not.toContainText('["Франция"');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const longAnswer = detail.locator("span:visible").filter({ hasText: /Очень длинный ответ пользователя/ }).first();
  await expect(longAnswer).toBeVisible();
  const longBox = await longAnswer.boundingBox();
  expect(longBox).not.toBeNull();
  expect(longBox!.width).toBeLessThanOrEqual(390);
});
