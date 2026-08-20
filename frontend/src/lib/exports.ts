// Export helpers — Excel (xlsx) is primary; browser print for PDF.

import * as XLSX from "xlsx";
import Papa from "papaparse";
import type {
  JeopardyCategory,
  JeopardyData,
  JeopardyFinal,
  JeopardyQuestion,
  MillionaireData,
  MillionaireQuestion,
  QuizData,
  QuizQuestion,
  QuizQuestionType,
} from "./types";
import { newId } from "./storage";
import { formatQuizAnswer } from "./format-answer";

/* ---------------- Excel export ---------------- */

export function exportQuizExcel(data: QuizData) {
  const wb = XLSX.utils.book_new();
  const rows = data.questions.map((q, i) => ({
    "#": i + 1,
    type: q.type,
    question: q.q,
    options: q.options.join(" | "),
    answer:
      q.type === "matching"
        ? formatMatchingForCell(q.answer)
        : q.type === "close" || q.type === "ordering"
          ? formatListForCell(q.answer)
          : q.answer,
    points: q.points,
    time: q.time,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Вопросы");
  XLSX.writeFile(wb, `${data.config.title || "quiz"}.xlsx`);
}

function formatMatchingForCell(raw: string): string {
  try {
    const pairs = JSON.parse(raw || "[]") as { left: string; right: string }[];
    return pairs.map((p) => `${p.left} → ${p.right}`).join("; ");
  } catch {
    return raw;
  }
}

function formatListForCell(raw: string): string {
  try {
    const arr = JSON.parse(raw || "[]") as string[];
    if (!Array.isArray(arr)) return raw;
    return arr.join(" | ");
  } catch {
    return raw;
  }
}

export function exportJeopardyExcel(data: JeopardyData) {
  const wb = XLSX.utils.book_new();
  const rows: Record<string, string | number>[] = [];
  data.rounds.forEach((round, ri) => {
    round.forEach((cat) => {
      cat.questions.forEach((q) => {
        rows.push({
          round: ri + 1,
          category: cat.category,
          points: q.points,
          question: q.q,
          answer: q.a,
        });
      });
    });
  });
  rows.push({
    round: "final",
    category: data.final.category,
    points: 0,
    question: data.final.q,
    answer: data.final.a,
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Своя игра");
  XLSX.writeFile(wb, "своя-игра.xlsx");
}

export function exportMillionaireExcel(data: MillionaireData) {
  const wb = XLSX.utils.book_new();
  const rows = data.questions.map((q, i) => ({
    "#": i + 1,
    money: q.money,
    question: q.q,
    a: q.options[0]?.text ?? "",
    b: q.options[1]?.text ?? "",
    c: q.options[2]?.text ?? "",
    d: q.options[3]?.text ?? "",
    correct: ["A", "B", "C", "D"][q.options.findIndex((o) => o.correct)] ?? "A",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Миллионер");
  XLSX.writeFile(wb, "миллионер.xlsx");
}

/* ---------------- Excel templates ---------------- */

export function downloadExcelTemplate(kind: "quiz" | "jeopardy" | "millionaire") {
  if (kind === "quiz") {
    const link = document.createElement("a");
    link.href = "/templates/islandquiz-quiz-import-v2.xlsx";
    link.download = "islandquiz-quiz-import-v2.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }
  const wb = XLSX.utils.book_new();
  let rows: Record<string, string | number>[] = [];
  let name = "template";
  if (kind === "jeopardy") {
    name = "своя-игра-template";
    rows = [
      { round: 1, category: "История", points: 100, question: "Год начала ВОВ?", answer: "1941" },
      { round: 1, category: "История", points: 200, question: "Первый президент США?", answer: "Вашингтон" },
      { round: "final", category: "Наука", points: 0, question: "Единица силы?", answer: "Ньютон" },
    ];
  } else {
    name = "миллионер-template";
    rows = [
      { money: 500, question: "Столица Японии?", a: "Токио", b: "Осака", c: "Киото", d: "Нагоя", correct: "A" },
      { money: 1000, question: "Автор «Войны и мира»?", a: "Толстой", b: "Достоевский", c: "Чехов", d: "Пушкин", correct: "A" },
    ];
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Шаблон");
  XLSX.writeFile(wb, `${name}.xlsx`);
}

/* ---------------- Excel import ---------------- */

async function readXlsx(file: File): Promise<Record<string, string>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return ws ? XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "", raw: false }) : [];
}

type ImportRow = { cells: string[]; rowNumber: number };
type ImportSchema = "v2" | "legacy";

class QuizImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuizImportError";
  }
}

const V2_HEADERS = ["тип вопроса", "вопрос", "варианты ответа", "правильный ответ", "баллы", "время, сек"];
const LEGACY_HEADERS = ["type", "question", "options", "answer", "points", "time"];
const TYPE_ALIASES: Record<string, QuizQuestionType> = {
  choice: "choice",
  bool: "bool",
  text: "text",
  matching: "matching",
  close: "close",
  ordering: "ordering",
  "выбор ответа": "choice",
  "да / нет": "bool",
  "текстовый ответ": "text",
  сопоставление: "matching",
  пропуски: "close",
  порядок: "ordering",
};

function cleanCell(value: unknown): string {
  return String(value ?? "").replace(/^\uFEFF/, "").trim();
}

function normalizeHeader(value: unknown): string {
  return cleanCell(value).toLowerCase().replace(/\s+/g, " ");
}

function isEmptyRow(cells: string[]): boolean {
  return cells.every((cell) => !cleanCell(cell));
}

function rowMatches(cells: string[], expected: string[]): boolean {
  const actual = cells.map(normalizeHeader);
  return expected.every((header) => actual.includes(header));
}

function toRows(data: unknown[][]): ImportRow[] {
  return data.map((row, index) => ({
    cells: row.map(cleanCell),
    rowNumber: index + 1,
  }));
}

async function readImportFile(file: File): Promise<{ sheets: Record<string, ImportRow[]>; isCsv: boolean }> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const parsed = Papa.parse<string[]>(await file.text(), { skipEmptyLines: false });
    if (parsed.errors.length) {
      throw new QuizImportError("Не удалось прочитать CSV-файл. Проверьте разделители и заголовки.");
    }
    return { sheets: { CSV: toRows(parsed.data) }, isCsv: true };
  }

  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheets: Record<string, ImportRow[]> = {};
  wb.SheetNames.forEach((name) => {
    const ws = wb.Sheets[name];
    if (ws) {
      sheets[name] = toRows(
        XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false }),
      );
    }
  });
  return { sheets, isCsv: false };
}

function metadataFor(sheets: Record<string, ImportRow[]>): Map<string, string> {
  const metadataSheet = Object.entries(sheets).find(([name]) => name.toLowerCase() === "_islandquiz")?.[1];
  const metadata = new Map<string, string>();
  metadataSheet?.forEach(({ cells }) => {
    const key = normalizeHeader(cells[0]);
    if (key) metadata.set(key, cleanCell(cells[1]));
  });
  return metadata;
}

function findHeader(rows: ImportRow[], expected: string[]): ImportRow | undefined {
  return rows.find(({ cells }) => rowMatches(cells, expected));
}

function fail(rowNumber: number, message: string): never {
  throw new QuizImportError(`Строка ${rowNumber}: ${message}`);
}

function splitDelimited(raw: string, allowSemicolon = false): string[] {
  if (!cleanCell(raw)) return [];
  const delimiter = allowSemicolon && !raw.includes("|") ? /[;]/ : /[|]/;
  return raw.split(delimiter).map(cleanCell).filter(Boolean);
}

function parseJsonOrDelimited(raw: string, allowSemicolon = false): string[] {
  const value = cleanCell(raw);
  if (value.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(cleanCell).filter(Boolean);
    } catch {
      return [];
    }
  }
  return splitDelimited(value, allowSemicolon);
}

