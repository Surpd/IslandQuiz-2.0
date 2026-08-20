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

async function installApi(context: BrowserContext, counts: number[]) {
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

    if (request.method() === "POST" && url.pathname === "/api/ai/generate-quiz") {
      const payload = request.postDataJSON() as { count?: number };
      counts.push(payload.count ?? 0);
      return json(route, {
        title: "Generated quiz",
        questions: generatedQuestions(payload.count ?? 0),
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
