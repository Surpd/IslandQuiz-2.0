// Renders a summary + optional detailed content of a game.
// Detailed answers are only shown when `withAnswers` is true.

import type {
  GameKind,
  JeopardyData,
  MillionaireData,
  QuizData,
  StoredGame,
} from "@/lib/types";
import { quizQuestionTypeLabel } from "@/lib/format-answer";
import { QuizAnswerDisplay } from "@/components/quiz-answer-display";

export function gameSummary(g: StoredGame): string {
  if (g.kind === "quiz") {
    const d = g.data as QuizData;
    const n = d?.questions?.length ?? 0;
    const types = new Set((d?.questions ?? []).map((q) => q.type));
    const labels = Array.from(types)
      .map((t) => quizQuestionTypeLabel(t))
      .join(", ");
    return `${n} ${plural(n, "вопрос", "вопроса", "вопросов")}${labels ? ` (${labels})` : ""}`;
  }
  if (g.kind === "jeopardy") {
    const d = g.data as JeopardyData;
    const rounds = d?.rounds?.length ?? 0;
    const cats = d?.rounds?.[0]?.length ?? 0;
    return `${rounds} ${plural(rounds, "раунд", "раунда", "раундов")} · ${cats} ${plural(cats, "категория", "категории", "категорий")}`;
  }
  const d = g.data as MillionaireData;
  const n = d?.questions?.length ?? 0;
  return `${n} ${plural(n, "вопрос", "вопроса", "вопросов")}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function GameContent({
  game,
  withAnswers,
}: {
  game: StoredGame;
  withAnswers: boolean;
}) {
  if (game.kind === "quiz") return <QuizContent data={game.data as QuizData} withAnswers={withAnswers} />;
  if (game.kind === "jeopardy") return <JeopardyContent data={game.data as JeopardyData} withAnswers={withAnswers} />;
  return <MillionaireContent data={game.data as MillionaireData} withAnswers={withAnswers} />;
}

function QuizContent({ data, withAnswers }: { data: QuizData; withAnswers: boolean }) {
  return (
    <ol className="flex flex-col gap-2">
      {data.questions.map((q, i) => (
        <li key={q.id ?? i} data-quiz-question={q.type} className="rounded-xl border border-border bg-surface p-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{q.q || <em className="text-muted-foreground">без текста</em>}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                {quizQuestionTypeLabel(q.type)} · {q.points} б · {q.time}с
              </p>
              {q.options.length > 0 && (
                <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  {q.options.map((option) => (
                    <li
                      key={option}
                      data-quiz-option={option}
                      data-quiz-correct={withAnswers && q.type === "choice" && option === q.answer ? "true" : undefined}
                      className={`break-words rounded-md bg-surface-muted px-2 py-1 ${withAnswers && q.type === "choice" && option === q.answer ? "font-semibold text-success ring-1 ring-success/30" : ""}`}
                    >
                      {withAnswers && q.type === "choice" && option === q.answer && <span aria-hidden="true">✓ </span>}
                      {option}
                    </li>
                  ))}
                </ul>
              )}
              {withAnswers && (
                <div data-quiz-answer={q.type} className="mt-2 rounded-lg bg-success-soft/60 px-2 py-1.5 text-xs text-success">
                  <span className="font-semibold">Правильный ответ:</span>{" "}
                  <QuizAnswerDisplay question={q} className="font-semibold" />
                </div>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function JeopardyContent({ data, withAnswers }: { data: JeopardyData; withAnswers: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {data.rounds.map((round, ri) => (
        <div key={ri}>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Раунд {ri + 1}
          </p>
          <div className="grid gap-2">
            {round.map((cat, ci) => (
              <div key={ci} className="rounded-xl border border-border bg-surface p-3">
                <p className="font-display text-sm font-bold">{cat.category || "Без названия"}</p>
                <ul className="mt-1.5 flex flex-col gap-1 text-xs">
                  {cat.questions.map((q, qi) => (
                    <li key={qi} className="flex gap-2">
                      <b className="text-primary">{q.points}</b>
                      <span className="min-w-0 flex-1 break-words">{q.q || "—"}{withAnswers && <span className="text-success"> → {q.a || "—"}</span>}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
      {data.final && (
        <div className="rounded-xl border border-amber/30 bg-amber-soft p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-amber">Финал</p>
          <p className="mt-1 text-sm font-semibold">{data.final.category}</p>
          <p className="mt-1 text-xs">{data.final.q}</p>
          {withAnswers && <p className="mt-1 break-words text-xs text-success">Ответ: <b>{data.final.a}</b></p>}
        </div>
      )}
    </div>
  );
}

function MillionaireContent({ data, withAnswers }: { data: MillionaireData; withAnswers: boolean }) {
  return (
    <ol className="flex flex-col gap-2">
      {data.questions.map((q, i) => {
        const correct = q.options.find((o) => o.correct);
        return (
          <li key={i} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-success-soft text-xs font-bold text-success">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{q.q || <em className="text-muted-foreground">без текста</em>}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {q.money.toLocaleString("ru-RU")}
                </p>
                <ol className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  {q.options.map((option) => (
                    <li key={option.text} className={`break-words rounded-md bg-surface-muted px-2 py-1 ${withAnswers && option.correct ? "font-semibold text-success" : ""}`}>
                      {option.text}
                    </li>
                  ))}
                </ol>
                {withAnswers && correct && (
                  <p className="mt-1 break-words text-xs text-success">Ответ: <b>{correct.text}</b></p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function summaryOf(g: StoredGame, kind: GameKind): string {
  void kind;
  return gameSummary(g);
}
