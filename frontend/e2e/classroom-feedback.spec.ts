import { expect, test, type Page } from "@playwright/test";

const apiOrigin = "https://api.islandquiz.online";

async function mockQuiz(page: Page, showResult: "each" | "end", question: Record<string, unknown>) {
  const game = {
    id: `classroom-${showResult}`,
    kind: "quiz",
    data: {
      config: { title: "Classroom feedback", description: "", orderMode: "sequential", showResult, defaultTime: 30, totalTime: 10 },
      questions: [question],
    },
    visibility: "public",
    show_answers: false,
  };
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && path === `/api/games/classroom-${showResult}/play`) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(game) });
    }
    if (request.method() === "POST" && path === `/api/games/classroom-${showResult}/play-snapshot`) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: game.data, snapshotToken: "snapshot", version: "v1" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
}

test("showResult each gives explicit incorrect feedback before advancing", async ({ page }) => {
  await mockQuiz(page, "each", { id: "q1", type: "choice", q: "Which?", options: ["Right", "Wrong"], answer: "Right", points: 100, time: 30 });
  await page.goto("/play/quiz/classroom-each");
  await page.getByRole("button", { name: /Начать/ }).click();
  await page.getByRole("button", { name: /Wrong/ }).click();
  await page.getByRole("button", { name: "Ответить" }).click();
  await expect(page.getByRole("status")).toContainText("Неверно");
  await expect(page.getByRole("status")).toContainText("Правильный ответ");
});

test("showResult end confirms submission without revealing correctness", async ({ page }) => {
  await mockQuiz(page, "end", { id: "q1", type: "choice", q: "Which?", options: ["Right", "Wrong"], answer: "Right", points: 100, time: 30 });
  await page.goto("/play/quiz/classroom-end");
  await page.getByRole("button", { name: /Начать/ }).click();
  await page.getByRole("button", { name: /Wrong/ }).click();
  await page.getByRole("button", { name: "Ответить" }).click();
  await expect(page.getByRole("status")).toContainText("Ответ принят");
  await expect(page.getByRole("status")).not.toContainText("Неверно");
});

test("ordering explains that the first item is at the top", async ({ page }) => {
  await mockQuiz(page, "end", { id: "q1", type: "ordering", q: "Arrange", options: [], answer: JSON.stringify(["one", "two", "three"]), points: 100, time: 30 });
  await page.goto("/play/quiz/classroom-end");
  await page.getByRole("button", { name: /Начать/ }).click();
  await expect(page.getByText("Первый элемент — сверху, последний — снизу.")).toBeVisible();
});
