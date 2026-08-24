import { test, expect, type BrowserContext, type Page, type Route } from "@playwright/test";

const apiOrigin = "https://api.islandquiz.online";
const user = {
  id: "ai-count-user",
  email: "ai-count@example.test",
  name: "AI Count User",
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "http://127.0.0.1:4173",
      "access-control-allow-credentials": "true",
    },
    body: JSON.stringify(body),
  });
}

function generatedQuestions(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    type: "choice",
    difficulty: "medium",
    question: `Question ${index + 1}`,
    options: ["A", "B", "C", "D"],
    correct: 0,
  }));
}

async function installApi(
  context: BrowserContext,
  counts: number[],
  payloads: Record<string, unknown>[] = [],
  generatedResponse?: { title: string; questions: unknown[] },
) {
  await context.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "http://127.0.0.1:4173",
          "access-control-allow-credentials": "true",
          "access-control-allow-headers": "authorization, content-type",
          "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
        },
      });
    }

    if (request.method() === "GET" && url.pathname === "/api/users/me") {
      return json(route, user);
    }

    if (request.method() === "GET" && url.pathname.startsWith("/api/ai/quiz-type-distribution/")) {
      const count = Number(url.pathname.split("/").pop());
      const choice = Math.floor(count * 0.6);
      const text = Math.floor(count * 0.2);
      const bool = Math.floor(count * 0.1);
      const matching = count - choice - text - bool;
      return json(route, { distribution: { choice, bool, text, matching, close: 0, ordering: 0 } });
    }

    if (request.method() === "POST" && url.pathname === "/api/ai/generate-quiz") {
      const payload = request.postDataJSON() as { count?: number } & Record<string, unknown>;
      counts.push(payload.count ?? 0);
      payloads.push(payload);
      return json(route, {
        title: "Generated quiz",
        questions: generatedResponse?.questions ?? generatedQuestions(payload.count ?? 0),
      });
    }

    return json(
      route,
      { error: `Unhandled AI count request: ${request.method()} ${url.pathname}` },
      404,
    );
  });
}

async function openGenerator(page: Page) {
  const meResponse = page.waitForResponse(
    (response) =>
      response.url() === `${apiOrigin}/api/users/me` && response.request().method() === "GET",
  );
  await page.goto("/builder/quiz");
  await meResponse;
  await page.waitForLoadState("networkidle");
  const trigger = page.locator('button[aria-label="Сгенерировать квиз"]:visible');
  const modal = page.locator("div.fixed.inset-0").filter({
    hasText: "ИИ создаст вопросы по заданным параметрам.",
  });
  await expect(trigger).toBeVisible();
  for (let attempt = 0; attempt < 4 && !(await modal.isVisible()); attempt += 1) {
    await trigger.click();
    await page.waitForTimeout(750);
  }
  await expect(modal.getByRole("heading", { name: "Сгенерировать квиз" })).toBeVisible();
  return {
    modal,
    count: modal.locator('input[type="number"]'),
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("islandquiz.token", "ai-count-token"));
  page.on("dialog", (dialog) => dialog.accept());
});

test("AI count input can be cleared and accepts 6 afterwards", async ({ page }) => {
  await installApi(page.context(), []);
  const { count } = await openGenerator(page);

  await count.fill("");
  await expect(count).toHaveValue("");
  await count.fill("6");
  await expect(count).toHaveValue("6");
});

test("AI count input stays usable on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await installApi(page.context(), []);
  const { count } = await openGenerator(page);

  await count.fill("");
  await count.fill("6");
  const box = await count.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  expect(box!.width).toBeGreaterThan(0);
  await expect(count).toHaveValue("6");
});

test("4 blocks AI generation with the range error", async ({ page }) => {
  const counts: number[] = [];
  await installApi(page.context(), counts);
  const { modal, count } = await openGenerator(page);

  await count.fill("4");
  await count.blur();
  await expect(modal.getByText("Количество вопросов должно быть от 5 до 20.")).toBeVisible();
  await modal.getByRole("button", { name: "Сгенерировать", exact: true }).click();
  expect(counts).toEqual([]);
});

test("21 blocks AI generation with the range error", async ({ page }) => {
  const counts: number[] = [];
  await installApi(page.context(), counts);
  const { modal, count } = await openGenerator(page);

  await count.fill("21");
  await modal.getByRole("button", { name: "Сгенерировать", exact: true }).click();
  await expect(modal.getByText("Количество вопросов должно быть от 5 до 20.")).toBeVisible();
  expect(counts).toEqual([]);
});

test("empty count blocks AI generation with the range error", async ({ page }) => {
  const counts: number[] = [];
  await installApi(page.context(), counts);
  const { modal, count } = await openGenerator(page);

  await count.fill("");
  await modal.getByRole("button", { name: "Сгенерировать", exact: true }).click();
  await expect(modal.getByText("Количество вопросов должно быть от 5 до 20.")).toBeVisible();
  expect(counts).toEqual([]);
});

for (const acceptedCount of [5, 20]) {
  test(`${acceptedCount} is accepted by AI generation`, async ({ page }) => {
    const counts: number[] = [];
    await installApi(page.context(), counts);
    const { modal, count } = await openGenerator(page);

    await count.fill(String(acceptedCount));
    await modal.getByRole("button", { name: "Сгенерировать", exact: true }).click();
    await expect(modal).toBeHidden();
    expect(counts).toEqual([acceptedCount]);
  });
}

