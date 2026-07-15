// Readable formatting for quiz answers used in print / feedback UIs.
import type { QuizQuestion } from "./types";

export function normalizeAnswer(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/,/g, ".")
    .replace(/\s+/g, "");
}

export function formatQuizAnswer(q: QuizQuestion): string {
  if (!q) return "";
  if (q.type === "matching") {
    try {
      const pairs = JSON.parse(q.answer || "[]") as { left: string; right: string }[];
      if (!Array.isArray(pairs)) return q.answer;
      return pairs
        .filter((p) => p && (p.left || p.right))
        .map((p) => `${p.left} → ${p.right}`)
        .join(", ");
    } catch {
      return q.answer;
    }
  }
  if (q.type === "bool") return q.answer === "true" ? "Да" : "Нет";
  if (q.type === "close") {
    try {
      const arr = JSON.parse(q.answer || "[]") as string[];
      if (!Array.isArray(arr)) return q.answer;
      return arr.join(" · ");
    } catch {
      return q.answer;
    }
  }
  if (q.type === "ordering") {
    try {
      const arr = JSON.parse(q.answer || "[]") as string[];
      if (!Array.isArray(arr)) return q.answer;
      return arr.map((s, i) => `${i + 1}. ${s}`).join(" → ");
    } catch {
      return q.answer;
    }
  }
  return q.answer || "";
}

// Форматирование ответа игрока (given), с учётом типа вопроса.
export function formatGivenAnswer(q: QuizQuestion, given: string): string {
  if (!q) return given || "—";
  if (!given) return "—";
  if (q.type === "matching") {
    try {
      const m = JSON.parse(given) as Record<string, string>;
      const entries = Object.entries(m);
      if (!entries.length) return "—";
      return entries.map(([l, r]) => `${l} → ${r}`).join(", ");
    } catch {
      return given;
    }
  }
  if (q.type === "bool") return given === "true" ? "Да" : given === "false" ? "Нет" : given;
  if (q.type === "close") {
    try {
      const arr = JSON.parse(given) as string[];
      if (!Array.isArray(arr) || !arr.length) return "—";
      return arr.map((s) => s || "—").join(" · ");
    } catch {
      return given;
    }
  }
  if (q.type === "ordering") {
    try {
      const arr = JSON.parse(given) as string[];
      if (!Array.isArray(arr) || !arr.length) return "—";
      return arr.map((s, i) => `${i + 1}. ${s}`).join(" → ");
    } catch {
      return given;
    }
  }
  return given;
}

// Проверка ответа игрока — общая логика (используется офлайн и онлайн плеерами).
export function checkQuizAnswerCore(q: QuizQuestion, given: string): boolean {
  if (!q) return false;
  if (q.type === "choice" || q.type === "bool") return given === q.answer;
  if (q.type === "text") {
    const accept = q.answer
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!accept.length) return false;
    const g = normalizeAnswer(given);
    return accept.some((a) => normalizeAnswer(a) === g);
  }
  if (q.type === "matching") {
    try {
      const pairs = JSON.parse(q.answer) as { left: string; right: string }[];
      const givenMap = JSON.parse(given || "{}") as Record<string, string>;
      return pairs.every((p) => givenMap[p.left] === p.right);
    } catch {
      return false;
    }
  }
  if (q.type === "close") {
    try {
      const correct = JSON.parse(q.answer || "[]") as string[];
      const arr = JSON.parse(given || "[]") as string[];
      if (!Array.isArray(correct) || !correct.length) return false;
      return correct.every((c, i) => normalizeAnswer(arr[i] || "") === normalizeAnswer(c));
    } catch {
      return false;
    }
  }
  if (q.type === "ordering") {
    try {
      const correct = JSON.parse(q.answer || "[]") as string[];
      const arr = JSON.parse(given || "[]") as string[];
      if (!Array.isArray(correct) || !correct.length) return false;
      return correct.every((c, i) => arr[i] === c);
    } catch {
      return false;
    }
  }
  return false;
}
