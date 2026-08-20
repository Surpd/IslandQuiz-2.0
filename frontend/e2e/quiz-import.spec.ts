import { expect, test, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

const v2Headers = [
  "Тип вопроса",
  "Вопрос",
  "Варианты ответа",
  "Правильный ответ",
  "Баллы",
  "Время, сек",
];

type ImportedQuestion = {
  type: string;
  q: string;
  options: string[];
  answer: string;
  points: number;
  time: number;
};

type ImportResult = {
  ok: boolean;
  error?: string;
  questions?: ImportedQuestion[];
};

function makeXlsx(rows: unknown[][], options: { v2?: boolean; metadata?: boolean } = {}): Buffer {
  const v2 = options.v2 !== false;
  const table = v2
    ? [
        ["IslandQuiz — импорт вопросов", "", "", "", "", ""],
        ["Инструкция", "", "", "", "", ""],
        ["", "", "", "", "", ""],
        v2Headers,
        ...rows,
      ]
    : [["type", "question", "options", "answer", "points", "time"], ...rows];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(table), "Вопросы");
  if (v2 && options.metadata !== false) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["key", "value"],
        ["format", "islandquiz_quiz"],
        ["schema_version", "2"],
        ["delimiter", "|"],
        ["pair_delimiter", "→"],
      ]),
      "_islandquiz",
    );
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function importBuffer(page: Page, name: string, buffer: Buffer): Promise<ImportResult> {
  return page.evaluate(
    async ({ name: fileName, bytes }) => {
      const { importQuizXlsx } = await import("/src/lib/exports.ts");
      try {
        const file = new File([new Uint8Array(bytes)], fileName);
        const questions = await importQuizXlsx(file, 30);
        return {
          ok: true,
          questions: questions.map(({ id: _id, image: _image, ...question }) => question),
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    { name, bytes: Array.from(buffer) },
  );
}

async function openBuilder(page: Page) {
  await page.goto("/builder/quiz");
}

test.describe("Quiz import schema v2 and legacy compatibility", () => {
  test("imports v2 choice", async ({ page }) => {
    await openBuilder(page);
    const result = await importBuffer(
      page,
      "choice.xlsx",
      makeXlsx([["Выбор ответа", "2+2?", "3 | 4 | 5", "4", 10, 20]]),
    );
    expect(result.ok).toBe(true);
    expect(result.questions?.[0]).toMatchObject({
      type: "choice",
      options: ["3", "4", "5"],
      answer: "4",
      points: 10,
      time: 20,
    });
  });

  test("imports v2 bool Да", async ({ page }) => {
    await openBuilder(page);
    const result = await importBuffer(
      page,
      "bool-yes.xlsx",
      makeXlsx([["Да / Нет", "Небо голубое?", "", "Да", 50, 30]]),
    );
    expect(result.questions?.[0]).toMatchObject({ type: "bool", answer: "true" });
  });

  test("imports v2 bool Нет", async ({ page }) => {
    await openBuilder(page);
    const result = await importBuffer(
      page,
      "bool-no.xlsx",
      makeXlsx([["Да / Нет", "2 больше 3?", "", "нет", 50, 30]]),
    );
    expect(result.questions?.[0]).toMatchObject({ type: "bool", answer: "false" });
  });

  test("imports v2 text", async ({ page }) => {
    await openBuilder(page);
    const result = await importBuffer(
      page,
      "text.xlsx",
      makeXlsx([["Текстовый ответ", "Столица Франции?", "", "Париж", 100, 30]]),
    );
    expect(result.questions?.[0]).toMatchObject({ type: "text", answer: "Париж" });
  });

  test("imports v2 matching into the existing pair model", async ({ page }) => {
    await openBuilder(page);
    const result = await importBuffer(
      page,
      "matching.xlsx",
      makeXlsx([
        ["Сопоставление", "Страны и столицы", "Франция → Париж | Германия → Берлин", "", 100, 45],
      ]),
    );
    expect(result.questions?.[0]).toMatchObject({
      type: "matching",
      options: [],
      answer: JSON.stringify([
        { left: "Франция", right: "Париж" },
        { left: "Германия", right: "Берлин" },
      ]),
    });
  });

  test("imports v2 close", async ({ page }) => {
    await openBuilder(page);
    const result = await importBuffer(
      page,
      "close.xlsx",
      makeXlsx([
        ["Пропуски", "Столица Франции — ___, Германии — ___", "", "Париж | Берлин", 100, 30],
      ]),
    );
    expect(result.questions?.[0]).toMatchObject({
      type: "close",
      answer: JSON.stringify(["Париж", "Берлин"]),
    });
  });

  test("imports v2 ordering and keeps the correct order", async ({ page }) => {
    await openBuilder(page);
    const result = await importBuffer(
      page,
      "ordering.xlsx",
      makeXlsx([
        ["Порядок", "Числа по возрастанию", "Три | Один | Два", "Один | Два | Три", 100, 30],
      ]),
    );
    expect(result.questions?.[0]).toMatchObject({
      type: "ordering",
      options: [],
      answer: JSON.stringify(["Один", "Два", "Три"]),
    });
  });

  test("imports several question types from one workbook", async ({ page }) => {
    await openBuilder(page);
    const result = await importBuffer(
      page,
      "mixed.xlsx",
      makeXlsx([
        ["Выбор ответа", "Q1", "A | B", "A", 10, 10],
        ["Да / Нет", "Q2", "", "false", 20, 20],
        ["Текстовый ответ", "Q3", "", "C", 30, 30],
      ]),
    );
    expect(result.questions?.map((question) => question.type)).toEqual(["choice", "bool", "text"]);
  });

  test("trims whitespace around pipe delimiters", async ({ page }) => {
    await openBuilder(page);
    const result = await importBuffer(
      page,
      "spaces.xlsx",
      makeXlsx([["Выбор ответа", "Q", " A  |  B | C ", " B ", 100, 30]]),
    );
    expect(result.questions?.[0]).toMatchObject({ options: ["A", "B", "C"], answer: "B" });
  });

  test("ignores fully empty rows", async ({ page }) => {
    await openBuilder(page);
    const result = await importBuffer(
      page,
      "empty-rows.xlsx",
      makeXlsx([
        ["", "", "", "", "", ""],
        ["Текстовый ответ", "Q", "", "A", 100, 30],
      ]),
    );
    expect(result.questions).toHaveLength(1);
  });

  test("reports an invalid type without internal identifiers", async ({ page }) => {
    await openBuilder(page);
    const result = await importBuffer(
      page,
      "invalid-type.xlsx",
      makeXlsx([["Неизвестный тип", "Q", "A | B", "A", 100, 30]]),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Строка 5:");
    expect(result.error).toContain("неизвестный тип вопроса");
    expect(result.error).not.toContain("choice");
  });

  test("reports malformed matching", async ({ page }) => {
    await openBuilder(page);
    const result = await importBuffer(
      page,
      "invalid-matching.xlsx",
      makeXlsx([["Сопоставление", "Q", "Франция Париж | Германия → Берлин", "", 100, 30]]),
    );
    expect(result.error).toContain("Строка 5:");
    expect(result.error).toContain("формат");
  });

  test("reports a choice answer absent from options", async ({ page }) => {
    await openBuilder(page);
    const result = await importBuffer(
      page,
      "invalid-choice.xlsx",
      makeXlsx([["Выбор ответа", "Q", "A | B", "C", 100, 30]]),
    );
    expect(result.error).toContain("правильный ответ должен входить");
  });

  test("keeps importing the old XLSX format", async ({ page }) => {
    await openBuilder(page);
    const result = await importBuffer(
      page,
      "legacy.xlsx",
      makeXlsx([["choice", "Q", "A | B", "A", 100, 30]], { v2: false }),
    );
    expect(result.questions?.[0]).toMatchObject({
      type: "choice",
      options: ["A", "B"],
      answer: "A",
    });
  });

  test("keeps importing the old CSV format", async ({ page }) => {
    await openBuilder(page);
    const csv = Buffer.from(
      "type,question,options,answer,points,time\nchoice,Q,A | B,A,100,30\n",
      "utf8",
    );
    const result = await importBuffer(page, "legacy.csv", csv);
    expect(result.questions?.[0]).toMatchObject({
      type: "choice",
      options: ["A", "B"],
      answer: "A",
    });
  });

  test("recognizes v2 headers when the service sheet was removed", async ({ page }) => {
    await openBuilder(page);
    const result = await importBuffer(
      page,
      "v2-without-service-sheet.xlsx",
      makeXlsx([["Текстовый ответ", "Q", "", "A", 100, 30]], { metadata: false }),
    );
    expect(result.questions?.[0]).toMatchObject({ type: "text", answer: "A" });
  });

  test("the downloaded template is available and imports all six examples", async ({
    page,
    request,
  }) => {
    await openBuilder(page);
    const response = await request.get("/templates/islandquiz-quiz-import-v2.xlsx");
    expect(response.ok()).toBe(true);
    const result = await importBuffer(
      page,
      "islandquiz-quiz-import-v2.xlsx",
      await response.body(),
    );
    expect(result.questions).toHaveLength(6);
    expect(result.questions?.map((question) => question.type)).toEqual([
      "choice",
      "bool",
      "text",
      "matching",
      "close",
      "ordering",
    ]);
  });
});
