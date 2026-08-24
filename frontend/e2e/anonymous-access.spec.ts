import { expect, test } from "@playwright/test";

test.setTimeout(180_000);

test.describe("Anonymous Builder access", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test("edits a local draft and completes Offline play without server game requests", async ({ page }) => {
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/")) apiRequests.push(new URL(request.url()).pathname);
    });

    await page.goto("/builder/quiz", { waitUntil: "commit" });
    await expect(page.locator('html[data-app-hydrated="true"]')).toHaveAttribute("data-app-hydrated", "true", { timeout: 120_000 });
    await page.getByPlaceholder("Название квиза").fill("Anonymous local quiz");
    await page.getByPlaceholder(/Текст вопроса/).fill("2 + 2?");
    await page.getByPlaceholder("Вариант A").fill("4");
    await page.getByPlaceholder("Вариант B").fill("5");
    await page.getByPlaceholder("Вариант C").fill("6");
    await page.getByPlaceholder("Вариант D").fill("7");
    await page.getByRole("button", { name: "Отметить верным" }).first().click();

    await page.getByRole("button", { name: "Играть" }).click();
    await expect(page.getByRole("heading", { name: "Мир" })).toBeVisible();
    await page.getByRole("button", { name: "Офлайн" }).click();
    const popup = page.waitForEvent("popup");
    await page.getByRole("button", { name: /Открыть плеер/ }).click();
    const player = await popup;
    player.on("request", (request) => {
      if (request.url().includes("/api/")) apiRequests.push(new URL(request.url()).pathname);
    });

    await expect(player).toHaveURL(/\/play\/quiz\/local-quiz-draft\?theme=classic$/);
    await expect(player.getByRole("heading", { name: "Anonymous local quiz" })).toBeVisible();
    await player.getByRole("button", { name: /Начать/ }).click();
    await player.getByRole("button", { name: "4" }).click();
    await player.getByRole("button", { name: "Ответить" }).click();
    await expect(player.getByRole("heading", { name: "Готово!" })).toBeVisible();
    expect(apiRequests.filter((path) => path.startsWith("/api/games/")).length).toBe(0);
  });

  test("keeps AI visible, hides owner controls and gates Anonymous actions", async ({ page }) => {
    await page.goto("/builder/quiz", { waitUntil: "commit" });
    await expect(page.locator('html[data-app-hydrated="true"]')).toHaveAttribute("data-app-hydrated", "true", { timeout: 120_000 });

    await expect(page.getByRole("button", { name: "Сгенерировать квиз" })).toBeVisible();
    await page.getByRole("button", { name: "Сгенерировать квиз" }).click();
    await expect(page.getByRole("dialog", { name: "Вход для AI-генерации" })).toBeVisible();
    await page.getByRole("dialog", { name: "Вход для AI-генерации" }).getByRole("button", { name: "Закрыть" }).click();

    await page.getByRole("button", { name: "Спросить AI" }).first().click();
    await expect(page.getByRole("dialog", { name: "Вход для AI-генерации" })).toBeVisible();
    await page.getByRole("dialog", { name: "Вход для AI-генерации" }).getByRole("button", { name: "Закрыть" }).click();

    await page.getByRole("button", { name: "Настройки" }).click();
    await expect(page.getByText("Варианты квиза", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Разрешить копирование игры", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Разрешить просмотр вопросов до игры", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Видимость игры" })).toHaveCount(0);
    await expect(page.getByText("Сохранить как копию", { exact: true })).toHaveCount(0);
  });

  test("shows Online hosting but gates Anonymous before room creation", async ({ page }) => {
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/")) apiRequests.push(new URL(request.url()).pathname);
    });

    await page.goto("/builder/quiz", { waitUntil: "commit" });
    await expect(page.locator('html[data-app-hydrated="true"]')).toHaveAttribute("data-app-hydrated", "true", { timeout: 120_000 });
    await page.getByRole("button", { name: "Играть" }).click();
    await page.getByRole("button", { name: "Онлайн-комната" }).click();
    await expect(page.getByRole("dialog", { name: "Вход для проведения онлайн-игры" })).toBeVisible();
    expect(apiRequests.filter((path) => path.startsWith("/api/games/")).length).toBe(0);
  });
});
