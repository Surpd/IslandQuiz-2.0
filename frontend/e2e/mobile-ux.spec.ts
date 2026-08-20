import { test, expect, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("mobile builders hide promo hero and keep quiz formula palette in viewport", async ({ page }) => {
  for (const route of ["/builder/quiz", "/builder/jeopardy", "/builder/millionaire"]) {
    await page.goto(route);
    await expect(page.locator("[data-builder-promo]")).toBeHidden();
    await expect(page.locator("[data-builder-toolbar]")).toBeHidden();
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
  expect(box!.height).toBeLessThanOrEqual(380);
  const questionField = page.getByPlaceholder(/Текст вопроса/).first();
  const questionBox = await questionField.boundingBox();
  expect(questionBox).not.toBeNull();
  expect(questionBox!.y + questionBox!.height).toBeLessThanOrEqual(box!.y + 2);
  expect(await page.evaluate(() => document.documentElement.classList.contains("formula-keyboard-open"))).toBe(true);
  const scrollWhileOpen = await page.evaluate(() => window.scrollY);
  await palette.getByRole("button", { name: "Готово" }).click();
  const answer = page.getByPlaceholder("Вариант A").first();
  const answerButton = page.getByRole("button", { name: "Вставить формулу" }).nth(1);
  await answerButton.click();
  await expect(palette).toBeVisible();
  const answerBox = await palette.boundingBox();
  expect(answerBox).not.toBeNull();
  expect(answerBox!.x).toBe(0);
  expect(answerBox!.width).toBeGreaterThanOrEqual(380);
  await palette.getByRole("button", { name: "x²" }).click();
  await expect(answer).toHaveValue(/x/);
  await palette.getByRole("button", { name: "Готово" }).click();
  await expect(answer).toBeFocused();
  const answerB = page.getByPlaceholder("Вариант B").first();
  await page.getByRole("button", { name: "Вставить формулу" }).nth(2).click();
  await expect(palette).toBeVisible();
  const answerBBox = await answerB.boundingBox();
  const answerPaletteBox = await palette.boundingBox();
  expect(answerBBox).not.toBeNull();
  expect(answerPaletteBox).not.toBeNull();
  expect(answerBBox!.y + answerBBox!.height).toBeLessThanOrEqual(answerPaletteBox!.y + 2);
  await palette.getByRole("button", { name: "√" }).click();
  await expect(answerB).toHaveValue(/sqrt/);
  await palette.getByRole("button", { name: "Готово" }).click();
  await expect(answerB).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.classList.contains("formula-keyboard-open"))).toBe(false);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(0);
  expect(scrollWhileOpen).toBeGreaterThanOrEqual(0);
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

async function assertQuizSettingsSheet(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/builder/quiz");
  await page.waitForTimeout(5000);
  const settingsButton = page.locator('.builder-mobile-header button[aria-label="Настройки"]');
  await expect(settingsButton).toHaveAttribute("aria-expanded", "false");
  await settingsButton.click();
  const dialog = page.getByRole("dialog", { name: "Настройки игры" });
  await expect(dialog).toBeVisible();
  await expect(settingsButton).toHaveAttribute("aria-expanded", "true");
  const sheet = dialog.locator(":scope > div");
  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844 - 64);
  await expect(sheet.getByRole("button", { name: "Сохранить настройки" })).toBeVisible();
  const scroller = sheet.locator(".overflow-y-auto").first();
  await expect(scroller).toBeVisible();
  expect(await scroller.evaluate((element) => element.scrollHeight >= element.clientHeight)).toBe(
    true,
  );
  await sheet.getByRole("button", { name: "Сохранить настройки" }).click();
  await expect(dialog).toBeHidden();
}

for (const width of [375, 390, 430]) {
  test(`quiz settings sheet works at ${width}px`, async ({ page }) => {
    await assertQuizSettingsSheet(page, width);
  });
}

test("formula keyboard stays compact at 360px and 430px", async ({ page }) => {
  for (const width of [360, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/builder/quiz");
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Вставить формулу" }).first().click();
    const keyboard = page.getByTestId("formula-palette");
    await expect(keyboard).toBeVisible();
    const box = await keyboard.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(width);
    expect(box!.height).toBeLessThanOrEqual(380);
    await keyboard.getByRole("button", { name: "Готово" }).click();
  }
});

test("ordinary mobile pages keep nav while immersive runtime hides it", async ({ page }) => {
  await page.goto("/faq");
  await expect(page.getByRole("navigation", { name: "Основная навигация" })).toBeVisible();
  await page.goto("/feedback");
  await expect(page.getByRole("navigation", { name: "Основная навигация" })).toBeVisible();
  await page.goto("/play/quiz/mobile-nav-check");
  await expect(page.getByRole("navigation", { name: "Основная навигация" })).toBeHidden();
});

test("unauthenticated quiz AI offers sign in without sending an AI request", async ({ page }) => {
  let aiRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/ai")) aiRequests += 1;
  });
  await page.goto("/builder/quiz");
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Сгенерировать квиз" }).click();
  await expect(page.getByRole("dialog", { name: "Вход для AI" })).toBeVisible();
  expect(aiRequests).toBe(0);
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
