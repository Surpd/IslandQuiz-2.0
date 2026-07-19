// PlayerV3 — «Retro Arcade Terminal».
// Визуальный стиль: моноширинный шрифт, «CRT»-скан-линии поверх фона,
// зелёно-фосфорная эстетика (акцент подставляется темой), заголовки в
// духе `> RUN QUIZ.EXE`, таймер — счётчик `T-00:15`, прогресс — псевдо-
// ASCII-бар `[####----]`. Экран результатов — «CONSOLE OUTPUT» с
// логом попаданий/промахов. Все 5 тем через --pt-accent → цвет
// «фосфора» и рамок.

import { useEffect, useRef, useState } from "react";
import { PlayerShell } from "@/components/player-shell";
import { QuizQuestionCard, checkQuizAnswer } from "@/components/quiz-question-card";
import type { QuizData } from "@/lib/types";

interface Ans { qId: string; correct: boolean; earned: number; points: number; q: string }

export function PlayerV3({ data }: { data: QuizData }) {
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
    const next = [...answers, { qId: q.id, correct: ok, earned: ok ? q.points : 0, points: q.points, q: q.q }];
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
  const barCells = 24;
  const filled = Math.round((time / Math.max(totalTime, 1)) * barCells);

  return (
    <PlayerShell theme={config.theme}>
      {/* CRT scanlines */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 opacity-[0.08]"
           style={{ background: "repeating-linear-gradient(to bottom, var(--pt-accent) 0 1px, transparent 1px 3px)" }} />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-4 py-10 font-mono">
        {phase === "start" && (
          <div className="rounded-md border-2 border-[color:var(--pt-accent)] bg-black/60 p-6 shadow-[0_0_40px_-10px_var(--pt-accent)]">
            <div className="text-xs opacity-70">islandquiz@player:~$</div>
            <div className="mt-1 text-lg" style={{ color: "var(--pt-accent)" }}>
              &gt; RUN {config.title.toUpperCase()}.EXE
            </div>
            <pre className="mt-4 whitespace-pre-wrap text-sm opacity-80">
{`  [ OK ] loading questions .......... ${String(questions.length).padStart(2, "0")}
  [ OK ] arming timer ............... ${config.defaultTime}s
  [ ?? ] awaiting player identity ...`}
            </pre>
            <div className="mt-4 flex items-center gap-2">
              <span style={{ color: "var(--pt-accent)" }}>&gt;</span>
              <input
                value={name} onChange={(e) => setName(e.target.value)} placeholder="type your handle_"
                className="flex-1 border-b-2 border-[color:var(--pt-accent)]/50 bg-transparent px-1 py-1 outline-none focus:border-[color:var(--pt-accent)]"
              />
            </div>
            {config.description && (
              <p className="mt-4 border-l-2 border-[color:var(--pt-accent)]/50 pl-3 text-xs opacity-70">
                # {config.description}
              </p>
            )}
            <button onClick={start}
                    className="mt-6 w-full rounded-md border-2 border-[color:var(--pt-accent)] bg-[color:var(--pt-accent)]/10 py-3 font-bold uppercase tracking-widest hover:bg-[color:var(--pt-accent)]/20"
                    style={{ color: "var(--pt-accent)" }}>
              [ press start ]
            </button>
          </div>
        )}

        {phase === "play" && questions[idx] && (
          <>
            <div className="rounded-md border-2 border-[color:var(--pt-accent)]/60 bg-black/50 p-3 text-xs">
              <div className="flex items-center justify-between opacity-90" style={{ color: "var(--pt-accent)" }}>
                <span>Q_{String(idx + 1).padStart(2, "0")}/{String(questions.length).padStart(2, "0")}</span>
                <span>T-00:{String(time).padStart(2, "0")}</span>
              </div>
              <div className="mt-2 tracking-widest" style={{ color: "var(--pt-accent)" }}>
                [{"#".repeat(filled)}{"-".repeat(Math.max(0, barCells - filled))}]
              </div>
            </div>

            <div className="rounded-md border-2 border-[color:var(--pt-accent)]/60 bg-black/50">
              <QuizQuestionCard question={questions[idx]} value={cur} onChange={setCur} reveal={reveal} locked={reveal} />
            </div>

            <div className="flex items-center justify-between text-xs opacity-70">
              <span>score: <span style={{ color: "var(--pt-accent)" }}>{earned}</span>/{totalPts}</span>
              <button disabled={reveal} onClick={() => submit(false)}
                      className="rounded-md border-2 border-[color:var(--pt-accent)] px-6 py-2 font-bold uppercase tracking-widest hover:bg-[color:var(--pt-accent)]/10 disabled:opacity-40"
                      style={{ color: "var(--pt-accent)" }}>
                [ enter ]
              </button>
            </div>
          </>
        )}

        {phase === "done" && (
          <div className="rounded-md border-2 border-[color:var(--pt-accent)] bg-black/60 p-6 shadow-[0_0_40px_-10px_var(--pt-accent)]">
            <div className="text-xs opacity-70">islandquiz@player:~$ cat result.log</div>
            <div className="mt-2 text-lg font-black uppercase tracking-widest" style={{ color: "var(--pt-accent)" }}>
              === END OF SESSION ===
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
              <Stat label="player" value={name || "guest"} />
              <Stat label="correct" value={`${correct}/${questions.length}`} />
              <Stat label="score" value={`${earned}/${totalPts}`} />
            </div>
            <pre className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap rounded border border-[color:var(--pt-accent)]/30 bg-black/50 p-3 text-xs">
{answers.map((a, i) => `${a.correct ? "[ OK ]" : "[FAIL]"}  q${String(i + 1).padStart(2, "0")}  ${a.q.slice(0, 40)}${a.q.length > 40 ? "…" : ""}`).join("\n")}
            </pre>
            <button onClick={() => setPhase("start")}
                    className="mt-5 w-full rounded-md border-2 border-[color:var(--pt-accent)] py-3 font-bold uppercase tracking-widest hover:bg-[color:var(--pt-accent)]/10"
                    style={{ color: "var(--pt-accent)" }}>
              [ retry_ ]
            </button>
          </div>
        )}
      </div>
    </PlayerShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[color:var(--pt-accent)]/30 bg-black/40 px-2 py-3">
      <div className="text-[10px] uppercase tracking-widest opacity-60">{label}</div>
      <div className="mt-1 truncate font-bold" style={{ color: "var(--pt-accent)" }}>{value}</div>
    </div>
  );
}
