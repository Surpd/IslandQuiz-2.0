import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { PlayerShell, TimerBar } from "@/components/player-shell";
import { Avatar } from "@/components/avatar";
import { LaTeX } from "@/lib/latex";
import { loadGame } from "@/lib/storage";
import { fitOptionSize, fitQuestionSize } from "@/lib/fit-text";
import { useAuth } from "@/hooks/use-auth";
import { saveMillionaireResult, type MillionaireAnswerDetail } from "@/lib/results";
import type { MilestoneMode, MillionaireData, MillionaireQuestion } from "@/lib/types";

export const Route = createFileRoute("/play/millionaire/$id")({
  component: PlayMillionaire,
});

function milestoneIndices(mode: MilestoneMode, total: number): Set<number> {
  if (mode === "none") return new Set();
  if (total <= 0) return new Set();
  if (mode === "classic") return new Set([Math.floor(total / 3) - 1, Math.floor((2 * total) / 3) - 1]);
  return new Set([Math.floor(total / 3) - 1, Math.floor((2 * total) / 3) - 1, total - 1]);
}

function guaranteedMoney(idx: number, questions: MillionaireQuestion[], milestones: Set<number>): number {
  let last = 0;
  for (let i = 0; i < idx; i++) if (milestones.has(i)) last = questions[i].money;
  return last;
}

