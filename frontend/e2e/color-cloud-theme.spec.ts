import { expect, test } from "@playwright/test";

const apiOrigin = "https://api.islandquiz.online";

test.use({ viewport: { width: 1920, height: 1080 } });

test("Classic uses the Color Cloud visual and stays readable and contained", async ({ page }) => {
  const game = {
    id: "color-cloud-e2e",
    kind: "quiz",
    data: {
      config: {
        title: "Color Cloud E2E",
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

  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && path === "/api/games/color-cloud-e2e/play") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(game),
      });
    }
    if (request.method() === "POST" && path === "/api/games/color-cloud-e2e/play-snapshot") {
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

  await page.goto("/play/quiz/color-cloud-e2e?theme=classic");
  await expect(page.locator('[data-scope="player"].pt-classic')).toBeVisible();
  await expect(page.locator(".theme-layer")).toHaveCount(9);
  await expect(page.getByRole("heading", { name: "Color Cloud E2E" })).toBeVisible();

  const initialMetrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(initialMetrics.scrollWidth).toBeLessThanOrEqual(initialMetrics.clientWidth);

  const snapshotResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/api/games/color-cloud-e2e/play-snapshot"),
  );
  await page.getByRole("button", { name: /Начать/ }).click();
  await expect((await snapshotResponse).status()).toBe(200);
  await expect(page.getByText("Which answer is correct?")).toBeVisible();
  await expect(page.locator("button.border-2")).toHaveCount(4);

  const motion = await page.locator(".theme-layer--cloud-peach").evaluate(async (layer) => {
    const before = getComputedStyle(layer).transform;
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    const style = getComputedStyle(layer);
    return {
      before,
      after: style.transform,
      animationName: style.animationName,
      duration: style.animationDuration,
      x: style.getPropertyValue("--theme-animation-x").trim(),
      y: style.getPropertyValue("--theme-animation-y").trim(),
      scale: style.getPropertyValue("--theme-animation-scale").trim(),
    };
  });
  expect(motion.animationName).toBe("theme-cloud-drift");
  expect(motion.before).not.toBe(motion.after);
  expect(motion.duration).toBe("26s");
  expect(motion.x).toBe("30px");
  expect(motion.y).toBe("-18px");
  expect(motion.scale).toBe("1.03");

  await page.emulateMedia({ reducedMotion: "reduce" });
  const animationNames = await page
    .locator(".theme-layer")
    .evaluateAll((layers) => layers.map((layer) => getComputedStyle(layer).animationName));
  expect(new Set(animationNames)).toEqual(new Set(["none"]));

  await page.goto("/play/quiz/color-cloud-e2e?theme=color-cloud");
  await expect(page.locator('[data-scope="player"].pt-classic')).toBeVisible();
  await expect(page.locator('[data-scope="player"].pt-color-cloud')).toHaveCount(0);
});
