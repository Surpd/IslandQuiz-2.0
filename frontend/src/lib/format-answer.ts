// Readable formatting for quiz answers used in print / feedback UIs.
import type { QuizQuestion, QuizQuestionType } from "./types";

export const QUIZ_QUESTION_TYPE_LABELS: Record<QuizQuestionType, string> = {
  choice: "Выбор ответа",
  bool: "Да/Нет",
  text: "Текст",
  matching: "Сопоставление",
  ordering: "Порядок",
  close: "Пропуски",
};

export function quizQuestionTypeLabel(type: string): string {
  return QUIZ_QUESTION_TYPE_LABELS[type as QuizQuestionType] ?? "Вопрос";
}

export function normalizeAnswer(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/,/g, ".")
    .replace(/\s+/g, "");
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function safeFallback(raw: string, complex: boolean): string {
  const value = textValue(raw);
  if (!value) return "—";
  return complex && (value.startsWith("[") || value.startsWith("{")) ? "Ответ недоступен" : value;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function formatMatching(raw: string): string {
  const parsed = parseJson(raw);
  const pairs: { left: string; right: string }[] = [];
  if (Array.isArray(parsed)) {
    parsed.forEach((item) => {
      if (item && typeof item === "object") {
        const pair = item as { left?: unknown; right?: unknown };
        const left = textValue(pair.left);
        const right = textValue(pair.right);
        if (left || right) pairs.push({ left, right });
      }
    });
  } else if (parsed && typeof parsed === "object") {
    Object.entries(parsed as Record<string, unknown>).forEach(([left, right]) => {
      const rightText = textValue(right);
      if (left || rightText) pairs.push({ left: textValue(left), right: rightText });
    });
  }
  if (pairs.length) return pairs.map((pair) => `${pair.left || "—"} → ${pair.right || "—"}`).join("\n");
  if (raw.includes("→")) {
    return raw
      .split(/\s*,\s*|\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");
  }
  return safeFallback(raw, true);
}

function formatList(raw: string, numbered: boolean): string {
  const parsed = parseJson(raw);
  if (Array.isArray(parsed)) {
    const values = parsed.map(textValue).filter(Boolean);
    if (values.length) {
      return numbered ? values.map((value, i) => `${i + 1}. ${value}`).join("\n") : values.map((value, i) => `${i + 1}. ${value}`).join("\n");
    }
  }
  const fallback = safeFallback(raw, true);
  if (numbered && fallback.includes(" · ") && !fallback.includes("\n")) {
    return fallback.split(" · ").map((value, i) => `${i + 1}. ${value}`).join("\n");
  }
  return fallback;
}

function formatTextAnswers(raw: string): string {
  const values = raw.split(",").map((value) => value.trim()).filter(Boolean);
  return [...new Set(values)].join(" · ") || "—";
}

export function formatAnswerFallback(raw: string): string {
  const value = textValue(raw);
  const lower = value.toLowerCase();
  if (lower === "true" || lower === "да") return "Да";
  if (lower === "false" || lower === "нет") return "Нет";
  const parsed = parseJson(value);
  if (Array.isArray(parsed)) {
    if (parsed.some((item) => item && typeof item === "object" && ("left" in item || "right" in item))) {
      return formatMatching(value);
    }
    const strings = parsed.map(textValue).filter(Boolean);
    if (strings.length) return strings.map((item, i) => `${i + 1}. ${item}`).join("\n");
  }
  if (parsed && typeof parsed === "object") return formatMatching(value);
  return safeFallback(value, true);
}

export function formatQuizAnswerValue(type: QuizQuestionType, raw: string): string {
  if (type === "bool") {
    const value = textValue(raw).toLowerCase();
    return value === "true" || value === "да" ? "Да" : value === "false" || value === "нет" ? "Нет" : safeFallback(raw, false);
  }
  if (type === "text") return formatTextAnswers(textValue(raw));
  if (type === "matching") return formatMatching(raw);
  if (type === "ordering") return formatList(raw, true);
  if (type === "close") return formatList(raw, true);
  return textValue(raw) || "—";
}

export function formatQuizAnswer(q: QuizQuestion): string {
  return q ? formatQuizAnswerValue(q.type, q.answer) : "—";
}

// Форматирование ответа игрока (given), с учётом типа вопроса.
export function formatGivenAnswer(q: QuizQuestion, given: string): string {
  return q ? formatQuizAnswerValue(q.type, given || "") : textValue(given) || "—";
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
