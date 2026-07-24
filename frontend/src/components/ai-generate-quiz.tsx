// «Сгенерировать квиз» (TZ AI v2.0 §3). Модальное окно с полями «Тема»,
// «Количество», «Пожелания» + drag-and-drop загрузка файла.
import { useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Loader2, X, WandSparkles, Upload, FileText } from "lucide-react";
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
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  const onCooldown = cooldownLeft > 0;

  const run = async () => {
    if (onCooldown) return;

    if (file) {
      setStatus("loading");
      setError(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("count", String(count));
        if (wishes.trim()) formData.append("wishes", wishes.trim());

        const res = await fetch("https://islandquiz-2-0.onrender.com/api/ai/generate-from-file", {
          method: "POST",
          body: formData,
        });
        const result = await res.json();
        if (result.error) {
          setError(result.error);
          setStatus("error");
        } else {
          onGenerated(result);
          setStatus("idle");
          setFile(null);
          setCooldownUntil(Date.now() + COOLDOWN_MS);
          setOpen(false);
        }
      } catch {
        setError("Ошибка загрузки файла");
        setStatus("error");
      }
      return;
    }

    if (!topic.trim()) return;
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
      {open && createPortal(
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
                onClick={() => { setOpen(false); setFile(null); }}
                className="rounded-md p-1 text-muted-foreground hover:bg-surface-muted"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              {/* Drag-and-drop зона */}
              <div
                className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                  dragOver ? "border-primary bg-primary-soft" : "border-border-strong"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) setFile(f);
                }}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="font-semibold">{file.name}</span>
                    <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-danger">✕</button>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-semibold">Перетащите файл сюда</p>
                    <p className="text-xs text-muted-foreground">или</p>
                    <label className="cursor-pointer text-sm font-semibold text-primary hover:underline">
                      выберите на компьютере
                      <input
                        type="file"
                        accept=".pdf,.docx,.txt,.md"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setFile(f);
                        }}
                      />
                    </label>
                    <p className="mt-1 text-xs text-muted-foreground">PDF, DOCX, TXT, MD</p>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 border-t border-border"></div>
                <span className="text-xs text-muted-foreground">или введите тему</span>
                <div className="flex-1 border-t border-border"></div>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Тема (необязательно — ИИ придумает сам)
                </span>
                <input
                  className="input-base"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Древний Египет, программирование…"
                  disabled={!!file}
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
                disabled={status === "loading" || onCooldown || (!file && !topic.trim())}
                className="btn-accent w-full justify-center"
                title={onCooldown ? "Подождите перед следующей генерацией" : undefined}
              >
                {status === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {onCooldown ? `Подождите ${cooldownLeft}с` : file ? "Сгенерировать из файла" : "Сгенерировать"}
              </button>
              <p className="text-center text-[11px] text-muted-foreground">
                Форматы вопросов подбираются автоматически: 6 ABCD, 2 текст, 1 Да/Нет, 1 пары (на каждые 10).
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}