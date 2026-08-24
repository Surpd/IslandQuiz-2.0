import { expect, test, type Page } from "@playwright/test";

const apiOrigin = "https://api.islandquiz.online";
const screenshotDir = "artifacts/answer-selection";

const game = {
  id: "answer-selection-e2e",
  kind: "quiz",
  data: {
    config: {
      title: "Answer Selection E2E",
      description: "",
      orderMode: "sequential",
      showResult: "end",
      defaultTime: 30,
      totalTime: 10,
    },
    questions: [
      {
        id: "q1",
        type: "choice",
        q: "Which answer is correct?",
        options: ["A", "B", "C", "D"],
        answer: "A",
        points: 100,
        time: 30,
      },
    ],
  },
  visibility: "public",
  owner_id: "owner",
  owner_name: "Автор",
  show_answers: false,
  updated_at: "2026-08-20T00:00:00Z",
};

async function mockGame(page: Page) {
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && path === "/api/games/answer-selection-e2e/play") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(game),
      });
    }
    if (request.method() === "POST" && path === "/api/games/answer-selection-e2e/play-snapshot") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: game.data, snapshotToken: "snapshot", version: "v1" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

async function openQuestion(page: Page, theme: "classic" | "midnight") {
  await mockGame(page);
  await page.goto(`/play/quiz/answer-selection-e2e?theme=${theme}`);
  await expect(page.locator(`[data-scope="player"].pt-${theme}`)).toBeVisible();
  await page.getByRole("button", { name: /Начать/ }).click();
  await expect(page.getByText("Which answer is correct?")).toBeVisible();
}

async function selectB(page: Page) {
  const answerB = page.getByRole("button", { name: /^B\b/ });
  await expect(answerB).toHaveAttribute("data-answer-state", "default");
  await expect(answerB).toHaveAttribute("aria-pressed", "false");
  await answerB.click();
  await expect(answerB).toHaveAttribute("data-answer-state", "selected");
  await expect(answerB).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(600);
  const answerA = page.getByRole("button", { name: /^A\b/ });
  await expect(answerA).toHaveAttribute("data-answer-state", "default");
  const [selectedStyle, defaultStyle] = await Promise.all([
    answerB.evaluate((element) => {
      const originalTransition = element.style.transition;
      element.style.transition = "none";
      const style = getComputedStyle(element);
      const result = {
        background: style.backgroundColor,
        border: style.borderTopColor,
      };
      element.style.transition = originalTransition;
      return result;
    }),
    answerA.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        className: element.className,
        background: style.backgroundColor,
        border: style.borderTopColor,
      };
    }),
  ]);
  expect(selectedStyle.background).not.toBe(defaultStyle.background);
  expect(selectedStyle.border).not.toBe(defaultStyle.border);
  return answerB;
}

test.describe("answer selection on desktop", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  for (const theme of ["classic", "midnight"] as const) {
    test(`${theme} exposes a clear selected state and submits B`, async ({ page }) => {
      await openQuestion(page, theme);
      await page.screenshot({
        path: `${screenshotDir}/answer-selection-${theme}-desktop-default.png`,
      });
      await selectB(page);
      await page.screenshot({
        path: `${screenshotDir}/answer-selection-${theme}-desktop-selected.png`,
      });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const reducedMotion = await page.getByRole("button", { name: /^B\b/ }).evaluate((element) => {
        const style = getComputedStyle(element);
        return { transform: style.transform, transitionDuration: style.transitionDuration };
      });
      expect(reducedMotion.transform).toBe("none");
      expect(reducedMotion.transitionDuration).toBe("0s");
      await page.getByRole("button", { name: "Ответить" }).click();
      await expect(page.getByRole("heading", { name: "Готово!" })).toBeVisible();
      await expect(page.getByText("0/1")).toBeVisible();
    });
  }
});

test.describe("answer selection on mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const theme of ["classic", "midnight"] as const) {
    test(`${theme} keeps the selected state readable`, async ({ page }) => {
      await openQuestion(page, theme);
      await selectB(page);
      await page.screenshot({
        path: `${screenshotDir}/answer-selection-${theme}-mobile-selected.png`,
      });
    });
  }
});
