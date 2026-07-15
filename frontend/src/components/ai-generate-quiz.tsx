// «Сгенерировать квиз» (TZ AI v2.0 §3). Модальное окно с полями «Тема»,
// «Количество», «Пожелания». После генерации — подтверждение замены всех
// вопросов. Между генерациями блокировка на 30 секунд.
import { useState } from "react";
import { Sparkles, Loader2, X, WandSparkles } from "lucide-react";
import {
  generateQuiz,
  type GeneratedQuizQuestion,
} from "@/lib/api";

const COOLDOWN_MS = 30_000;

interface Props {
  currentTitle: string;
  onGenerated: (result: { title: string; questions: GeneratedQuizQuestion[] }) => void;
  className?: string;
}

export function AIGenerateQuizButton({ currentTitle, onGenerated, className }: Props) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState(currentTitle);
  const [count, setCount] = useState(10);
  const [wishes, setWishes] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  const onCooldown = cooldownLeft > 0;

  const run = async () => {
    if (onCooldown) return;
    if (!confirm("Это заменит все текущие вопросы. Продолжить?")) return;
    setStatus("loading");
    setError(null);
    try {
      const res = await generateQuiz({
        topic: topic.trim() || undefined,
        count,
        wishes: wishes.trim() || undefined,
      });
      onGenerated(res);
      setStatus("idle");
      setCooldownUntil(Date.now() + COOLDOWN_MS);
      setOpen(false);
    } catch (err) {
      console.error(err);
      setError("Не удалось сгенерировать квиз. Попробуйте ещё раз.");
      setStatus("error");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTopic(currentTitle);
          setOpen(true);
        }}
        className={`btn-ghost cmd-primary ${className ?? ""}`}
      >
        <WandSparkles className="h-4 w-4" />
        Сгенерировать

      </button>
      {open && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-foreground/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md animate-fade-up rounded-3xl bg-surface p-5 shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-lg font-bold">
                <Sparkles className="h-5 w-5 text-primary" /> Сгенерировать квиз
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-surface-muted"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Тема (необязательно — ИИ придумает сам)
                </span>
                <input
                  className="input-base"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Древний Египет, программирование…"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Количество вопросов (5–20)
                </span>
                <input
                  type="number"
                  min={5}
                  max={20}
                  className="input-base"
                  value={count}
                  onChange={(e) => setCount(Math.min(20, Math.max(5, parseInt(e.target.value) || 10)))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Пожелания (необязательно)
                </span>
                <input
                  className="input-base"
                  value={wishes}
                  onChange={(e) => setWishes(e.target.value)}
                  placeholder="для 7 класса, с юмором…"
                />
              </label>
              {error && (
                <div className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}
              <button
                onClick={run}
                disabled={status === "loading" || onCooldown}
                className="btn-accent w-full justify-center"
                title={onCooldown ? "Подождите перед следующей генерацией" : undefined}
              >
                {status === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {onCooldown ? `Подождите ${cooldownLeft}с` : "Сгенерировать"}
              </button>
              <p className="text-center text-[11px] text-muted-foreground">
                Форматы вопросов подбираются автоматически: 6 ABCD, 2 текст, 1 Да/Нет, 1 пары (на каждые 10).
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
