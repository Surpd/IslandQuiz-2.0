import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test("Quiz Builder creates, switches, independently edits and limits variants", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/builder/quiz");
  await page.waitForTimeout(35_000);
  const settings = page.locator('.builder-mobile-header button[aria-label="Настройки"]');
  await expect(settings).toHaveAttribute("aria-expanded", "false");
  await settings.click();
  await page.getByRole("button", { name: "Создать второй вариант" }).click();
  await page.getByRole("button", { name: /Пустой вариант/ }).click();
  await page.getByRole("button", { name: "Закрыть настройки" }).click();
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
});