test("advanced mode starts from automatic distribution and sends manual counts", async ({ page }) => {
  const payloads: Record<string, unknown>[] = [];
  await installApi(page.context(), [], payloads);
  const { modal } = await openGenerator(page);

  await modal.getByRole("button", { name: "Настроить типы" }).click();
  await expect(modal.getByLabel("Выбор ответа: 6")).toBeVisible();
  await modal.getByRole("button", { name: "Увеличить количество: Правда / Ложь" }).click();
  await modal.getByRole("button", { name: "Уменьшить количество: Выбор ответа" }).click();
  await expect(modal.getByText("Всего: 10 из 20")).toBeVisible();
  await modal.getByRole("button", { name: "Быстро" }).click();
  await modal.getByRole("button", { name: "Настроить типы" }).click();
  await expect(modal.getByLabel("Выбор ответа: 5")).toBeVisible();
  await modal.getByRole("button", { name: "Сгенерировать", exact: true }).click();

  expect(payloads[0]).toMatchObject({
    count: 10,
    type_distribution: { choice: 5, bool: 2, text: 2, matching: 1, close: 0, ordering: 0 },
  });
});

test("full generation maps close answers and ordering options into Builder data", async ({ page }) => {
  const response = {
    title: "All types",
    questions: [
      { type: "choice", difficulty: "medium", question: "Choice?", options: ["A", "B", "C", "D"], correct: 0 },
      { type: "bool", difficulty: "medium", question: "True?", correct: true },
      { type: "text", difficulty: "medium", question: "Text?", correctAnswer: "Answer" },
      { type: "matching", difficulty: "medium", question: "Match", pairs: [{ left: "A", right: "1" }, { left: "B", right: "2" }, { left: "C", right: "3" }] },
      { type: "close", difficulty: "medium", question: "A ___ B ___", correctAnswer: "one|two" },
      { type: "ordering", difficulty: "medium", question: "Order", options: ["First", "Second", "Third"] },
    ],
  };
  await installApi(page.context(), [], [], response);
  const { modal, count } = await openGenerator(page);
  await count.fill("6");
  await modal.getByRole("button", { name: "Сгенерировать", exact: true }).click();

  await expect.poll(async () => page.locator("input").evaluateAll((inputs) => inputs.some((input) => (input as HTMLInputElement).value === "one"))).toBe(true);
  await expect.poll(async () => page.locator("input").evaluateAll((inputs) => inputs.some((input) => (input as HTMLInputElement).value === "two"))).toBe(true);
  await expect.poll(async () => page.locator("input").evaluateAll((inputs) => inputs.some((input) => (input as HTMLInputElement).value === "First"))).toBe(true);
  await expect.poll(async () => page.locator("input").evaluateAll((inputs) => inputs.some((input) => (input as HTMLInputElement).value === "Third"))).toBe(true);
});

test("generator closes with Escape and reopens in quick mode", async ({ page }) => {
  await installApi(page.context(), []);
  const { modal } = await openGenerator(page);
  await modal.getByRole("button", { name: "Настроить типы" }).click();
  await expect(modal.getByText("Типы вопросов")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();

  await page.locator('button[aria-label="Сгенерировать квиз"]:visible').click();
  await expect(modal.locator('input[type="number"]')).toBeVisible();
});

test("advanced controls enforce total limits and restore automatic distribution", async ({ page }) => {
  await installApi(page.context(), []);
  const { modal, count } = await openGenerator(page);

  await count.fill("5");
  await modal.getByRole("button", { name: "Настроить типы" }).click();
  await expect(modal.getByRole("button", { name: /Уменьшить количество/ }).first()).toBeDisabled();
  await modal.getByRole("button", { name: "Увеличить количество: Порядок" }).click();
  await expect(modal.getByLabel("Порядок: 1")).toBeVisible();
  await modal.getByRole("button", { name: "Вернуть авто-распределение" }).click();
  await expect(modal.getByLabel("Порядок: 0")).toBeVisible();
});

test("advanced desktop modal expands into a two-column composition", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await installApi(page.context(), []);
  const { modal } = await openGenerator(page);
  await modal.getByRole("button", { name: "Настроить типы" }).click();
  const dialog = modal.getByRole("dialog");
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(760);
  await expect(dialog.getByText("Добавить материал").first()).toBeVisible();
  await expect(dialog.getByText("Типы вопросов")).toBeVisible();
});

test("advanced mobile layout uses a compact picker without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await installApi(page.context(), []);
  const { modal } = await openGenerator(page);

  await expect(modal.getByText("Добавить материал")).toBeVisible();
  await expect(modal.getByText("Перетащите файл сюда")).toBeHidden();
  await modal.locator('input[type="file"]').last().setInputFiles({
    name: "material.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("facts"),
  });
  await expect(modal.getByText("material.txt").last()).toBeVisible();
  await modal.getByRole("button", { name: "Настроить типы" }).click();
  await expect(modal.getByRole("button", { name: "Увеличить количество: Порядок" })).toBeVisible();
  const overflow = await modal.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const width of [375, 390]) {
  test(`advanced mobile layout stays usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 760 });
    await installApi(page.context(), []);
    const { modal } = await openGenerator(page);
    await modal.getByRole("button", { name: "Настроить типы" }).click();
    const plus = modal.getByRole("button", { name: "Увеличить количество: Порядок" });
    await expect(plus).toBeVisible();
    const box = await plus.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(await modal.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  });
}
