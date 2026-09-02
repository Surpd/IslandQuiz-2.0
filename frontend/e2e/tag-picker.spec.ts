import { expect, test, type Route } from "@playwright/test";

const apiOrigin = "https://api.islandquiz.online";
const user = { id: "tag-user", name: "Tag User", email: "tags@example.test" };
const tagNames = ["История", "История России", "Математика", "География", "Биология", "Физика"];

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

test.use({ viewport: { width: 390, height: 844 } });

test("mobile builder offers canonical tag suggestions and enforces five tags", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("islandquiz.token", "tag-token"));
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "http://127.0.0.1:4173",
          "access-control-allow-credentials": "true",
          "access-control-allow-headers": "authorization, content-type",
          "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
        },
      });
    if (url.pathname === "/api/users/me") return json(route, user);
    if (url.pathname === "/api/tags") {
      const query = (url.searchParams.get("query") ?? "").trim().toLocaleLowerCase();
      const tags = tagNames
        .filter((name) => !query || name.toLocaleLowerCase().includes(query))
        .map((name, index) => ({
          id: `tag-${index}`,
          name,
          canonical_name: name.toLocaleLowerCase(),
          is_system: index < 3,
          usage_count: 10 - index,
        }));
      return json(route, { tags, max_per_game: 5, max_length: 20 });
    }
    return json(route, {});
  });

  await page.goto("/builder/quiz");
  await page.waitForLoadState("networkidle");
  const title = page.getByPlaceholder("Название квиза");
  await title.fill("Tag picker test");
  await expect(title).toHaveValue("Tag picker test");
  const input = page.getByRole("textbox", { name: "Добавить тег" });
  await input.click();
  await input.pressSequentially("ист");
  await expect(page.getByRole("button", { name: "История ·", exact: true })).toBeVisible();
  await title.click();
  await expect(page.getByRole("button", { name: "История ·", exact: true })).toBeHidden();
  await input.click();
  await input.fill("ист");
  await expect(page.getByRole("button", { name: "История ·", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "История ·", exact: true }).click();
  await expect(page.getByRole("button", { name: "Убрать тег История" })).toBeVisible();
  await page.getByRole("button", { name: "Убрать тег История" }).click();

  for (const name of ["История", "Математика", "География", "Биология", "Физика"]) {
    await input.fill(name);
    await page.getByRole("button").filter({ hasText: name }).first().click();
  }
  await expect(page.getByText("Достигнут максимум: 5 тегов.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("export menu keeps PDF as the primary action on desktop and mobile", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("islandquiz.token", "tag-token"));
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return json(route, {}, 204);
    if (new URL(request.url()).pathname === "/api/users/me") return json(route, user);
    return json(route, {});
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/builder/quiz");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Экспорт", exact: true }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Скачать PDF" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Печать", exact: false })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: "Скачать PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Дополнительные действия" }).click();
  await expect(page.getByRole("button", { name: "Скачать PDF" })).toBeVisible();
});
