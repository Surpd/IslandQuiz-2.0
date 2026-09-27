// Teacher's cheat-sheet: all rounds/categories/questions and correct answers.
// Not visible to players. Can be opened at any time in a separate tab.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, Eye, FileText } from "lucide-react";
import { getRoomAnswersUrl, subscribeRoom, subscribeRoomSnapshot, type RoomState } from "@/lib/api";
import { QrCode } from "@/components/qr-code";
import { LaTeX } from "@/lib/latex";
import type { JeopardyData, QuizData, MillionaireData, GameKind } from "@/lib/types";
import { quizQuestionTypeLabel } from "@/lib/format-answer";
import { QuizAnswerDisplay } from "@/components/quiz-answer-display";

export const Route = createFileRoute("/room/$code/answers")({
  validateSearch: (search: Record<string, unknown>) => ({
    credential: typeof search.credential === "string" ? search.credential : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Ответы — IslandQuiz" },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: AnswersPage,
});

function AnswersPage() {
  const { code } = Route.useParams();
  const { credential } = Route.useSearch();
  const [state, setState] = useState<RoomState | null>(null);
  const [kind, setKind] = useState<GameKind | null>(null);
  const [jeopardy, setJeopardy] = useState<JeopardyData | null>(null);
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [millionaire, setMillionaire] = useState<MillionaireData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsubscribeState = subscribeRoom(code, setState, credential);
    const unsubscribeSnapshot = subscribeRoomSnapshot(code, (snapshot) => {
      if (snapshot.kind === "quiz") setQuiz(snapshot.data as QuizData);
      if (snapshot.kind === "jeopardy") setJeopardy(snapshot.data as JeopardyData);
      if (snapshot.kind === "millionaire") setMillionaire(snapshot.data as MillionaireData);
    }, credential);
    return () => {
      unsubscribeState();
      unsubscribeSnapshot();
    };
  }, [code, credential]);
  useEffect(() => {
    if (!state) return;
    setKind(state.gameKind);
  }, [state]);

  const answersUrl = getRoomAnswersUrl(code, credential);
  const qrLabel = "QR-код для открытия ответов на другом устройстве";
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(answersUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

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

        <section className="mb-8 grid gap-5 rounded-2xl border border-amber-500/30 bg-slate-900/70 p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:p-5">
          <div className="flex justify-center">
            <div className="h-64 w-64 rounded-xl bg-white p-2"><QrCode value={answersUrl} label={qrLabel} /></div>
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-amber-300">Открыть на другом устройстве</p>
            <p className="mt-1 text-sm text-slate-400">Сканируйте QR-код или скопируйте ссылку — откроется этот же экран ответов.</p>
            <p className="mt-3 break-all rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-slate-300">{answersUrl}</p>
            <button type="button" onClick={copyLink} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-300">
              <Copy className="h-4 w-4" /> {copied ? "Ссылка скопирована" : "Копировать ссылку"}
            </button>
          </div>
        </section>

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
  return (
    <div className="space-y-3">
      {data.questions.map((q, i) => (
        <div key={q.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Вопрос {i + 1} · {quizQuestionTypeLabel(q.type)} · {q.points} оч.
          </p>
          <p className="mt-1 text-sm">
            <LaTeX>{q.q}</LaTeX>
          </p>
          <p className="mt-2 break-words text-sm font-bold text-emerald-400">→ <QuizAnswerDisplay question={q} /></p>
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
