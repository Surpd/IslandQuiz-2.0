import { expect, test, type Page } from "@playwright/test";

const apiOrigin = "https://api.islandquiz.online";

const question = (id: string, text: string) => ({
  id,
  type: "choice",
  q: text,
  options: ["A", "B"],
  answer: "A",
  points: 100,
  time: 30,
});

async function waitForBuilder(page: Page) {
  await page.goto("/builder/quiz", { waitUntil: "commit" });
  await expect(page.locator('html[data-app-hydrated="true"]')).toHaveAttribute("data-app-hydrated", "true", { timeout: 120_000 });
}

async function createSecondVariant(page: Page) {
  await page.getByRole("button", { name: "Настройки" }).first().click();
  await page.getByRole("button", { name: "Создать второй вариант" }).click();
  await page.getByRole("button", { name: /Пустой вариант/ }).click();
  await page.getByRole("button", { name: "Закрыть настройки" }).click();
}

async function openCompare(page: Page) {
  await page.getByRole("button", { name: /Вариант 2 из 2/ }).click();
  await page.getByRole("button", { name: "Управление вариантами" }).click();
  await page.getByRole("button", { name: "Сравнить варианты" }).click();
}

test.describe("Quiz Variants follow-up polish", () => {
  test("compare mode keeps equal question indexes paired", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript(() => localStorage.clear());
    await waitForBuilder(page);
    await createSecondVariant(page);
    await page.getByRole("button", { name: "+ ABCD", exact: true }).last().click();
    await openCompare(page);
    const compare = page.locator("section").filter({ hasText: "Только просмотр" }).last();
    await expect(compare.getByText("Вопрос 1", { exact: false })).toHaveCount(2);
    await expect(compare.getByText("Нет вопроса", { exact: false })).toHaveCount(0);
  });

  test("compare mode reserves a placeholder when one side has fewer questions", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript(() => localStorage.clear());
    await waitForBuilder(page);
    await createSecondVariant(page);
    await openCompare(page);
    const compare = page.locator("section").filter({ hasText: "Только просмотр" }).last();
    await expect(compare.getByLabel("Нет вопроса 1")).toBeVisible();
    await expect(compare.getByText("Вопрос 1", { exact: false })).toHaveCount(1);
  });

  test("save success feedback is shown only after the save request completes", async ({ page }) => {
    await page.route(`${apiOrigin}/**`, async (route) => {
      const request = route.request();
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/games/") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "polish-save", play_url: "/play/quiz/polish-save" }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript(() => localStorage.clear());
    await waitForBuilder(page);
    await page.getByPlaceholder("Название квиза").fill("Сохранение работает");
    await page.locator('textarea[placeholder^="Текст вопроса"]').first().fill("Проверка сохранения");
    const saveButton = page.locator('button[title="Не сохранено"]:visible').last();
    await saveButton.click();
    await expect(page.locator('button[title="Сохранено"]').last()).toContainText("Сохранено");
  });

  test("results show and filter multiple variants", async ({ page }) => {
    await page.route(`${apiOrigin}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/games/results-polish/play") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "results-polish", kind: "quiz", data: { config: { title: "Variants Results" }, questions: [question("q1", "Q1")], variants: [{ id: "variant-2", name: "Вариант 2", questions: [question("q2", "Q2")] }] } }) });
        return;
      }
      if (path.endsWith("/results")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
          { id: "r1", game_id: "results-polish", player_name: "Аня", score: 100, max_score: 100, correct_count: 1, total_questions: 1, time_sec: 20, finished_at: "2026-08-24T10:00:00Z", variantId: "variant-1", variantName: "Вариант 1" },
          { id: "r2", game_id: "results-polish", player_name: "Борис", score: 80, max_score: 100, correct_count: 1, total_questions: 1, time_sec: 22, finished_at: "2026-08-24T09:00:00Z", variantId: "variant-2", variantName: "Вариант 2" },
        ]) });
        return;
      }
      if (path.endsWith("/online-results")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    await page.goto("/quiz/results-polish/results");
    await expect(page.getByRole("columnheader", { name: "Вариант" })).toBeVisible();
    await expect(page.getByLabel("Вариант")).toBeVisible();
    await page.getByLabel("Вариант").selectOption("variant-2");
    await expect(page.getByText("Борис", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Аня", { exact: true })).toHaveCount(0);
  });

  test("legacy results keep the single-variant layout", async ({ page }) => {
    await page.route(`${apiOrigin}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/games/results-legacy/play") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "results-legacy", kind: "quiz", data: { config: { title: "Legacy Results" }, questions: [question("q1", "Q1")] } }) });
        return;
      }
      if (path.endsWith("/results")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "legacy", game_id: "results-legacy", player_name: "Старый результат", score: 50, max_score: 100, correct_count: 1, total_questions: 1, time_sec: 20, finished_at: "2026-08-24T10:00:00Z" }]) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.goto("/quiz/results-legacy/results");
    await expect(page.getByText("Старый результат", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("Вариант")).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Вариант" })).toHaveCount(0);
  });
});