function parseNumber(raw: string, label: string, rowNumber: number, fallback: number): number {
  const value = cleanCell(raw);
  if (!value) return fallback;
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail(rowNumber, `в поле «${label}» укажите положительное число.`);
  }
  return parsed;
}

function parseType(raw: string, rowNumber: number, schema: ImportSchema): QuizQuestionType {
  const value = normalizeHeader(raw);
  if (!value) {
    if (schema === "legacy") return "choice";
    fail(rowNumber, "необходимо указать тип вопроса.");
  }
  const type = TYPE_ALIASES[value];
  if (!type) fail(rowNumber, `неизвестный тип вопроса «${cleanCell(raw)}». Выберите тип из шаблона.`);
  return type;
}

function parseBool(raw: string, rowNumber: number): string {
  const value = cleanCell(raw).toLowerCase();
  if (value === "да" || value === "true") return "true";
  if (value === "нет" || value === "false") return "false";
  fail(rowNumber, "для типа «Да / Нет» ответ должен быть «Да», «Нет», true или false.");
}

function parseMatching(raw: string, rowNumber: number, schema: ImportSchema): string {
  const value = cleanCell(raw);
  if (value.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const pairs = parsed.map((pair) => {
          const item = pair as { left?: unknown; right?: unknown };
          return { left: cleanCell(item?.left), right: cleanCell(item?.right) };
        });
        if (pairs.length >= 2 && pairs.every((pair) => pair.left && pair.right)) return JSON.stringify(pairs);
      }
    } catch {
      // Continue with the human-readable legacy format.
    }
  }
  const tokens = splitDelimited(value, schema === "legacy");
  if (tokens.length < 2) fail(rowNumber, "для типа «Сопоставление» необходимо указать минимум 2 пары.");
  const pairs = tokens.map((token) => {
    const arrow = token.indexOf("→");
    if (arrow < 0) fail(rowNumber, "каждая пара сопоставления должна иметь формат «левое → правое».");
    const left = cleanCell(token.slice(0, arrow));
    const right = cleanCell(token.slice(arrow + 1));
    if (!left || !right) fail(rowNumber, "в каждой паре сопоставления должны быть заполнены обе части.");
    return { left, right };
  });
  return JSON.stringify(pairs);
}