function PlayMillionaire() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const [data, setData] = useState<MillionaireData | null>(null);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [phase, setPhase] = useState<"start" | "playing" | "won" | "lost">("start");
  const [playerName, setPlayerName] = useState(user?.name ?? "");

  const [fiftyUsed, setFiftyUsed] = useState(false);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(0);
  const startedAtRef = useRef<number>(Date.now());
  const answersRef = useRef<MillionaireAnswerDetail[]>([]);
  const savedRef = useRef(false);

  useEffect(() => {
    const g = loadGame<MillionaireData>("millionaire", id);
    if (g) setData(g.data);
  }, [id]);

  const config = data?.config;
  const questions = data?.questions ?? [];
  const milestones = useMemo(
    () => milestoneIndices(config?.milestones ?? "three", questions.length),
    [config?.milestones, questions.length],
  );

  useEffect(() => {
    if (!config || phase !== "playing" || !questions.length) return;
    setTimeLeft(config.timePerQuestion);
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          setRevealed(true);
          const q = questions[idx];
          if (q) {
            const ci = q.options.findIndex((o) => o.correct);
            answersRef.current.push({
              qIdx: idx,
              money: q.money,
              question: q.q,
              given: "—",
              correctAnswer: `${String.fromCharCode(65 + ci)}. ${q.options[ci]?.text ?? ""}`,
              isCorrect: false,
            });
          }
          setPhase("lost");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [idx, phase, config, questions.length]);

  const current = questions[idx];
  const correctIdxEarly = current ? current.options.findIndex((o) => o.correct) : -1;
  const wonAmount =
    phase === "won"
      ? (questions.at(-1)?.money ?? 0)
      : phase === "lost"
        ? guaranteedMoney(idx, questions, milestones)
        : 0;

  // Сохраняем результат один раз при завершении (объявлено до early return, чтобы порядок хуков не менялся)
  useEffect(() => {
    if (phase === "playing" || phase === "start" || savedRef.current || !questions.length) return;
    savedRef.current = true;
    const reached = answersRef.current.filter((a) => a.isCorrect).length;
    saveMillionaireResult({
      gameId: id,
      playerName: playerName.trim() || user?.name || "Аноним",
      avatar: user?.avatar,
      outcome: phase,

      wonAmount,
      guaranteedAmount: guaranteedMoney(idx, questions, milestones),
      reachedCount: reached,
      totalQuestions: questions.length,
      timeSec: Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
      answers: [...answersRef.current],
    });
  }, [phase, wonAmount, id, idx, user, questions, milestones, playerName]);

  if (!data || !config) {
    return (
      <PlayerShell theme="amber">
        <div className="flex min-h-screen items-center justify-center">
          <p>Игра не найдена</p>
        </div>
      </PlayerShell>
    );
  }

  if (!current) {
    return (
      <PlayerShell theme={config.theme}>
        <div className="flex min-h-screen items-center justify-center">
          <p>Нет вопросов</p>
        </div>
      </PlayerShell>
    );
  }


  const correctIdx = current.options.findIndex((o) => o.correct);

  const pickOption = (oi: number) => {
    if (revealed) return;
    setSelected(oi);
    setTimeout(() => {
      setRevealed(true);
      const isCorrect = oi === correctIdx;
      answersRef.current.push({
        qIdx: idx,
        money: current.money,
        question: current.q,
        given: `${String.fromCharCode(65 + oi)}. ${current.options[oi]?.text ?? ""}`,
        correctAnswer: `${String.fromCharCode(65 + correctIdx)}. ${current.options[correctIdx]?.text ?? ""}`,
        isCorrect,
      });
      setTimeout(() => {
        if (isCorrect) {
          if (idx + 1 >= questions.length) setPhase("won");
          else {
            setIdx(idx + 1);
            setSelected(null);
            setRevealed(false);
            setHidden(new Set());
          }
        } else {
          setPhase("lost");
        }
      }, 1600);
    }, 800);
  };

  const useFifty = () => {
    if (fiftyUsed || revealed) return;
    const wrongs = current.options.map((_, i) => i).filter((i) => i !== correctIdx);
    const shuffled = wrongs.sort(() => Math.random() - 0.5);
    setHidden(new Set(shuffled.slice(0, 2)));
    setFiftyUsed(true);
  };

  const restart = () => {
    setIdx(0);
    setSelected(null);
    setRevealed(false);
    setPhase("playing");
    setFiftyUsed(false);
    setHidden(new Set());
    answersRef.current = [];
    savedRef.current = false;
    startedAtRef.current = Date.now();
  };

  void correctIdxEarly;


  return (
    <PlayerShell theme={config.theme}>
      {user && (
        <div className="fixed left-4 top-4 z-40 flex items-center gap-2 rounded-full border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] px-3 py-1.5 backdrop-blur-md">
          <Avatar name={user.name} avatar={user.avatar} size={26} />
          <span className="text-sm font-semibold">{user.name}</span>
        </div>
      )}
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center gap-6 px-3 py-16 sm:px-4 lg:pr-56">
        <div className="min-w-0 flex-1">
          {phase === "start" && (
            <div className="mx-auto max-w-lg animate-fade-up rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-6 text-center backdrop-blur-md sm:p-10">
              <h1 className="font-display text-2xl font-black sm:text-3xl">{config.title || "Кто хочет стать миллионером"}</h1>

              <p className="mt-2 text-[color:var(--pt-text-muted)]">Вопросов: {questions.length}</p>
              {user && (
                <div className="mt-6 flex justify-center">
                  <Avatar name={user.name} avatar={user.avatar} size={72} />
                </div>
              )}
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Ваше имя"
                maxLength={40}
                className="mt-6 w-full rounded-xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-4 py-3 text-center text-lg font-semibold outline-none focus:border-[color:var(--pt-accent)]"
              />
              <button
                onClick={() => {
                  startedAtRef.current = Date.now();
                  setPhase("playing");
                }}
                disabled={!playerName.trim()}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[color:var(--pt-accent)] px-8 py-3 font-bold text-black transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
              >
                Начать
              </button>
            </div>
          )}
          {phase === "playing" && (

            <>
              <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-widest text-[color:var(--pt-text-muted)]">
                <span>
                  Вопрос {idx + 1} из {questions.length}
                </span>
                <span>{timeLeft}с</span>
              </div>
              <TimerBar pct={(timeLeft / config.timePerQuestion) * 100} urgent={timeLeft <= 5} />

              <div className="mt-6 flex gap-2">
                <button
                  onClick={useFifty}
                  disabled={fiftyUsed}
                  className={`rounded-full border border-[color:var(--pt-border)] px-4 py-2 text-sm font-bold transition-all ${
                    fiftyUsed
                      ? "opacity-30"
                      : "bg-[color:var(--pt-surface-strong)] text-[color:var(--pt-accent)] hover:scale-105"
                  }`}
                >
                  <Sparkles className="mr-1.5 inline-block h-4 w-4" /> 50 : 50
                </button>
              </div>

              {current.image && (
                <img src={current.image} alt="" className="mx-auto mt-6 max-h-56 rounded-xl object-contain" />
              )}
              <div
                className={`mt-6 rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-8 text-center font-semibold backdrop-blur-md ${fitQuestionSize(current.q)}`}
              >
                <LaTeX>{current.q}</LaTeX>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {current.options.map((opt, oi) => {
                  const isSelected = selected === oi;
                  const isCorrect = revealed && oi === correctIdx;
                  const isWrong = revealed && isSelected && oi !== correctIdx;
                  const isHidden = hidden.has(oi);
                  return (
                    <button
                      key={oi}
                      disabled={isHidden || revealed}
                      onClick={() => pickOption(oi)}
                      className={`flex items-center gap-3 rounded-2xl border-2 px-5 py-5 text-left transition-all ${
                        isHidden
                          ? "invisible"
                          : isCorrect
                            ? "border-success bg-success/25"
                            : isWrong
                              ? "border-danger bg-danger/25"
                              : isSelected
                                ? "border-[color:var(--pt-accent)] bg-[color:var(--pt-surface-strong)]"
                                : "border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] hover:border-[color:var(--pt-accent)]"
                      }`}
                    >
                      <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-[color:var(--pt-accent)] font-bold text-black">
                        {String.fromCharCode(65 + oi)}
                      </span>
                      <span className={`min-w-0 break-words ${fitOptionSize(opt.text)}`}>
                        <LaTeX>{opt.text}</LaTeX>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {(phase === "won" || phase === "lost") && (
            <div className="mx-auto max-w-lg animate-fade-up rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-10 text-center backdrop-blur-md">
              <h1 className="font-display text-4xl font-black">
                {phase === "won" ? "🎉 Поздравляем!" : "😞 Игра окончена"}
              </h1>
              <p className="mt-2 text-[color:var(--pt-text-muted)]">
                {phase === "won" ? "Вы прошли всю лестницу!" : "Ваш выигрыш:"}
              </p>
              <div className="my-6 font-display text-5xl font-black text-[color:var(--pt-accent)]">
                {wonAmount.toLocaleString("ru-RU")} ₽
              </div>
              <button
                onClick={restart}
                className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--pt-accent)] px-6 py-3 font-bold text-black hover:scale-[1.02]"
              >
                <RefreshCw className="h-4 w-4" /> Играть снова
              </button>
            </div>
          )}
        </div>

        {/* Money ladder */}
        <aside className="fixed top-1/2 right-4 hidden -translate-y-1/2 flex-col-reverse gap-1.5 lg:flex">
          {questions.map((q, i) => {
            const isCurrent = i === idx && phase === "playing";
            const isPassed = i < idx || phase === "won";
            const isMilestone = milestones.has(i);
            return (
              <div
                key={i}
                className={`rounded-full px-4 py-1.5 text-right text-sm font-bold transition-all ${
                  isCurrent
                    ? "scale-110 bg-[color:var(--pt-accent)] text-black shadow-[var(--pt-glow)]"
                    : isPassed
                      ? "bg-[color:var(--pt-surface-strong)] text-[color:var(--pt-accent-2)]"
                      : "bg-[color:var(--pt-surface)] text-[color:var(--pt-text-muted)]"
                } ${isMilestone ? "ring-1 ring-[color:var(--pt-accent-2)]" : ""}`}
              >
                {q.money.toLocaleString("ru-RU")}
              </div>
            );
          })}
        </aside>
      </div>
    </PlayerShell>
  );
}
