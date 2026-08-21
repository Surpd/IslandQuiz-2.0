import { expect, test } from "@playwright/test";

const apiOrigin = "https://api.islandquiz.online";

test.use({ viewport: { width: 390, height: 844 } });

test("offline quiz completion offers replay, library and home actions", async ({ page }) => {
  const game = {
    id: "completion-e2e",
    kind: "quiz",
    data: {
      config: {
        title: "Completion E2E",
        description: "",
        theme: "amber",
        orderMode: "sequential",
        showResult: "end",
        defaultTime: 30,
        totalTime: 10,
      },
      questions: [
        { id: "q1", type: "choice", q: "2 + 2?", options: ["4", "5"], answer: "4", points: 100, time: 30 },
      ],
    },
    visibility: "public",
    owner_id: "owner",
    owner_name: "Автор",
    show_answers: false,
    updated_at: "2026-08-20T00:00:00Z",
  };

  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && path === "/api/games/completion-e2e/play") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(game) });
    }
    if (request.method() === "POST" && path === "/api/games/completion-e2e/play-snapshot") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: game.data, snapshotToken: "snapshot", version: "v1" }),
      });
    }
    if (request.method() === "POST" && path === "/api/quiz/completion-e2e/results") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.goto("/play/quiz/completion-e2e");
  await page.getByRole("button", { name: /Начать/ }).click();
  await page.getByRole("button", { name: "4" }).click();
  await page.getByRole("button", { name: "Ответить" }).click();
  await expect(page.getByRole("heading", { name: "Готово!" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Пройти ещё раз" })).toBeVisible();
  await expect(page.getByRole("button", { name: "В библиотеку" })).toBeVisible();
  await expect(page.getByRole("button", { name: "На главную" })).toBeVisible();
});
