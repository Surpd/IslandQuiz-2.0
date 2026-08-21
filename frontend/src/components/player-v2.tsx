// PlayerV2 — «Glassmorphic Aurora» со всей логикой из play.quiz.$id.tsx

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, useDraggable, useDroppable, type DragEndEvent,
} from "@dnd-kit/core";
import { RefreshCw, Timer, Sparkles } from "lucide-react";
import { PlayerShell } from "@/components/player-shell";
import { Avatar } from "@/components/avatar";
import { LaTeX } from "@/lib/latex";
import { createPlaySnapshot, submitResult } from "@/lib/api";
import { formatQuizAnswer, formatGivenAnswer, checkQuizAnswerCore } from "@/lib/format-answer";
import { QuizAnswerDisplay } from "@/components/quiz-answer-display";
import { fitOptionSize, fitQuestionSize } from "@/lib/fit-text";
import { useAuth } from "@/hooks/use-auth";
import type { QuizData, QuizQuestion } from "@/lib/types";

interface QAnswer {
  qId: string; correct: boolean; earned: number; question: string;
  given: string; rawGiven: string; correctAnswer: string; points: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const checkAnswer = checkQuizAnswerCore;

export function PlayerV2Full({ data, gameId }: { data: QuizData; gameId?: string }) {
  const { user } = useAuth();
  const { config, questions } = data;
  const [phase, setPhase] = useState<"start" | "playing" | "done">("start");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [order, setOrder] = useState<number[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<QAnswer[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [current, setCurrent] = useState<string>("");
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const startedAt = useRef<number>(0);
  const savedRef = useRef(false);
  const [snapshotToken, setSnapshotToken] = useState<string | null>(null);

  useEffect(() => {
    if (user && !nameTouched && !name) setName(user.name);
  }, [user, nameTouched, name]);

  useEffect(() => {
    if (!config || !questions.length || phase !== "playing") return;
    const isFree = config.orderMode === "free";
    if (isFree) {
      const remaining = Math.max(0, config.totalTime * 60 - Math.floor((Date.now() - startedAt.current) / 1000));
      setTimeLeft(remaining);
      const t = setInterval(() => {
        const r = Math.max(0, config.totalTime * 60 - Math.floor((Date.now() - startedAt.current) / 1000));
        setTimeLeft(r);
        if (r <= 0) { clearInterval(t); finishAll(); }
      }, 500);
      return () => clearInterval(t);
    }
    const q = questions[order[idx]];
    setTimeLeft(q.time || config.defaultTime);
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(t); submit(true); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, idx, order, config]);

  const start = async () => {
    if (!config) return;
    let token: string | null = null;
    if (gameId) {
      try {
        token = (await createPlaySnapshot<QuizData>("quiz", gameId)).snapshotToken;
      } catch (error) {
        console.error("Не удалось зафиксировать snapshot игры", error);
        return;
      }
    }
    const ord = config.shuffleQuestions ? shuffle(questions.map((_, i) => i)) : questions.map((_, i) => i);
    setOrder(ord);
    setIdx(0); setAnswers([]); setCurrent(""); setFeedback(null);
    startedAt.current = Date.now(); savedRef.current = false; setSnapshotToken(token);
    setPhase("playing");
  };

  const persistResult = (finalAnswers: QAnswer[]) => {
    if (savedRef.current || !questions.length) return;
    savedRef.current = true;
    const timeSec = Math.max(0, Math.floor((Date.now() - startedAt.current) / 1000));
    if (gameId && snapshotToken) {
      submitResult({
        gameId, playerName: name.trim(), timeSec, snapshotToken,
        answers: finalAnswers.map(a => ({ qId: a.qId, given: a.rawGiven })),
      }).then(saved => console.log("[quiz] результат сохранён", saved))
        .catch(e => { savedRef.current = false; console.error("Не удалось сохранить результат", e); });
    }
  };

  useEffect(() => { if (phase === "done") persistResult(answers); }, [phase]);

  const submit = (timeout = false) => {
    if (!config) return;
    const q = questions[order[idx]];
    const isCorrect = timeout ? false : checkAnswer(q, current);
    const earned = isCorrect ? q.points : 0;
    const nextAnswers = [...answers, {
      qId: q.id, correct: isCorrect, earned, question: q.q,
      given: timeout ? "" : formatGivenAnswer(q, current), rawGiven: timeout ? "" : current,
      correctAnswer: formatQuizAnswer(q), points: q.points,
    }];
    setAnswers(nextAnswers);
    setFeedback(isCorrect ? "correct" : "wrong");
    const delay = config.showResult === "each" ? 1200 : 200;
    setTimeout(() => {
      setFeedback(null); setCurrent("");
      if (idx + 1 >= order.length) { persistResult(nextAnswers); setPhase("done"); }
      else setIdx(idx + 1);
    }, delay);
  };

  const finishAll = () => { persistResult(answers); setPhase("done"); };
  const goTo = (newIdx: number) => { setCurrent(""); setFeedback(null); setIdx(newIdx); };

  const totalPoints = questions.reduce((s, q) => s + q.points, 0);
  const earnedPoints = answers.reduce((s, a) => s + a.earned, 0);
  const correctCount = answers.filter(a => a.correct).length;
  const totalTime = questions[order[idx]]?.time || config?.defaultTime || 30;

  return (
    <PlayerShell theme={config?.theme || "amber"}>
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
            <h1 className="font-display text-4xl font-black tracking-tight">{config?.title}</h1>
            {config?.description && <p className="mt-3 text-[color:var(--pt-text-muted)]">{config.description}</p>}
            <p className="mt-4 text-xs uppercase tracking-[0.3em] text-[color:var(--pt-text-muted)]">
              {questions.length} вопросов · {config?.orderMode === "free" ? `Общее время ${config.totalTime} мин` : "Таймер на вопрос"}
            </p>
            {user && (
              <div className="mt-6 flex items-center justify-center gap-3 rounded-xl bg-white/10 px-4 py-2 text-sm backdrop-blur">
                <Avatar name={user.name} avatar={user.avatar} size={32} />
                <span className="text-[color:var(--pt-text-muted)]">Играете как</span>
                <span className="font-semibold">{user.name}</span>
              </div>
            )}
            <input
              value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
              placeholder={user ? "Изменить имя" : "Ваше имя (необязательно)"}
              className="mx-auto mt-4 block w-full max-w-sm rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-center text-lg outline-none backdrop-blur placeholder:text-[color:var(--pt-text-muted)] focus:border-[color:var(--pt-accent)]"
            />
            <button onClick={start}
              className="mt-5 rounded-full bg-[color:var(--pt-accent)] px-10 py-3 font-bold text-black shadow-[0_10px_40px_-10px_var(--pt-accent)] transition hover:scale-[1.03]">
              Начать →
            </button>
          </div>
        )}

        {phase === "playing" && questions[order[idx]] && (
          <>
            <FreeNav questions={questions} order={order} answers={answers} current={idx} onGo={goTo} />
            <div className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/5 px-5 py-3 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                {(user || name.trim()) && <Avatar name={name || user?.name || "?"} avatar={user?.avatar} size={28} />}
                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-[color:var(--pt-text-muted)]">Вопрос</div>
                  <div className="font-display text-xl font-black">{idx + 1} <span className="text-[color:var(--pt-text-muted)]">/ {questions.length}</span></div>
                </div>
              </div>
              <RingTimer value={timeLeft} total={totalTime} />
            </div>

            <div className="flex justify-center gap-1.5">
              {questions.map((_, i) => {
                const a = answers.find(ans => ans.qId === questions[order[i]]?.id);
                return (
                  <span key={i}
                    className={`h-1.5 rounded-full transition-all ${i === idx ? "w-8 bg-[color:var(--pt-accent)]" : a ? a.correct ? "w-2 bg-success" : "w-2 bg-danger" : "w-2 bg-white/20"}`} />
                );
              })}
            </div>

            <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-2xl">
              <QuestionCard question={questions[order[idx]]} value={current} onChange={setCurrent} feedback={feedback} config={config!} />
            </div>

            <div className="flex justify-end gap-3">
              {config?.orderMode === "free" && (
                <button onClick={finishAll} className="rounded-full border border-white/20 bg-white/5 px-6 py-3 font-semibold backdrop-blur hover:bg-white/10">
                  Завершить
                </button>
              )}
              <button disabled={feedback !== null} onClick={() => submit(false)}
                className="rounded-full bg-[color:var(--pt-accent)] px-10 py-3 font-bold text-black shadow-[0_10px_40px_-10px_var(--pt-accent)] transition hover:scale-[1.03] disabled:opacity-40">
                Ответить
              </button>
            </div>
          </>
        )}

        {phase === "done" && (
          <div className="rounded-3xl border border-white/15 bg-white/5 p-6 text-center backdrop-blur-2xl sm:p-12">
            <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--pt-text-muted)]">
              {name || user?.name || "Игрок"} · итог
            </div>
            <div className="my-6 font-display text-8xl font-black leading-none"
                 style={{ color: "var(--pt-accent)", textShadow: "0 0 60px var(--pt-accent)" }}>
              {correctCount}<span className="text-4xl text-[color:var(--pt-text-muted)]">/{questions.length}</span>
            </div>
            <div className="mx-auto h-2 max-w-xs overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[color:var(--pt-accent)]" style={{ width: `${(earnedPoints / Math.max(totalPoints, 1)) * 100}%` }} />
            </div>
            <p className="mt-3 text-sm text-[color:var(--pt-text-muted)]">{earnedPoints} из {totalPoints} баллов</p>
            <button onClick={() => { setPhase("start"); setIdx(0); setAnswers([]); }}
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

function FreeNav({ questions, order, answers, current, onGo }: {
  questions: QuizQuestion[]; order: number[]; answers: QAnswer[]; current: number; onGo: (i: number) => void;
}) {
  const answeredMap = new Map(answers.map(a => [a.qId, a]));
  return (
    <div className="flex flex-wrap gap-1.5 rounded-2xl border border-white/15 bg-white/5 p-3 backdrop-blur-xl">
      {order.map((qIdx, i) => {
        const answered = answeredMap.get(questions[qIdx].id);
        const active = i === current;
        return (
          <button key={i} onClick={() => onGo(i)}
            className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-bold transition-all ${
              active ? "bg-[color:var(--pt-accent)] text-black" :
              answered ? answered.correct ? "bg-success/30 text-success" : "bg-danger/30 text-danger" :
              "bg-white/10 text-[color:var(--pt-text-muted)] hover:text-white"}`}>
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}

function QuestionCard({ question, value, onChange, feedback, config }: {
  question: QuizQuestion; value: string; onChange: (v: string) => void;
  feedback: "correct" | "wrong" | null; config: QuizData["config"];
}) {
  return (
    <div className="p-8">
      {question.image && <img src={question.image} alt="" className="mx-auto mb-4 max-h-56 rounded-xl object-contain" />}
      <div className={`mb-6 text-center font-semibold leading-snug ${fitQuestionSize(question.q)}`}>
        <LaTeX>{question.q}</LaTeX>
      </div>

      {question.type === "choice" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {question.options.map((opt, i) => {
            const selected = value === opt;
            const isCorrect = config.showResult === "each" && feedback && opt === question.answer;
            const isWrong = config.showResult === "each" && feedback === "wrong" && selected && opt !== question.answer;
            return (
              <button key={i} type="button" disabled={feedback !== null} onClick={() => onChange(opt)}
                className={`flex items-center gap-3 rounded-xl border-2 px-4 py-4 text-left transition-all ${
                  isCorrect ? "border-success bg-success/20" : isWrong ? "border-danger bg-danger/20" :
                  selected ? "border-[color:var(--pt-accent)] bg-white/10" : "border-white/15 bg-white/5 hover:border-[color:var(--pt-accent)]"}`}>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--pt-accent)] text-sm font-bold text-black">{String.fromCharCode(65 + i)}</span>
                <span className={`min-w-0 break-words ${fitOptionSize(opt)}`}><LaTeX>{opt}</LaTeX></span>
              </button>
            );
          })}
        </div>
      )}

      {question.type === "bool" && (
        <div className="grid grid-cols-2 gap-3">
          {(["true", "false"] as const).map(v => (
            <button key={v} disabled={feedback !== null} onClick={() => onChange(v)}
              className={`rounded-xl border-2 px-4 py-6 text-lg font-bold ${
                value === v ? v === "true" ? "border-success bg-success/20 text-success" : "border-danger bg-danger/20 text-danger" :
                "border-white/15 bg-white/5"}`}>
              {v === "true" ? "✓ Правда" : "✕ Ложь"}
            </button>
          ))}
        </div>
      )}

      {question.type === "text" && (
        <input disabled={feedback !== null} value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-lg outline-none backdrop-blur focus:border-[color:var(--pt-accent)]"
          placeholder="Введите ответ..." />
      )}

      {question.type === "matching" && <MatchingBoard question={question} value={value} onChange={onChange} />}
      {question.type === "close" && <CloseBoard question={question} value={value} onChange={onChange} disabled={feedback !== null} />}
      {question.type === "ordering" && <OrderingBoard question={question} value={value} onChange={onChange} disabled={feedback !== null} />}

      {feedback && (
        <div className="mt-4 text-center">
          <p className={`text-lg font-bold ${feedback === "correct" ? "text-success" : "text-danger"}`}>
            {feedback === "correct" ? "✓ Верно!" : "✕ Неверно"}
          </p>
          {feedback === "wrong" && config.showResult === "each" && (
            <p className="mt-1 text-sm text-[color:var(--pt-text-muted)]">
              Правильный ответ: <QuizAnswerDisplay question={question} className="text-white" />
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// MatchingBoard, CloseBoard, OrderingBoard, DropZone, Draggable — 
// скопируй их из play.quiz.$id.tsx без изменений (они уже там есть)

function MatchingBoard({
  question,
  value,
  onChange,
}: {
  question: QuizQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  const pairs = useMemo(() => {
    try {
      return JSON.parse(question.answer) as { left: string; right: string }[];
    } catch {
      return [];
    }
  }, [question.answer]);

  const shuffledRights = useMemo(() => shuffle(pairs.map((p) => p.right)), [pairs]);

  const assigned: Record<string, string> = useMemo(() => {
    try {
      return JSON.parse(value || "{}") as Record<string, string>;
    } catch {
      return {};
    }
  }, [value]);

  const usedRights = new Set(Object.values(assigned));

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const right = String(e.active.id).replace("right:", "");
    const left = String(e.over.id).replace("left:", "");
    // Remove any prior assignment of that right
    const next: Record<string, string> = {};
    Object.entries(assigned).forEach(([k, v]) => {
      if (v !== right) next[k] = v;
    });
    next[left] = right;
    onChange(JSON.stringify(next));
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs uppercase text-[color:var(--pt-text-muted)]">Пары</p>
          {pairs.map((p) => (
            <DropZone key={p.left} left={p.left} value={assigned[p.left]} />
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-xs uppercase text-[color:var(--pt-text-muted)]">Перетащите варианты</p>
          {shuffledRights
            .filter((r) => !usedRights.has(r))
            .map((r) => (
              <Draggable key={r} value={r} />
            ))}
          {shuffledRights.filter((r) => !usedRights.has(r)).length === 0 && (
            <p className="rounded-xl border border-dashed border-[color:var(--pt-border)] p-3 text-center text-xs text-[color:var(--pt-text-muted)]">
              Все варианты расставлены
            </p>
          )}
        </div>
      </div>
    </DndContext>
  );
}

function CloseBoard({
  question,
  value,
  onChange,
  disabled,
}: {
  question: QuizQuestion;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const correct = useMemo(() => {
    try {
      const a = JSON.parse(question.answer || "[]") as string[];
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  }, [question.answer]);
  const parts = question.q.split("___");
  const blanks = parts.length - 1;
  const values: string[] = useMemo(() => {
    try {
      const a = JSON.parse(value || "[]") as string[];
      const out = Array.isArray(a) ? [...a] : [];
      while (out.length < blanks) out.push("");
      out.length = blanks;
      return out;
    } catch {
      return Array(blanks).fill("");
    }
  }, [value, blanks]);
  const setAt = (i: number, v: string) => {
    const next = [...values];
    next[i] = v;
    onChange(JSON.stringify(next));
  };
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-lg leading-relaxed">
      {parts.map((p, i) => (
        <span key={i} className="contents">
          <LaTeX>{p}</LaTeX>
          {i < blanks && (
            <input
              disabled={disabled}
              value={values[i] ?? ""}
              onChange={(e) => setAt(i, e.target.value)}
              placeholder="…"
              size={Math.max(6, (correct[i] || "").length + 2)}
              className="inline-block rounded-lg border-2 border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-2 py-1 text-center font-semibold outline-none focus:border-[color:var(--pt-accent)]"
            />
          )}
        </span>
      ))}
    </div>
  );
}


function OrderingBoard({
  question,
  value,
  onChange,
  disabled,
}: {
  question: QuizQuestion;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const correct = useMemo(() => {
    try {
      const a = JSON.parse(question.answer || "[]") as string[];
      return Array.isArray(a) ? a.filter(Boolean) : [];
    } catch {
      return [];
    }
  }, [question.answer]);

  // Initial shuffle once per question (fresh per mount).
  const initial = useMemo(() => shuffle(correct), [correct]);
  const items: string[] = useMemo(() => {
    try {
      const a = JSON.parse(value || "null");
      if (Array.isArray(a) && a.length === correct.length) return a as string[];
    } catch {
      // ignore
    }
    return initial;
  }, [value, initial, correct.length]);

  // Ensure parent state has an initial value so submit sends something.
  useEffect(() => {
    if (!value) onChange(JSON.stringify(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (i: number, dir: -1 | 1) => {
    if (disabled) return;
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(JSON.stringify(next));
  };

  return (
    <div className="space-y-2">
      {items.map((v, i) => (
        <div
          key={`${v}-${i}`}
          className="flex items-center gap-3 rounded-xl border-2 border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-4 py-3"
        >
          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[color:var(--pt-accent)] font-bold text-black">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 break-words text-sm font-semibold">
            <LaTeX>{v}</LaTeX>
          </span>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              disabled={disabled || i === 0}
              onClick={() => move(i, -1)}
              className="rounded p-1 text-[color:var(--pt-text-muted)] hover:text-[color:var(--pt-accent)] disabled:opacity-30"
              aria-label="Вверх"
            >
              ▲
            </button>
            <button
              type="button"
              disabled={disabled || i === items.length - 1}
              onClick={() => move(i, 1)}
              className="rounded p-1 text-[color:var(--pt-text-muted)] hover:text-[color:var(--pt-accent)] disabled:opacity-30"
              aria-label="Вниз"
            >
              ▼
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}


function DropZone({ left, value }: { left: string; value?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `left:${left}` });
  return (
    <div
      ref={setNodeRef}
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border-2 border-dashed p-3 transition-all sm:flex sm:gap-3 ${
        isOver ? "border-[color:var(--pt-accent)] bg-[color:var(--pt-surface-strong)]" : "border-[color:var(--pt-border)]"
      }`}
    >
      <span className="min-w-0 break-words text-sm font-semibold sm:flex-1">{left}</span>
      <span className="text-[color:var(--pt-text-muted)]">→</span>
      <span
        className={`min-w-0 break-words rounded-lg px-3 py-2 text-left text-sm sm:min-w-[40%] ${
          value
            ? "bg-[color:var(--pt-accent)] font-bold text-black"
            : "bg-[color:var(--pt-surface-strong)] text-[color:var(--pt-text-muted)]"
        }`}
      >
        {value || "…"}
      </span>
    </div>
  );
}


function Draggable({ value }: { value: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `right:${value}` });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      className={`cursor-grab break-words rounded-xl border-2 border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-4 py-3 text-sm font-semibold shadow-sm active:cursor-grabbing ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      {value}
    </div>
  );
}
