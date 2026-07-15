// Shared question card + checker for the online quiz player.
// Structure mirrors the offline QuestionCard in play.quiz.$id.tsx so both
// experiences stay visually identical, but this version is decoupled so we
// don't touch the offline route.

import { useEffect, useMemo } from "react";
import {
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { LaTeX } from "@/lib/latex";
import { fitOptionSize, fitQuestionSize } from "@/lib/fit-text";
import { checkQuizAnswerCore } from "@/lib/format-answer";
import type { QuizQuestion } from "@/lib/types";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const checkQuizAnswer = checkQuizAnswerCore;

export function QuizQuestionCard({
  question,
  value,
  onChange,
  onClickSound,
  reveal,
  locked,
  projector,
}: {
  question: QuizQuestion;
  value: string;
  onChange: (v: string) => void;
  onClickSound?: () => void;
  reveal?: boolean;      // true → highlight correct answer
  locked?: boolean;      // disable input (submitted or reveal)
  projector?: boolean;   // teacher screen: hide input controls, purely display
}) {
  const disabled = !!locked || !!projector;

  return (
    <div className="rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-6 md:p-8 backdrop-blur-md">
      {question.image && (
        <img
          src={question.image}
          alt=""
          className="mx-auto mb-4 max-h-56 rounded-xl border border-[color:var(--pt-border)] object-contain"
        />
      )}
      <div className={`mb-6 text-center font-semibold leading-snug ${fitQuestionSize(question.q)}`}>
        <LaTeX>{question.q}</LaTeX>
      </div>

      {question.type === "choice" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {question.options.map((opt, i) => {
            const selected = value === opt;
            const isCorrect = reveal && opt === question.answer;
            const isWrong = reveal && selected && opt !== question.answer;
            return (
              <button
                key={i}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  onClickSound?.();
                  onChange(opt);
                }}
                className={`flex items-center gap-3 rounded-xl border-2 px-4 py-4 text-left transition-all ${
                  isCorrect
                    ? "border-success bg-success/20"
                    : isWrong
                      ? "border-danger bg-danger/20"
                      : selected
                        ? "border-[color:var(--pt-accent)] bg-[color:var(--pt-surface-strong)]"
                        : "border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] hover:border-[color:var(--pt-accent)]"
                } ${disabled && !projector ? "cursor-not-allowed" : ""}`}
              >
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-[color:var(--pt-accent)] text-sm font-bold text-black">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className={`min-w-0 break-words ${fitOptionSize(opt)}`}><LaTeX>{opt}</LaTeX></span>
              </button>
            );
          })}
        </div>
      )}

      {question.type === "bool" && (
        <div className="grid grid-cols-2 gap-3">
          {(["true", "false"] as const).map((v) => {
            const selected = value === v;
            const isCorrect = reveal && v === question.answer;
            const isWrong = reveal && selected && v !== question.answer;
            return (
              <button
                key={v}
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  onClickSound?.();
                  onChange(v);
                }}
                className={`rounded-xl border-2 px-4 py-6 text-lg font-bold transition-all ${
                  isCorrect
                    ? "border-success bg-success/20 text-success"
                    : isWrong
                      ? "border-danger bg-danger/20 text-danger"
                      : selected
                        ? v === "true"
                          ? "border-success bg-success/20 text-success"
                          : "border-danger bg-danger/20 text-danger"
                        : "border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)]"
                }`}
              >
                {v === "true" ? "✓ Правда" : "✕ Ложь"}
              </button>
            );
          })}
        </div>
      )}

      {question.type === "text" && (
        <div>
          <input
            disabled={disabled}
            className="w-full rounded-xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-4 py-3 text-lg text-[color:var(--pt-text)] outline-none focus:border-[color:var(--pt-accent)]"
            placeholder="Введите ответ..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {reveal && (
            <p className="mt-3 text-center text-sm text-[color:var(--pt-text-muted)]">
              Ответ: <span className="font-semibold text-success">{question.answer}</span>
            </p>
          )}
        </div>
      )}

      {question.type === "matching" && (
        <MatchingBoard
          question={question}
          value={value}
          onChange={onChange}
          disabled={disabled}
          reveal={!!reveal}
        />
      )}

      {question.type === "close" && (
        <CloseBoard question={question} value={value} onChange={onChange} disabled={disabled} reveal={!!reveal} />
      )}

      {question.type === "ordering" && (
        <OrderingBoard question={question} value={value} onChange={onChange} disabled={disabled} reveal={!!reveal} />
      )}
    </div>
  );
}

