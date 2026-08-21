import type { QuizQuestion } from "@/lib/types";
import { formatAnswerFallback, formatGivenAnswer, formatQuizAnswer } from "@/lib/format-answer";

export function QuizAnswerDisplay({
  question,
  value,
  kind = "correct",
  fallback,
  className = "",
}: {
  question?: QuizQuestion;
  value?: string;
  kind?: "correct" | "given";
  fallback?: string;
  className?: string;
}) {
  const text = question
    ? kind === "given"
      ? formatGivenAnswer(question, value ?? "")
      : formatQuizAnswer(question)
    : formatAnswerFallback(fallback || value || "");

  return (
    <span className={`whitespace-pre-line break-words ${className}`} style={{ overflowWrap: "anywhere" }}>
      {text || "—"}
    </span>
  );
}
