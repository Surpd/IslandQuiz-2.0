import { expect, test } from "@playwright/test";

const apiOrigin = "https://api.islandquiz.online";

test.setTimeout(180_000);

test("Quiz Builder creates, switches, independently edits and limits variants", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("islandquiz.token", "registered-variants-token");
  });
  await page.route(`${apiOrigin}/api/users/me`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "registered", email: "registered@example.test", name: "Registered" }) });
  });
  await page.goto("/builder/quiz", { waitUntil: "commit" });
  await expect(page.locator('html[data-app-hydrated="true"]')).toHaveAttribute("data-app-hydrated", "true", { timeout: 120_000 });
  const settings = page.locator('.builder-mobile-header button[aria-label="Настройки"]');
  await expect(settings).toBeVisible();
  await expect(settings).toHaveAttribute("aria-expanded", "false");
  await settings.click();
  const settingsDialog = page.getByRole("dialog", { name: "Настройки" });
  await expect(settingsDialog).toBeVisible();
  await settingsDialog.getByRole("button", { name: "Создать второй вариант" }).click();
  await page.getByRole("button", { name: /Пустой вариант/ }).click();
  await settingsDialog.getByRole("button", { name: "Закрыть настройки" }).click();
  await expect(page.getByRole("button", { name: /Вариант 2 из 2/ })).toBeVisible();
  await page.getByRole("button", { name: "ABCD", exact: true }).last().click();
  await page.getByPlaceholder(/Текст вопроса/).fill("Независимый вопрос второго варианта");
  await page.getByRole("button", { name: "Предыдущий вариант" }).click();
  await expect(page.getByPlaceholder(/Текст вопроса/)).not.toHaveValue("Независимый вопрос второго варианта");
  await page.getByRole("button", { name: "Следующий вариант" }).click();
  await expect(page.getByPlaceholder(/Текст вопроса/)).toHaveValue("Независимый вопрос второго варианта");

  for (let count = 2; count < 4; count += 1) {
    await page.getByRole("button", { name: new RegExp(`Вариант \\d из ${count}`) }).click();
    await page.getByRole("button", { name: "+ Новый вариант" }).click();
    await page.getByRole("button", { name: /Пустой вариант/ }).click();
  }
  await page.getByRole("button", { name: /Вариант 4 из 4/ }).click();
  await expect(page.getByRole("button", { name: "+ Новый вариант" })).toBeDisabled();
  page.once("dialog", (dialog) => void dialog.accept());
  await expect(page.getByRole("button", { name: "Удалить Вариант 4" })).toBeVisible();
  await page.getByRole("button", { name: "Удалить Вариант 4" }).click();
  await expect(page.getByRole("button", { name: /Вариант 1 из 3/ })).toBeVisible();
});