function sameItems(left: string[], right: string[]): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.length === sortedRight.length && sortedLeft.every((item, index) => item === sortedRight[index]);
}

function parseQuizRow(
  cells: string[],
  rowNumber: number,
  indexes: Record<string, number>,
  schema: ImportSchema,
  defaultTime: number,
): QuizQuestion {
  const value = (field: string) => cleanCell(cells[indexes[field]]);
  const type = parseType(value("type"), rowNumber, schema);
  const question = value("question");
  if (!question) fail(rowNumber, "необходимо заполнить вопрос.");
  const points = parseNumber(value("points"), "Баллы", rowNumber, 100);
  const time = parseNumber(value("time"), "Время, сек", rowNumber, defaultTime);
  const options = splitDelimited(value("options"));
  let answer = value("answer");
  let internalOptions: string[] = [];

  if (type === "choice") {
    if (options.length < 2) fail(rowNumber, "для типа «Выбор ответа» необходимо указать минимум 2 варианта ответа.");
    if (!answer) fail(rowNumber, "для типа «Выбор ответа» необходимо указать правильный ответ.");
    if (!options.includes(answer)) fail(rowNumber, "правильный ответ должен входить в список вариантов ответа.");
    internalOptions = options;
  } else if (type === "bool") {
    answer = parseBool(answer, rowNumber);
  } else if (type === "text") {
    if (!answer) fail(rowNumber, "для типа «Текстовый ответ» необходимо указать правильный ответ.");
  } else if (type === "matching") {
    answer = parseMatching(value("options") || answer, rowNumber, schema);
  } else if (type === "close") {
    const blanks = (question.match(/___/g) ?? []).length;
    const answers = parseJsonOrDelimited(answer, schema === "legacy");
    if (!blanks) fail(rowNumber, "в вопросе «Пропуски» должен быть хотя бы один маркер ___.");
    if (answers.length !== blanks) fail(rowNumber, `количество ответов должно совпадать с количеством пропусков (___): ${blanks}.`);
    answer = JSON.stringify(answers);
  } else if (type === "ordering") {
    const correct = parseJsonOrDelimited(answer, schema === "legacy");
    if (schema === "v2") {
      if (options.length < 2) fail(rowNumber, "для типа «Порядок» необходимо указать минимум 2 варианта ответа.");
      if (correct.length < 2) fail(rowNumber, "для типа «Порядок» необходимо указать правильный порядок.");
      if (!sameItems(options, correct)) fail(rowNumber, "варианты ответа и правильный порядок должны содержать один и тот же набор элементов.");
    }
    if (correct.length < 2) fail(rowNumber, "для типа «Порядок» необходимо указать минимум 2 элемента.");
    answer = JSON.stringify(correct);
  }

  return {
    id: newId(),
    type,
    q: question,
    image: "",
    options: internalOptions,
    answer,
    points,
    time,
  };
}

