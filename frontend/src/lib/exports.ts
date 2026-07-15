// Export helpers — Excel (xlsx) is primary; browser print for PDF.

import * as XLSX from "xlsx";
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
  const wb = XLSX.utils.book_new();
  let rows: Record<string, string | number>[] = [];
  let name = "template";
  if (kind === "quiz") {
    name = "quiz-template";
    rows = [
      { type: "choice", question: "Столица Франции?", options: "Париж|Лондон|Берлин|Мадрид", answer: "Париж", points: 100, time: 30 },
      { type: "bool", question: "Вода мокрая?", options: "", answer: "true", points: 50, time: 20 },
      { type: "text", question: "Что такое H2O?", options: "", answer: "вода", points: 100, time: 30 },
      { type: "close", question: "Столица Франции — ___, Германии — ___", options: "", answer: "Париж | Берлин", points: 100, time: 30 },
      { type: "ordering", question: "Расставьте по возрастанию:", options: "", answer: "Один | Два | Три", points: 100, time: 30 },
    ];
  } else if (kind === "jeopardy") {
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
  return XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "", raw: false });
}

export async function importQuizXlsx(file: File, defaultTime: number): Promise<QuizQuestion[]> {
  const rows = await readXlsx(file);
  return rows.map((r) => {
    const type = ((r.type ?? "choice") as QuizQuestionType) || "choice";
    const opts = r.options ? String(r.options).split("|").map((s) => s.trim()) : [];
    let answer = String(r.answer ?? "");
    if (type === "close" || type === "ordering") {
      // Answer stored as JSON array; accept "a | b | c" or JSON.
      let arr: string[] = [];
      if (answer.trim().startsWith("[")) {
        try {
          const parsed = JSON.parse(answer);
          if (Array.isArray(parsed)) arr = parsed.map((x) => String(x ?? ""));
        } catch {
          arr = [];
        }
      } else {
        arr = answer.split("|").map((s) => s.trim()).filter(Boolean);
      }
      answer = JSON.stringify(arr);
    }
    return {
      id: newId(),
      type,
      q: String(r.question ?? ""),
      image: "",
      options: type === "choice" ? (opts.length ? opts : ["", "", "", ""]) : [],
      answer,
      points: parseInt(String(r.points ?? "100")) || 100,
      time: parseInt(String(r.time ?? defaultTime)) || defaultTime,
    };
  });
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
    .map(
      (q, i) => `
      <div class="q">
        <div class="qn">${i + 1}. ${escape(q.q)}</div>
        ${q.options.length ? `<ul>${q.options.map((o) => `<li>${escape(o)}</li>`).join("")}</ul>` : ""}
        ${withAnswers ? `<div class="a"><strong>Ответ:</strong> ${escape(formatQuizAnswer(q))}</div>` : ""}
      </div>`,
    )
    .join("");
  win.document.write(printShell(data.config.title || "Квиз", rows));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
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
  win.document.write(printShell("Своя Игра", body + finalBlock));
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
  win.document.write(printShell("Миллионер", rows));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

function escape(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function printShell(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; color:#0f172a; padding:32px; max-width:900px; margin:0 auto; }
    h1 { border-bottom: 2px solid #0d9488; padding-bottom: 8px; }
    h2 { margin-top: 28px; color: #0d9488; }
    .q { margin: 16px 0; padding: 14px; border: 1px solid #e2e8f0; border-radius: 12px; break-inside: avoid; }
    .qn { font-weight: 700; margin-bottom: 8px; }
    .a { color: #0d9488; margin-top: 8px; font-size: 0.9rem; }
    table { width:100%; border-collapse: collapse; margin: 12px 0; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; font-size: 0.9rem; }
    th { background: #f1f5f9; }
    @media print { body { padding: 0; } }
  </style></head><body><h1>${escape(title)}</h1>${body}</body></html>`;
}
