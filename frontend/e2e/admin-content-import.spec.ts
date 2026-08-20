import { expect, test, type Route } from "@playwright/test";

const apiOrigin = "https://api.islandquiz.online";
const admin = { id: "admin-e2e", name: "Admin", email: "admin@example.test", role: "admin" };

async function json(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "http://127.0.0.1:4173",
      "access-control-allow-credentials": "true",
    },
    body: JSON.stringify(body),
  });
}

test.use({ viewport: { width: 390, height: 844 } });

test("mobile official content import validates preview and reports the apply result", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("islandquiz.token", "admin-token"));
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204 });
    if (url.pathname === "/api/users/me") return json(route, admin);
    if (url.pathname === "/api/admin/workspace/users")
      return json(route, {
        users: [{ id: "author-1", name: "Official author", role: "user" }],
        total: 1,
      });
    if (url.pathname === "/api/admin/workspace/games")
      return json(route, { games: [], total: 0, limit: 50, offset: 0 });
    if (url.pathname === "/api/admin/content/import/validate")
      return json(route, {
        valid: true,
        owner: { id: "author-1", name: "Official author" },
        counts: { quiz: 1, jeopardy: 1, millionaire: 1 },
        errors: [],
        warnings: [
          { path: "$.games[2].content_id", message: "Игра уже импортирована и будет пропущена." },
        ],
        games: [
          {
            content_id: "quiz-v1",
            kind: "quiz",
            title: "Quiz preview",
            tags: ["География"],
            status: "new",
          },
          {
            content_id: "jeopardy-v1",
            kind: "jeopardy",
            title: "Jeopardy preview",
            tags: ["История"],
            status: "new",
          },
          {
            content_id: "millionaire-v1",
            kind: "millionaire",
            title: "Millionaire preview",
            tags: [],
            status: "already_imported",
          },
        ],
      });
    if (url.pathname === "/api/admin/content/import/apply")
      return json(route, { created: 2, skipped: 1, games: [] });
    return json(route, {});
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: "Обзор" }).click();
  const selector = page.getByRole("dialog", { name: "Разделы админ-панели" });
  await selector.getByRole("button", { name: "Игры" }).click();
  await page.getByRole("button", { name: "Импорт контента" }).click();
  await page.getByRole("combobox", { name: "Автор игр" }).selectOption("author-1");
  await page.getByRole("tab", { name: "Вставить JSON" }).click();
  await page
    .getByRole("textbox", { name: "Вставить JSON" })
    .fill('{"schema_version":1,"games":[]}');
  await page.getByRole("button", { name: "Проверить и показать preview" }).click();
  await expect(page.getByText("Проверка пройдена. Импорт доступен.")).toBeVisible();
  await expect(page.getByText("Quiz preview")).toBeVisible();
  await expect(page.getByText("Создать новые игры")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Создать новые игры" }).click();
  await expect(page.getByText("Импорт завершён")).toBeVisible();
  await expect(page.getByText("Создано: 2")).toBeVisible();
  await page.getByRole("button", { name: "Перейти к играм" }).click();
  await expect(page.getByRole("heading", { name: "Игры" })).toBeVisible();
});
