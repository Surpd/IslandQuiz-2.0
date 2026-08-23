import { expect, test, type Page, type Route } from "@playwright/test";

const apiOrigin = "https://api.islandquiz.online";
const owner = { id: "library-owner", name: "Library Owner", email: "owner@example.test" };

function game(
  id: string,
  title: string,
  ownerId: string,
  visibility: string,
  ratings: Record<string, number>,
) {
  return {
    id,
    kind: "quiz",
    data: {
      config: {
        title,
        description: "Library card action test",
        orderMode: "sequential",
        showResult: "end",
        defaultTime: 30,
        totalTime: 10,
      },
      questions: [],
    },
    visibility,
    owner_id: ownerId,
    owner_name: ownerId === owner.id ? owner.name : "Public Author",
    tags: ["test"],
    ratings,
    play_count: 8,
    updated_at: "2026-08-20T00:00:00Z",
  };
}

async function installLibraryApi(page: Page, games: unknown[], authenticated = false) {
  if (authenticated) {
    await page.addInitScript(
      (token) => localStorage.setItem("islandquiz.token", token),
      "library-e2e-token",
    );
  }
  await page.route(`${apiOrigin}/**`, async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(owner),
      });
    }
    if (path === "/api/games/") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ games, total: games.length, limit: 100, offset: 0 }),
      });
    }
    if (path === "/api/played-games/me") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
}

test("Library card actions preserve ownership and stop card navigation", async ({ page }) => {
  await installLibraryApi(
    page,
    [game("mine-card", "My Library Game", owner.id, "private", { first: 5, second: 4 })],
    true,
  );

  await page.goto("/library?tab=my");
  const mineCard = page.getByRole("heading", { name: "My Library Game" }).locator("..");

  await expect(mineCard).toContainText("4.5");
  await expect(mineCard).toContainText("(2)");
  await expect(mineCard.getByRole("button", { name: "Просмотреть My Library Game" })).toBeVisible();
  await expect(
    mineCard.getByRole("button", { name: "Редактировать My Library Game" }),
  ).toBeVisible();
  const eyeBox = await mineCard
    .getByRole("button", { name: "Просмотреть My Library Game" })
    .boundingBox();
  const editBox = await mineCard
    .getByRole("button", { name: "Редактировать My Library Game" })
    .boundingBox();
  expect(eyeBox).not.toBeNull();
  expect(editBox).not.toBeNull();
  expect(editBox!.width).toBe(eyeBox!.width);
  expect(editBox!.height).toBe(eyeBox!.height);
  await expect(page.getByRole("button", { name: "Дополнительные действия" })).toHaveCount(0);
  await expect(page.getByText("Открыть страницу игры", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Добавить", { exact: true })).toHaveCount(0);

  await mineCard.getByRole("button", { name: "Просмотреть My Library Game" }).click();
  await expect(page).toHaveURL(/\/library(?:\?tab=my)?$/);
  await expect(page.getByRole("dialog", { name: "Предпросмотр My Library Game" })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть предпросмотр" }).click();

  await mineCard.getByRole("button", { name: "Играть" }).click();
  await expect(page).toHaveURL(/\/library(?:\?tab=my)?$/);
  await expect(page.getByText("Как играем?", { exact: true })).toBeVisible();
  await page
    .getByText("Как играем?", { exact: true })
    .locator("../..")
    .getByRole("button")
    .first()
    .click();

  await mineCard.getByRole("button", { name: "Редактировать My Library Game" }).click();
  await expect(page).toHaveURL(/\/builder\/quiz\?id=mine-card$/);
});

test("Public Library cards keep touch-sized actions without owner controls", async ({ page }) => {
  await installLibraryApi(page, [
    game("public-mobile", "Public Mobile Game", "other-owner", "public", {}),
  ]);
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto("/library");

  const card = page.getByRole("heading", { name: "Public Mobile Game" }).locator("..");
  await expect(card.getByRole("button", { name: "Играть" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Просмотреть Public Mobile Game" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Редактировать Public Mobile Game" })).toHaveCount(
    0,
  );
  await expect(card.getByText("Нет оценок", { exact: true })).toHaveCount(0);

  const eyeBox = await card
    .getByRole("button", { name: "Просмотреть Public Mobile Game" })
    .boundingBox();
  expect(eyeBox).not.toBeNull();
  expect(eyeBox!.width).toBeGreaterThanOrEqual(36);
  expect(eyeBox!.height).toBeGreaterThanOrEqual(36);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
