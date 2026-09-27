import { test, expect } from "@playwright/test";

for (const width of [360, 390, 430]) {
  test(`motion landing fits mobile width ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/landing-motion");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Создать игру" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Игра на проекторе и по ссылке" }),
    ).toBeAttached();

    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth).toBeLessThanOrEqual(width);

    for (const selector of ["#formats", "#rooms", "#ai", "#features"]) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await expect(page.locator(selector)).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    }
  });
}
