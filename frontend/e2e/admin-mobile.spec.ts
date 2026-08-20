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

test("mobile admin selector changes sections and keeps contextual game actions usable", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("islandquiz.token", "admin-token"));
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204 });
    if (url.pathname === "/api/users/me") return json(route, admin);
    if (url.pathname === "/api/admin/dashboard")
      return json(route, {
        kpis: {},
        activity: [],
        distribution: { types: {}, visibility: {} },
        top_games: [],
      });
    if (url.pathname === "/api/admin/workspace/games")
      return json(route, {
        total: 1,
        limit: 50,
        offset: 0,
        games: [
          {
            id: "game-1",
            title: "Mobile game",
            kind: "quiz",
            visibility: "private",
            owner_name: "Author",
            created_at: "2026-08-20T00:00:00Z",
            rating: null,
          },
        ],
      });
    if (url.pathname === "/api/admin/errors")
      return json(route, [
        {
          id: 1,
          created_at: "2026-08-20T00:00:00Z",
          source: "backend",
          message: "Safe failure",
          path: "/api/games",
          details: "sanitized",
        },
      ]);
    if (url.pathname === "/api/admin/tags")
      return json(route, {
        tags: [
          {
            id: "tag-history",
            name: "История",
            canonical_name: "история",
            is_system: true,
            usage_count: 2,
          },
        ],
        possible_duplicates: [],
      });
    if (url.pathname === "/api/admin/tags/bulk-preview")
      return json(route, {
        create: ["География"],
        existing: ["История"],
        invalid: [],
        create_count: 1,
      });
    return json(route, {});
  });

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Админ-панель" })).toBeVisible();
  await page.getByRole("button", { name: "Обзор" }).click();
  const selector = page.getByRole("dialog", { name: "Разделы админ-панели" });
  await selector.getByRole("button", { name: "Игры" }).click();
  await expect(page.getByRole("heading", { name: "Игры" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Выбрать Mobile game" }).check();
  await expect(page.getByText("Выбрано: 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Сделать публичными" })).toBeVisible();
  await page.getByRole("button", { name: "Игры" }).click();
  await selector.getByRole("button", { name: "Ошибки" }).click();
  await expect(page.getByRole("heading", { name: "Ошибки" })).toBeVisible();
  await page.getByText("Safe failure").click();
  await expect(page.getByRole("dialog", { name: "Детали ошибки" })).toContainText("sanitized");
  await page.getByRole("button", { name: "Закрыть детали ошибки" }).click();
  await page.getByRole("button", { name: "Ошибки", exact: true }).click();
  await selector.getByRole("button", { name: "Теги" }).click();
  await expect(page.getByRole("heading", { name: "Теги" })).toBeVisible();
  await page.getByRole("button", { name: "Добавить теги" }).click();
  await page.getByRole("textbox", { name: "Список тегов" }).fill("История\nГеография");
  await page.getByRole("button", { name: "Проверить список" }).click();
  await expect(page.getByText("Будет создано: 1")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
