// Teacher's cheat-sheet: all rounds/categories/questions and correct answers.
// Not visible to players. Can be opened at any time in a separate tab.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, FileText } from "lucide-react";
import { loadGame, subscribeRoom, type RoomState } from "@/lib/api";
import { LaTeX } from "@/lib/latex";
import type { JeopardyData, QuizData, MillionaireData, GameKind } from "@/lib/types";
import { formatQuizAnswer } from "@/lib/format-answer";

export const Route = createFileRoute("/room/$code/answers")({
  head: () => ({
    meta: [
      { title: "Ответы — IslandQuiz" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AnswersPage,
});

function AnswersPage() {
  const { code } = Route.useParams();
  const [state, setState] = useState<RoomState | null>(null);
  const [kind, setKind] = useState<GameKind | null>(null);
  const [jeopardy, setJeopardy] = useState<JeopardyData | null>(null);
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [millionaire, setMillionaire] = useState<MillionaireData | null>(null);

  useEffect(() => subscribeRoom(code, setState), [code]);
  useEffect(() => {
    if (!state) return;
    setKind(state.gameKind);
    if (state.gameKind === "jeopardy") {
      loadGame<JeopardyData>("jeopardy", state.gameId).then((r) => r && setJeopardy(r.data));
    } else if (state.gameKind === "quiz") {
      loadGame<QuizData>("quiz", state.gameId).then((r) => r && setQuiz(r.data));
    } else if (state.gameKind === "millionaire") {
      loadGame<MillionaireData>("millionaire", state.gameId).then(
        (r) => r && setMillionaire(r.data),
      );
    }
  }, [state]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center gap-2 rounded-2xl bg-amber-500/10 p-4 text-amber-300">
          <Eye className="h-5 w-5" />
          <div>
            <p className="text-sm font-bold">Только для учителя</p>
            <p className="text-xs opacity-80">
              Не показывайте этот экран игрокам. Комната {code}.
            </p>
          </div>
        </div>

        <h1 className="mb-6 flex items-center gap-2 font-display text-3xl font-black">
          <FileText className="h-7 w-7" /> Ответы
        </h1>

        {!state && <p className="text-slate-400">Загрузка комнаты…</p>}

        {kind === "jeopardy" && jeopardy && <JeopardyAnswers data={jeopardy} />}
        {kind === "quiz" && quiz && <QuizAnswers data={quiz} />}
        {kind === "millionaire" && millionaire && <MillionaireAnswers data={millionaire} />}
      </div>
    </div>
  );
}

function JeopardyAnswers({ data }: { data: JeopardyData }) {
  return (
    <div className="space-y-8">
      {data.rounds.map((round, ri) => (
        <section key={ri}>
          <h2 className="mb-3 font-display text-xl font-bold text-amber-400">
            {data.config.roundTitles?.[ri] ?? `Раунд ${ri + 1}`}
          </h2>
          <div className="space-y-4">
            {round.map((cat, ci) => (
              <div key={ci} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-300">
                  {cat.category || `Категория ${ci + 1}`}
                </p>
                <div className="space-y-3">
                  {cat.questions.map((q, qi) => (
                    <div
                      key={qi}
                      className="flex flex-col gap-1 rounded-xl bg-slate-800/50 p-3 md:flex-row md:items-start md:gap-4"
                    >
                      <span className="shrink-0 rounded-md bg-amber-500/20 px-2 py-0.5 font-mono text-sm font-bold text-amber-300">
                        {q.points}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm">
                          <LaTeX>{q.q}</LaTeX>
                        </p>
                        <p className="mt-1 text-sm font-bold text-emerald-400">
                          → <LaTeX>{q.a}</LaTeX>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {data.final?.q && (
        <section>
          <h2 className="mb-3 font-display text-xl font-bold text-amber-400">Финал</h2>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="mb-2 text-sm uppercase tracking-wide text-slate-400">
              {data.final.category}
            </p>
            <p className="text-sm">
              <LaTeX>{data.final.q}</LaTeX>
            </p>
            <p className="mt-2 text-sm font-bold text-emerald-400">
              → <LaTeX>{data.final.a}</LaTeX>
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function QuizAnswers({ data }: { data: QuizData }) {
  const label: Record<string, string> = {
    choice: "ABCD",
    bool: "Да/Нет",
    text: "Текст",
    matching: "Пары",
    close: "Пропуски",
    ordering: "Порядок",
  };
  return (
    <div className="space-y-3">
      {data.questions.map((q, i) => (
        <div key={q.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Вопрос {i + 1} · {label[q.type] ?? q.type} · {q.points} оч.
          </p>
          <p className="mt-1 text-sm">
            <LaTeX>{q.q}</LaTeX>
          </p>
          <p className="mt-2 text-sm font-bold text-emerald-400">→ {formatQuizAnswer(q)}</p>
        </div>
      ))}
    </div>
  );
}

function MillionaireAnswers({ data }: { data: MillionaireData }) {
  return (
    <div className="space-y-3">
      {data.questions.map((q, i) => {
        const correct = q.options.find((o) => o.correct)?.text ?? "—";
        return (
          <div key={i} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Вопрос {i + 1} · {q.money.toLocaleString("ru-RU")} ₽
            </p>
            <p className="mt-1 text-sm">
              <LaTeX>{q.q}</LaTeX>
            </p>
            <p className="mt-2 text-sm font-bold text-emerald-400">→ {correct}</p>
          </div>
        );
      })}
    </div>
  );
}
