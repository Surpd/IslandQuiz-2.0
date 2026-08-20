import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("mobile builders hide promo hero and keep quiz formula palette in viewport", async ({ page }) => {
  for (const route of ["/builder/quiz", "/builder/jeopardy", "/builder/millionaire"]) {
    await page.goto(route);
    await expect(page.locator("[data-builder-promo]")).toBeHidden();
  }

  await page.goto("/builder/quiz");
  await page.waitForTimeout(2000);
  await expect(page.getByRole("button", { name: "Сгенерировать" })).toBeVisible();

  const formulaButton = page.getByRole("button", { name: "Вставить формулу" }).first();
  await formulaButton.click();
  const palette = page.getByTestId("formula-palette");
  await expect(palette).toBeVisible();

  const box = await palette.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("quiz question navigator stays below the mobile builder header", async ({ page }) => {
  await page.goto("/builder/quiz");
  const header = page.locator(".builder-mobile-header");
  const navigator = page.locator(".builder-mobile-question-nav");
  await expect(header).toBeVisible();
  await expect(navigator).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 600));
  const headerBox = await header.boundingBox();
  const navigatorBox = await navigator.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(navigatorBox).not.toBeNull();
  expect(navigatorBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 1);
});

test("results back links target the source game", async ({ page }) => {
  await page.route("https://api.islandquiz.online/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === "/api/games/results-e2e" ? {
      id: "results-e2e",
      kind: "quiz",
      data: {
        config: { title: "Results E2E", description: "", theme: "amber", orderMode: "sequential", showResult: "end", defaultTime: 30, totalTime: 10 },
        questions: [],
      },
      visibility: "private",
      tags: [],
      ratings: [],
      play_count: 0,
      owner_id: "owner",
      owner_name: "Owner",
      updated_at: "2026-08-20T00:00:00Z",
    } : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  for (const route of [
    "/quiz/results-e2e/results",
    "/jeopardy/results-e2e/results",
    "/millionaire/results-e2e/results",
  ]) {
    await page.goto(route);
    await expect(page.getByRole("link", { name: /К игре/ })).toHaveAttribute("href", "/game/results-e2e");
  }
});
