// PlayerV2 — «Glassmorphic Aurora».
// Визуальный стиль: воздушные стеклянные панели с backdrop-blur, крупные
// радиальные градиенты-«орбы» на фоне, мягкие скругления 2xl-3xl,
// тонкие светящиеся бордеры. Таймер — круговой прогресс SVG сверху
// справа. Прогресс вопросов — тонкие светящиеся точки. Экран
// результатов — большая стеклянная плита с сияющим числом. Работает со
// всеми 5 темами: орбы и подсветка идут через --pt-accent.

import { useEffect, useRef, useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { PlayerShell } from "@/components/player-shell";
import { QuizQuestionCard, checkQuizAnswer } from "@/components/quiz-question-card";
import type { QuizData } from "@/lib/types";

interface Ans { qId: string; correct: boolean; earned: number; points: number }

export function PlayerV2({ data }: { data: QuizData }) {
  const { config, questions } = data;
  const [phase, setPhase] = useState<"start" | "play" | "done">("start");
  const [name, setName] = useState("");
  const [idx, setIdx] = useState(0);
  const [cur, setCur] = useState("");
  const [answers, setAnswers] = useState<Ans[]>([]);
  const [reveal, setReveal] = useState(false);
  const [time, setTime] = useState(0);
  const startedAt = useRef(0);

  useEffect(() => {
    if (phase !== "play") return;
    const q = questions[idx];
    setTime(q.time || config.defaultTime);
    const t = setInterval(() => {
      setTime((p) => {
        if (p <= 1) { clearInterval(t); submit(true); return 0; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx]);

  const submit = (timeout = false) => {
    const q = questions[idx];
    const ok = timeout ? false : checkQuizAnswer(q, cur);
    const next = [...answers, { qId: q.id, correct: ok, earned: ok ? q.points : 0, points: q.points }];
    setAnswers(next); setReveal(true);
    setTimeout(() => {
      setReveal(false); setCur("");
      if (idx + 1 >= questions.length) setPhase("done");
      else setIdx(idx + 1);
    }, 1200);
  };

  const start = () => {
    setAnswers([]); setIdx(0); setCur(""); setReveal(false);
    startedAt.current = Date.now(); setPhase("play");
  };

  const totalPts = questions.reduce((s, q) => s + q.points, 0);
  const earned = answers.reduce((s, a) => s + a.earned, 0);
  const correct = answers.filter((a) => a.correct).length;
  const totalTime = questions[idx]?.time || config.defaultTime;

  return (
    <PlayerShell theme={config.theme}>
      {/* Aurora orbs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -left-32 top-10 h-96 w-96 rounded-full opacity-40 blur-3xl"
             style={{ background: "radial-gradient(circle, var(--pt-accent), transparent 60%)" }} />
        <div className="absolute right-0 top-1/2 h-[28rem] w-[28rem] rounded-full opacity-30 blur-3xl"
             style={{ background: "radial-gradient(circle, var(--pt-accent), transparent 60%)" }} />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4 py-10">
        {phase === "start" && (
          <div className="rounded-3xl border border-white/15 bg-white/5 p-10 text-center shadow-2xl backdrop-blur-2xl">
            <Sparkles className="mx-auto mb-3 h-10 w-10 text-[color:var(--pt-accent)]" />
            <h1 className="font-display text-4xl font-black tracking-tight">{config.title}</h1>
            {config.description && (
              <p className="mt-3 text-[color:var(--pt-text-muted)]">{config.description}</p>
            )}
            <p className="mt-4 text-xs uppercase tracking-[0.3em] text-[color:var(--pt-text-muted)]">
              {questions.length} вопросов
            </p>
            <input
              value={name} onChange={(e) => setName(e.target.value)} placeholder="Ваше имя"
              className="mx-auto mt-6 block w-full max-w-sm rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-center text-lg outline-none backdrop-blur placeholder:text-[color:var(--pt-text-muted)] focus:border-[color:var(--pt-accent)]"
            />
            <button
              onClick={start}
              className="mt-5 rounded-full bg-[color:var(--pt-accent)] px-10 py-3 font-bold text-black shadow-[0_10px_40px_-10px_var(--pt-accent)] transition hover:scale-[1.03]"
            >
              Начать →
            </button>
          </div>
        )}

        {phase === "play" && questions[idx] && (
          <>
            <div className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/5 px-5 py-3 backdrop-blur-xl">
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-[color:var(--pt-text-muted)]">Вопрос</div>
                <div className="font-display text-xl font-black">{idx + 1} <span className="text-[color:var(--pt-text-muted)]">/ {questions.length}</span></div>
              </div>
              <RingTimer value={time} total={totalTime} />
            </div>

            <div className="flex justify-center gap-1.5">
              {questions.map((_, i) => {
                const a = answers[i];
                return (
                  <span key={i}
                        className={`h-1.5 rounded-full transition-all ${i === idx ? "w-8 bg-[color:var(--pt-accent)]" : a ? a.correct ? "w-2 bg-success" : "w-2 bg-danger" : "w-2 bg-white/20"}`} />
                );
              })}
            </div>

            <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl">
              <QuizQuestionCard question={questions[idx]} value={cur} onChange={setCur} reveal={reveal} locked={reveal} />
            </div>

            <button
              disabled={reveal} onClick={() => submit(false)}
              className="self-end rounded-full bg-[color:var(--pt-accent)] px-10 py-3 font-bold text-black shadow-[0_10px_40px_-10px_var(--pt-accent)] transition hover:scale-[1.03] disabled:opacity-40"
            >
              Ответить
            </button>
          </>
        )}

        {phase === "done" && (
          <div className="rounded-3xl border border-white/15 bg-white/5 p-12 text-center backdrop-blur-2xl">
            <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--pt-text-muted)]">
              {name || "Игрок"} · итог
            </div>
            <div className="my-6 font-display text-8xl font-black leading-none"
                 style={{ color: "var(--pt-accent)", textShadow: "0 0 60px var(--pt-accent)" }}>
              {correct}
              <span className="text-4xl text-[color:var(--pt-text-muted)]">/{questions.length}</span>
            </div>
            <div className="mx-auto h-2 max-w-xs overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[color:var(--pt-accent)]"
                   style={{ width: `${(earned / Math.max(totalPts, 1)) * 100}%` }} />
            </div>
            <p className="mt-3 text-sm text-[color:var(--pt-text-muted)]">{earned} из {totalPts} баллов</p>
            <button onClick={() => setPhase("start")}
                    className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 font-semibold backdrop-blur hover:bg-white/10">
              <RefreshCw className="h-4 w-4" /> Пройти ещё раз
            </button>
          </div>
        )}
      </div>
    </PlayerShell>
  );
}

function RingTimer({ value, total }: { value: number; total: number }) {
  const r = 20; const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / Math.max(total, 1)));
  return (
    <div className="relative grid h-14 w-14 place-items-center">
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
        <circle cx="24" cy="24" r={r} fill="none" stroke="var(--pt-accent)" strokeWidth="4"
                strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
                style={{ transition: "stroke-dashoffset 1s linear" }} />
      </svg>
      <span className="relative text-sm font-black">{value}</span>
    </div>
  );
}
