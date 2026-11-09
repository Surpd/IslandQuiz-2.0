import { expect, test } from "@playwright/test";

const apiOrigin = "https://api.islandquiz.online";

test("Jeopardy confirms each team score and prevents duplicate awards", async ({ page }) => {
  const data = {
    config: { title: "Score feedback", timeBase: 30, timeStep: 0, timeFinal: 30 },
    rounds: [[{
      category: "Математика",
      questions: [
        { points: 300, q: "Вопрос за 300", a: "Ответ 300" },
        { points: 400, q: "Вопрос за 400", a: "Ответ 400" },
      ],
    }]],
    final: { category: "Финал", q: "Финальный вопрос", a: "Ответ" },
  };

  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/games/score-feedback/play-snapshot"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data, snapshotToken: "snapshot", version: "v1" }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto("/play/jeopardy/score-feedback");
  await page.getByRole("button", { name: "300", exact: true }).click();
  await page.getByRole("button", { name: "Показать ответ" }).click();

  const first = page.getByTestId("jeopardy-scoring-t1");
  const second = page.getByTestId("jeopardy-scoring-t2");
  const plus = first.getByRole("button", { name: "+300" });
  const minus = first.getByRole("button", { name: "−300" });

  await plus.click();
  await expect(first).toHaveAttribute("data-judgement", "correct");
  await expect(plus).toHaveAttribute("aria-pressed", "true");
  await expect(plus).toBeDisabled();
  await expect(minus).toBeDisabled();

  // Another team may still attempt the same question.
  await expect(second.getByRole("button", { name: "−300" })).toBeEnabled();
  await second.getByRole("button", { name: "−300" }).click();
  await expect(second).toHaveAttribute("data-judgement", "wrong");
  await expect(second.getByRole("button", { name: "−300" })).toHaveAttribute("aria-pressed", "true");
  await expect(second.getByRole("button", { name: "+300" })).toBeDisabled();

  await page.getByRole("button", { name: "Закрыть" }).click();

  // A judgement on one question does not block the next question.
  await page.getByRole("button", { name: "400", exact: true }).click();
  await page.getByRole("button", { name: "Показать ответ" }).click();
  await expect(first).toHaveAttribute("data-judgement", "pending");
  await expect(first.getByRole("button", { name: "+400" })).toBeEnabled();
  await expect(second.getByRole("button", { name: "−400" })).toBeEnabled();
});