export async function importQuizXlsx(file: File, defaultTime: number): Promise<QuizQuestion[]> {
  const { sheets } = await readImportFile(file);
  const metadata = metadataFor(sheets);
  const metadataV2 = metadata.get("format") === "islandquiz_quiz" && metadata.get("schema_version") === "2";
  const questionEntry = Object.entries(sheets).find(([name]) => name.toLowerCase() === "вопросы") ?? Object.entries(sheets)[0];
  if (!questionEntry) throw new QuizImportError("В файле не найден лист с вопросами.");
  const [sheetName, rows] = questionEntry;
  const v2Header = findHeader(rows, V2_HEADERS);
  if (metadataV2 && !v2Header) throw new QuizImportError("В файле не найден лист «Вопросы» с заголовками шаблона.");
  const header = v2Header ?? findHeader(rows, LEGACY_HEADERS);
  if (!header) throw new QuizImportError("Не удалось определить формат файла. Используйте шаблон IslandQuiz или старый формат type | question | options | answer | points | time.");
  const schema: ImportSchema = metadataV2 || !!v2Header || (sheetName.toLowerCase() === "вопросы" && rowMatches(header.cells, V2_HEADERS)) ? "v2" : "legacy";
  const normalizedHeaders = header.cells.map(normalizeHeader);
  const expected = schema === "v2" ? V2_HEADERS : LEGACY_HEADERS;
  const indexes = Object.fromEntries(expected.map((field) => [field, normalizedHeaders.indexOf(field)]));
  const fieldIndexes = schema === "v2"
    ? { type: indexes[V2_HEADERS[0]], question: indexes[V2_HEADERS[1]], options: indexes[V2_HEADERS[2]], answer: indexes[V2_HEADERS[3]], points: indexes[V2_HEADERS[4]], time: indexes[V2_HEADERS[5]] }
    : { type: indexes.type, question: indexes.question, options: indexes.options, answer: indexes.answer, points: indexes.points, time: indexes.time };
  return rows
    .filter(({ rowNumber }) => rowNumber > header.rowNumber)
    .filter(({ cells }) => !isEmptyRow(cells))
    .map(({ cells, rowNumber }) => parseQuizRow(cells, rowNumber, fieldIndexes, schema, defaultTime));
}

export async function importJeopardyXlsx(
  file: File,
): Promise<{ rounds: JeopardyCategory[][]; final: JeopardyFinal | null }> {
  const rows = await readXlsx(file);
  const roundsMap = new Map<string, Map<string, JeopardyQuestion[]>>();
  let final: JeopardyFinal | null = null;
  rows.forEach((r) => {
    const round = String(r.round ?? "").trim().toLowerCase();
    if (round === "final") {
      final = {
        category: String(r.category ?? ""),
        q: String(r.question ?? ""),
        a: String(r.answer ?? ""),
        image: "",
      };
      return;
    }
    if (!round) return;
    const cats = roundsMap.get(round) ?? new Map();
    const catName = String(r.category ?? "");
    const cat = cats.get(catName) ?? [];
    cat.push({
      points: parseInt(String(r.points ?? "100")) || 100,
      q: String(r.question ?? ""),
      a: String(r.answer ?? ""),
      image: "",
    });
    cats.set(catName, cat);
    roundsMap.set(round, cats);
  });
  const rounds: JeopardyCategory[][] = [];
  Array.from(roundsMap.keys())
    .sort()
    .forEach((k) => {
      const cats = roundsMap.get(k)!;
      rounds.push(
        Array.from(cats.entries()).map(([category, questions]) => ({ category, questions })),
      );
    });
  return { rounds, final };
}