function MatchingBoard({
  question,
  value,
  onChange,
  disabled,
  reveal,
}: {
  question: QuizQuestion;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  reveal: boolean;
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
    if (disabled) return;
    if (!e.over) return;
    const right = String(e.active.id).replace("right:", "");
    const left = String(e.over.id).replace("left:", "");
    const next: Record<string, string> = {};
    Object.entries(assigned).forEach(([k, v]) => {
      if (v !== right) next[k] = v;
    });
    next[left] = right;
    onChange(JSON.stringify(next));
  };

  if (reveal) {
    return (
      <div className="space-y-2">
        {pairs.map((p) => {
          const given = assigned[p.left];
          const ok = given === p.right;
          return (
            <div
              key={p.left}
              className={`flex items-center gap-3 rounded-xl border-2 p-3 ${
                ok ? "border-success bg-success/10" : "border-danger bg-danger/10"
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.left}</span>
              <span className="text-[color:var(--pt-text-muted)]">→</span>
              <span className="rounded-lg bg-[color:var(--pt-accent)] px-3 py-1 text-sm font-bold text-black">
                {p.right}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

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

function DropZone({ left, value }: { left: string; value?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `left:${left}` });
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-3 rounded-xl border-2 border-dashed p-3 transition-all ${
        isOver
          ? "border-[color:var(--pt-accent)] bg-[color:var(--pt-surface-strong)]"
          : "border-[color:var(--pt-border)]"
      }`}
    >
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{left}</span>
      <span className="text-[color:var(--pt-text-muted)]">→</span>
      <span
        className={`min-w-[40%] rounded-lg px-3 py-2 text-sm ${
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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `right:${value}`,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      className={`cursor-grab rounded-xl border-2 border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-4 py-3 text-sm font-semibold shadow-sm active:cursor-grabbing ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      {value}
    </div>
  );
}

function CloseBoard({
  question,
  value,
  onChange,
  disabled,
  reveal,
}: {
  question: QuizQuestion;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  reveal: boolean;
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
    <div>
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
      {reveal && (
        <p className="mt-3 text-center text-sm text-[color:var(--pt-text-muted)]">
          Ответ: <span className="font-semibold text-success">{correct.join(" · ")}</span>
        </p>
      )}
    </div>
  );
}

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function OrderingBoard({
  question,
  value,
  onChange,
  disabled,
  reveal,
}: {
  question: QuizQuestion;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  reveal: boolean;
}) {
  const correct = useMemo(() => {
    try {
      const a = JSON.parse(question.answer || "[]") as string[];
      return Array.isArray(a) ? a.filter(Boolean) : [];
    } catch {
      return [];
    }
  }, [question.answer]);
  const initial = useMemo(() => shuffleArr(correct), [correct]);
  const items: string[] = useMemo(() => {
    try {
      const a = JSON.parse(value || "null");
      if (Array.isArray(a) && a.length === correct.length) return a as string[];
    } catch {
      // ignore
    }
    return initial;
  }, [value, initial, correct.length]);
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
  if (reveal) {
    return (
      <div className="space-y-2">
        {correct.map((v, i) => {
          const ok = items[i] === v;
          return (
            <div
              key={`${v}-${i}`}
              className={`flex items-center gap-3 rounded-xl border-2 p-3 ${
                ok ? "border-success bg-success/10" : "border-danger bg-danger/10"
              }`}
            >
              <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[color:var(--pt-accent)] font-bold text-black">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 break-words text-sm font-semibold">
                <LaTeX>{v}</LaTeX>
              </span>
              {!ok && (
                <span className="text-xs text-danger">был: {items[i] ?? "—"}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  }
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
