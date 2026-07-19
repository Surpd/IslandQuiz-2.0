// PlayerV1 — «Neo-Brutalist Arcade».
// Визуальный стиль: жирные чёрные бордеры 3-4px, offset-тени в стиле неоновой
// поп-графики, UPPERCASE-типографика, крупные блочные плашки, цветные
// «стикеры» вместо мягких карточек. Таймер — толстая полоса с зубчатым
// прогрессом, номер вопроса — гигантский «ярлык» слева. Экран результатов
// — «сертификат» с печатью в углу. Работает со всеми 5 темами через
// --pt-accent (акцент подставляется в бордер-цвет и штампы).

import { useEffect, useMemo, useRef, useState } from "react";
import { Trophy, Timer, RefreshCw } from "lucide-react";
import { PlayerShell } from "@/components/player-shell";
import { QuizQuestionCard, checkQuizAnswer } from "@/components/quiz-question-card";
import { formatQuizAnswer, formatGivenAnswer } from "@/lib/format-answer";
import type { QuizData } from "@/lib/types";

interface Ans { qId: string; correct: boolean; earned: number; points: number }

export function PlayerV1({ data }: { data: QuizData }) {
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
    setAnswers(next);
    setReveal(true);
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

  return (
    <PlayerShell theme={config.theme}>
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4 py-10">
        {phase === "start" && (
          <div className="border-4 border-[color:var(--pt-text)] bg-[color:var(--pt-surface)] p-8 shadow-[8px_8px_0_0_var(--pt-accent)]">
            <div className="mb-3 inline-block border-4 border-[color:var(--pt-text)] bg-[color:var(--pt-accent)] px-3 py-1 text-xs font-black uppercase tracking-widest text-black">
              Quiz · v1
            </div>
            <h1 className="font-display text-4xl font-black uppercase leading-none">{config.title}</h1>
            {config.description && <p className="mt-2 text-[color:var(--pt-text-muted)]">{config.description}</p>}
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="ВАШЕ ИМЯ"
              className="mt-6 w-full border-4 border-[color:var(--pt-text)] bg-[color:var(--pt-surface-strong)] px-4 py-3 font-bold uppercase tracking-wide outline-none placeholder:text-[color:var(--pt-text-muted)]"
            />
            <button
              onClick={start}
              className="mt-4 w-full border-4 border-[color:var(--pt-text)] bg-[color:var(--pt-accent)] py-4 font-black uppercase tracking-widest text-black shadow-[6px_6px_0_0_var(--pt-text)] transition-transform hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[8px_8px_0_0_var(--pt-text)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_0_var(--pt-text)]"
            >
              ▶ Погнали
            </button>
          </div>
        )}

        {phase === "play" && questions[idx] && (
          <>
            <div className="flex items-stretch gap-3">
              <div className="grid place-items-center border-4 border-[color:var(--pt-text)] bg-[color:var(--pt-accent)] px-5 font-display text-3xl font-black text-black shadow-[4px_4px_0_0_var(--pt-text)]">
                {String(idx + 1).padStart(2, "0")}
              </div>
              <div className="flex-1 border-4 border-[color:var(--pt-text)] bg-[color:var(--pt-surface)] p-3 shadow-[4px_4px_0_0_var(--pt-text)]">
                <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                  <span>Вопрос {idx + 1}/{questions.length}</span>
                  <span className="inline-flex items-center gap-1"><Timer className="h-3 w-3" />{time}s</span>
                </div>
                <ChunkyBar pct={(time / (questions[idx].time || config.defaultTime)) * 100} />
              </div>
            </div>

            <div className="border-4 border-[color:var(--pt-text)] shadow-[6px_6px_0_0_var(--pt-accent)]">
              <QuizQuestionCard
                question={questions[idx]} value={cur} onChange={setCur}
                reveal={reveal} locked={reveal}
              />
            </div>

            <button
              disabled={reveal}
              onClick={() => submit(false)}
              className="self-end border-4 border-[color:var(--pt-text)] bg-[color:var(--pt-accent)] px-8 py-3 font-black uppercase tracking-widest text-black shadow-[4px_4px_0_0_var(--pt-text)] disabled:opacity-40"
            >
              Ответить →
            </button>
          </>
        )}

        {phase === "done" && (
          <div className="relative border-4 border-[color:var(--pt-text)] bg-[color:var(--pt-surface)] p-10 text-center shadow-[10px_10px_0_0_var(--pt-accent)]">
            <div className="absolute -right-3 -top-3 grid h-20 w-20 rotate-12 place-items-center rounded-full border-4 border-[color:var(--pt-text)] bg-[color:var(--pt-accent)] font-display text-xs font-black uppercase text-black">
              Готово
            </div>
            <Trophy className="mx-auto mb-3 h-14 w-14" />
            <div className="text-xs font-black uppercase tracking-widest">Итог {name && `· ${name}`}</div>
            <div className="my-4 font-display text-7xl font-black">{correct}/{questions.length}</div>
            <div className="mx-auto inline-block border-4 border-[color:var(--pt-text)] bg-[color:var(--pt-surface-strong)] px-4 py-2 font-bold">
              {earned} / {totalPts} баллов
            </div>
            <button
              onClick={() => setPhase("start")}
              className="mt-6 inline-flex items-center gap-2 border-4 border-[color:var(--pt-text)] bg-[color:var(--pt-accent)] px-6 py-3 font-black uppercase text-black shadow-[4px_4px_0_0_var(--pt-text)]"
            >
              <RefreshCw className="h-4 w-4" /> Ещё раз
            </button>
          </div>
        )}
      </div>
    </PlayerShell>
  );
}

function ChunkyBar({ pct }: { pct: number }) {
  const cells = 20;
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * cells);
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: cells }).map((_, i) => (
        <div
          key={i}
          className={`h-3 flex-1 border-2 border-[color:var(--pt-text)] ${i < filled ? "bg-[color:var(--pt-accent)]" : "bg-[color:var(--pt-surface-strong)]"}`}
        />
      ))}
    </div>
  );
}

// (unused, kept in case parent wants formatted summary)
export function _fmtHelpers() { return { formatQuizAnswer, formatGivenAnswer, useMemo }; }
