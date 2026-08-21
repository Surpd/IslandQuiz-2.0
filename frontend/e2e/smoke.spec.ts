import { test, expect, type BrowserContext, type Route } from "@playwright/test";

const apiOrigin = "https://api.islandquiz.online";
const title = "E2E Smoke Quiz";
const user = {
  id: "e2e-user",
  email: "e2e@example.test",
  name: "E2E User",
};

function gameRecord(id: string, data?: unknown) {
  return {
    id,
    kind: "quiz",
    data: data ?? {
      config: {
        title,
        description: "Deterministic browser smoke test",
        theme: "amber",
        orderMode: "sequential",
        showResult: "end",
        defaultTime: 30,
        totalTime: 10,
      },
      questions: [
        {
          id: "e2e-question",
          type: "choice",
          q: "What is the capital of France?",
          options: ["Paris", "Rome", "Berlin", "Madrid"],
          answer: "Paris",
          points: 100,
          time: 30,
        },
      ],
    },
    updated_at: "2026-08-19T00:00:00Z",
    owner_id: user.id,
    owner_name: user.name,
    visibility: "private",
    tags: [],
    ratings: [],
    play_count: 0,
    show_answers: false,
  };
}

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

async function installDeterministicApi(context: BrowserContext) {
  let savedGame = gameRecord("e2e-smoke-quiz");

  await context.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

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

    if (request.method() === "POST" && path === "/api/auth/login") {
      return json(route, { ok: true, token: "e2e-token", user });
    }
    if (request.method() === "GET" && path === "/api/users/me") {
      return json(route, user);
    }
    if (request.method() === "POST" && path === "/api/games/") {
      const payload = request.postDataJSON() as { id?: string; data?: unknown };
      savedGame = gameRecord(payload.id ?? savedGame.id, payload.data);
      return json(route, { id: savedGame.id, play_url: `/play/quiz/${savedGame.id}` });
    }
    if (request.method() === "GET" && path.startsWith("/api/games/") && path !== "/api/games/") {
      return json(route, savedGame);
    }
    if (request.method() === "POST" && path.endsWith("/play-snapshot")) {
      return json(route, {
        data: savedGame.data,
        version: "e2e-version",
        snapshotToken: "e2e-snapshot-token",
      });
    }
    if (request.method() === "GET" && path === "/api/games/") {
      return json(route, { games: [savedGame], total: 1, limit: 100, offset: 0 });
    }
    if (request.method() === "GET" && path === "/api/played-games/me") {
      return json(route, []);
    }
    if (request.method() === "GET" && path.endsWith("/results")) {
      return json(route, []);
    }
    if (request.method() === "POST" && path.endsWith("/results")) {
      return json(route, { ok: true });
    }

    return json(route, { error: `Unhandled E2E API request: ${request.method()} ${path}` }, 404);
  });
}

test("login, save, reopen, and play a quiz", async ({ page }) => {
  await installDeterministicApi(page.context());

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(user.email);
  await page.getByRole("textbox", { name: /Пароль/ }).fill("e2e-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("heading", { name: "Игры" })).toBeVisible();

  await page.getByRole("link", { name: /Новый квиз/ }).click();
  await expect(page).toHaveURL(/\/builder\/quiz$/);
  await page.getByPlaceholder("Название квиза").fill(title);
  await page.getByPlaceholder("Текст вопроса...").fill("What is the capital of France?");
  await page.getByPlaceholder("Вариант A").fill("Paris");
  await page.getByPlaceholder("Вариант B").fill("Rome");
  await page.getByPlaceholder("Вариант C").fill("Berlin");
  await page.getByPlaceholder("Вариант D").fill("Madrid");
  await page.getByRole("button", { name: "Отметить верным" }).first().click();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Квиз сохранён!")).toBeVisible();

  await page.goto("/library");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("heading", { name: title }).click();
  await expect(page).toHaveURL(/\/game\/[^/]+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.waitForLoadState("networkidle");
  const editLink = page.getByRole("link", { name: /Редактировать/ });
  await expect(editLink).toBeVisible();
  await editLink.click();
  await expect(page).toHaveURL(/\/builder\/quiz\?id=[^&]+$/);
  await expect(page.getByPlaceholder("Название квиза")).toHaveValue(title);

  await page.getByRole("button", { name: "Играть" }).click();
  await page.getByRole("button", { name: "Офлайн" }).click();
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: /Открыть плеер/ }).click();
  const player = await popupPromise;
  await expect(player).toHaveURL(/\/play\/quiz\/[^/]+$/);
  await expect(player.getByRole("heading", { name: title })).toBeVisible();
  await player.getByRole("button", { name: /Начать/ }).click();
  await player.getByRole("button", { name: "Paris" }).click();
  await player.getByRole("button", { name: "Ответить" }).click();
  await expect(player.getByRole("heading", { name: "Готово!" })).toBeVisible();
  await expect(player.getByRole("button", { name: "Пройти ещё раз" })).toBeVisible();
  await expect(player.getByRole("button", { name: "В библиотеку" })).toBeVisible();
  await expect(player.getByRole("button", { name: "На главную" })).toBeVisible();
  await player.close();
});