export async function importMillionaireXlsx(file: File): Promise<MillionaireQuestion[]> {
  const rows = await readXlsx(file);
  return rows.map((r) => {
    const letter = String(r.correct ?? "A").toUpperCase();
    const opts = [r.a, r.b, r.c, r.d].map((t, i) => ({
      text: String(t ?? ""),
      correct: ["A", "B", "C", "D"][i] === letter,
    }));
    return {
      q: String(r.question ?? ""),
      image: "",
      money: parseInt(String(r.money ?? "1000")) || 1000,
      options: opts,
    };
  });
}

/* ---------------- Print / PDF ---------------- */

export interface PrintOptions {
  withAnswers?: boolean;
}

export function printQuiz(data: QuizData, opts: PrintOptions = {}) {
  const win = window.open("", "_blank");
  if (!win) return;
  const withAnswers = opts.withAnswers !== false;
  
  const rows = data.questions
    .map((q, i) => {
      let answerBlock = "";
      
      if (q.type === "choice") {
        answerBlock = `
          <div class="choices">
            ${q.options.map((o, oi) => `
              <label class="choice-row">
                <span class="choice-circle">○</span>
                <span class="choice-letter">${String.fromCharCode(65 + oi)}</span>
                <span class="choice-text">${escape(o)}</span>
              </label>
            `).join("")}
          </div>`;
        return `
          <div class="q">
            <div class="qn">${i + 1}. ${escape(q.q)}</div>
            ${answerBlock}
            ${withAnswers ? `<div class="a"><strong>Ответ:</strong> ${escape(formatQuizAnswer(q))}</div>` : ""}
          </div>`;
      }
      
      if (q.type === "bool") {
        answerBlock = `
          <div class="choices">
            <label class="choice-row"><span class="choice-circle">○</span> Да</label>
            <label class="choice-row"><span class="choice-circle">○</span> Нет</label>
          </div>`;
        return `
          <div class="q">
            <div class="qn">${i + 1}. ${escape(q.q)}</div>
            ${answerBlock}
            ${withAnswers ? `<div class="a"><strong>Ответ:</strong> ${escape(formatQuizAnswer(q))}</div>` : ""}
          </div>`;
      }
      
      if (q.type === "text") {
        answerBlock = `<div class="text-answer">${"_".repeat(40)}</div>`;
        return `
          <div class="q">
            <div class="qn">${i + 1}. ${escape(q.q)}</div>
            ${answerBlock}
            ${withAnswers ? `<div class="a"><strong>Ответ:</strong> ${escape(formatQuizAnswer(q))}</div>` : ""}
          </div>`;
      }
      
      if (q.type === "matching") {
        try {
          const pairs = JSON.parse(q.answer || "[]") as { left: string; right: string }[];
          const shuffledRights = [...pairs].sort(() => Math.random() - 0.5);
          answerBlock = `
            <div class="matching-columns">
              <div class="matching-col">
                ${pairs.map((p, pi) => `
                  <div class="matching-row">
                    <span class="matching-num">${pi + 1}.</span>
                    <span class="matching-left">${escape(p.left)}</span>
                    <span class="matching-line"></span>
                  </div>
                `).join("")}
              </div>
              <div class="matching-col matching-variants">
                <div class="matching-variants-title">Варианты:</div>
                ${shuffledRights.map((p, pi) => `
                  <div class="matching-variant">${String.fromCharCode(65 + pi)}. ${escape(p.right)}</div>
                `).join("")}
              </div>
            </div>`;
        } catch { answerBlock = ""; }
        return `
          <div class="q">
            <div class="qn">${i + 1}. Сопоставьте:</div>
            <div class="qn-sub">${escape(q.q)}</div>
            ${answerBlock}
            ${withAnswers ? `<div class="a"><strong>Ответ:</strong> ${escape(formatQuizAnswer(q))}</div>` : ""}
          </div>`;
      }
      
      if (q.type === "ordering") {
        try {
          const items = JSON.parse(q.answer || "[]") as string[];
          const shuffled = [...items].sort(() => Math.random() - 0.5);
          answerBlock = `
            <div class="ordering-block">
              <div class="ordering-variants">
                <strong>Расставьте в правильном порядке:</strong>
                ${shuffled.map((item, oi) => `
                  <div class="ordering-variant">${String.fromCharCode(65 + oi)}. ${escape(item)}</div>
                `).join("")}
              </div>
              <div class="ordering-answers">
                ${items.map((_, oi) => `
                  <div class="ordering-row">
                    <span class="ordering-num">${oi + 1}.</span>
                    <span class="ordering-line">______</span>
                  </div>
                `).join("")}
              </div>
            </div>`;
        } catch { answerBlock = ""; }
        return `
          <div class="q">
            <div class="qn">${i + 1}. Расставьте по порядку:</div>
            <div class="qn-sub">${escape(q.q)}</div>
            ${answerBlock}
            ${withAnswers ? `<div class="a"><strong>Ответ:</strong> ${escape(formatQuizAnswer(q))}</div>` : ""}
          </div>`;
      }
      
      if (q.type === "close") {
        answerBlock = `<div class="close-text">${escape(q.q.replace(/___/g, "________"))}</div>`;
        return `
          <div class="q">
            <div class="qn">${i + 1}. Заполните пропуски:</div>
            ${answerBlock}
            ${withAnswers ? `<div class="a"><strong>Ответ:</strong> ${escape(formatQuizAnswer(q))}</div>` : ""}
          </div>`;
      }

      return "";
    })
    .join("");

  win.document.write(printShell(data.config.title || "Квиз", rows, withAnswers));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

export function printJeopardy(data: JeopardyData, opts: PrintOptions = {}) {
  const win = window.open("", "_blank");
  if (!win) return;
  const withAnswers = opts.withAnswers !== false;
  const body = data.rounds
    .map(
      (round, ri) => `
      <h2>Раунд ${ri + 1}</h2>
      ${round
        .map(
          (cat) => `
        <h3>${escape(cat.category)}</h3>
        <table><thead><tr><th>Стоимость</th><th>Вопрос</th>${withAnswers ? "<th>Ответ</th>" : ""}</tr></thead>
        <tbody>${cat.questions
          .map(
            (q) => `<tr><td>${q.points}</td><td>${escape(q.q)}</td>${withAnswers ? `<td>${escape(q.a)}</td>` : ""}</tr>`,
          )
          .join("")}</tbody></table>`,
        )
        .join("")}`,
    )
    .join("");
  const finalBlock = `<h2>Финал</h2><p><strong>${escape(data.final.category)}:</strong> ${escape(data.final.q)}</p>${withAnswers ? `<p><em>Ответ: ${escape(data.final.a)}</em></p>` : ""}`;
  win.document.write(printShell("Своя Игра", body + finalBlock, withAnswers));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

export function printMillionaire(data: MillionaireData, opts: PrintOptions = {}) {
  const win = window.open("", "_blank");
  if (!win) return;
  const withAnswers = opts.withAnswers !== false;
  const rows = data.questions
    .map(
      (q, i) => `
    <div class="q">
      <div class="qn">${i + 1}. [${q.money.toLocaleString("ru-RU")} ₽] ${escape(q.q)}</div>
      <ol type="A">${q.options
        .map((o) => `<li${withAnswers && o.correct ? ' style="font-weight:700;color:#0d9488"' : ""}>${escape(o.text)}</li>`)
        .join("")}</ol>
    </div>`,
    )
    .join("");
  win.document.write(printShell("Миллионер", rows, withAnswers));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

function escape(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function printShell(title: string, body: string, withAnswers: boolean) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    body { 
      font-family: 'PT Sans', Arial, sans-serif; 
      color: #1a1a1a; 
      font-size: 11px; 
      line-height: 1.4; 
      max-width: 190mm; 
      margin: 0 auto; 
      padding: 0;
    }
    .no-print { text-align: right; margin-bottom: 8px; }
    .btn-print { 
      padding: 8px 16px; 
      background: #0d9488; 
      color: white; 
      border: none; 
      border-radius: 6px; 
      cursor: pointer; 
      font-size: 13px; 
    }
    .header { 
      text-align: center; 
      margin-bottom: 12px; 
      border-bottom: 2px solid #0d9488; 
      padding-bottom: 8px; 
    }
    .header h1 { margin: 0; font-size: 18px; color: #0d9488; }
    .header .info { 
      margin-top: 6px; 
      display: flex; 
      justify-content: center; 
      gap: 16px; 
      font-size: 11px; 
    }
    .header .info span { 
      border-bottom: 1px solid #ccc; 
      padding: 0 12px; 
      min-width: 100px; 
    }
    .q { 
      margin: 8px 0; 
      padding: 8px 12px; 
      border: 1px solid #e2e8f0; 
      border-radius: 6px; 
      break-inside: avoid; 
      background: #fafafa; 
    }
    .qn { font-weight: 700; margin-bottom: 6px; font-size: 12px; }
    .qn-sub { font-size: 11px; color: #666; margin-bottom: 8px; }
    .choices { display: flex; flex-direction: column; gap: 3px; }
    .choice-row { display: flex; align-items: center; gap: 6px; font-size: 11px; }
    .choice-circle { font-size: 14px; color: #0d9488; }
    .choice-letter { font-weight: 700; min-width: 18px; }
    .text-answer { 
      font-family: 'Courier New', monospace; 
      letter-spacing: 1px; 
      color: #666; 
      margin: 4px 0; 
      font-size: 11px; 
    }
    .matching-columns { display: flex; gap: 24px; }
    .matching-col { flex: 1; }
    .matching-variants { border-left: 1px solid #e2e8f0; padding-left: 16px; }
    .matching-variants-title { font-weight: 700; margin-bottom: 6px; font-size: 11px; }
    .matching-variant { margin: 4px 0; font-size: 11px; }
    .matching-row { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
    .matching-num { min-width: 20px; font-weight: 700; }
    .matching-left { flex: 1; font-size: 11px; }
    .matching-line { flex: 1; border-bottom: 1px dashed #ccc; margin: 0 6px; }
    .ordering-block { display: flex; gap: 16px; }
    .ordering-variants { flex: 1; }
    .ordering-variant { margin: 4px 0; font-size: 11px; }
    .ordering-answers { flex: 1; border-left: 1px solid #e2e8f0; padding-left: 16px; }
    .ordering-row { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
    .ordering-num { min-width: 20px; font-weight: 700; }
    .ordering-line { font-family: 'Courier New', monospace; letter-spacing: 1px; color: #aaa; font-size: 11px; }
    .close-text { font-size: 12px; line-height: 2; }
        .a { 
      color: #0d9488; 
      margin-top: 6px; 
      font-size: 10px; 
      padding: 4px 8px; 
      background: #e6fffa; 
      border-radius: 4px; 
    }
    .footer { 
      text-align: center; 
      margin-top: 16px; 
      padding-top: 8px; 
      border-top: 1px solid #e2e8f0; 
      color: #999; 
      font-size: 9px; 
    }
    @media print { 
      body { padding: 0; } 
      .no-print { display: none; } 
      .a { display: ${withAnswers ? "block" : "none"}; } 
    }
  </style></head><body>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">🖨 Печатать / Сохранить PDF</button>
  </div>
  <div class="header">
    <h1>${escape(title)}</h1>
    <div class="info">
      <span>Имя: ___________</span>
      <span>Дата: ___________</span>
      <span>Класс: ___________</span>
    </div>
  </div>
  ${body}
  <div class="footer">Создано с помощью IslandQuiz</div>
  </body></html>`;
}
