// «Сгенерировать квиз»
// AI generation with topic/file, question count, difficulty and wishes.

import { useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Loader2, X, Upload } from "lucide-react";
import {
  generateQuiz,
  generateQuizFromFile,
  type GeneratedQuizQuestion,
  type QuizDifficulty,
} from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { AIAuthPrompt } from "@/components/ai-auth-prompt";

const COOLDOWN_MS = 30_000;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];

interface Props {
  currentTitle: string;
  onGenerated: (result: {
    title: string;
    questions: GeneratedQuizQuestion[];
  }) => void;
  className?: string;
  compact?: boolean;
}

export function AIGenerateQuizButton({
  currentTitle,
  onGenerated,
  className,
  compact = false,
}: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [authPrompt, setAuthPrompt] = useState(false);

  const [topic, setTopic] = useState(currentTitle);
  const [count, setCount] = useState(10);

  const [difficulty, setDifficulty] =
    useState<QuizDifficulty>("mixed");

  const [wishes, setWishes] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [status, setStatus] = useState<"idle" | "loading" | "error">(
    "idle",
  );

  const [error, setError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  const cooldownLeft = Math.max(
    0,
    Math.ceil((cooldownUntil - Date.now()) / 1000),
  );

  const onCooldown = cooldownLeft > 0;

  const handleFile = (f: File) => {
    if (f.size > MAX_FILE_SIZE) {
      setError("Файл слишком большой. Максимальный размер: 10 МБ.");
      return;
    }

    const ext = "." + f.name.split(".").pop()?.toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setError("Неподдерживаемый формат. PDF, DOCX, TXT, MD.");
      return;
    }

    setFile(f);
    setError(null);
  };

  const resetAndClose = () => {
    setOpen(false);
    setFile(null);
    setError(null);
    setStatus("idle");
  };

  const run = async () => {
    if (!user) {
      setAuthPrompt(true);
      return;
    }
    if (onCooldown || status === "loading") {
      return;
    }

    /*
     * ============================
     * Генерация из файла
     * ============================
     */
    if (file) {
      setStatus("loading");
      setError(null);

      try {
        const result = await generateQuizFromFile({
          file,
          count,
          difficulty,
          wishes: wishes.trim() || undefined,
        });

        onGenerated(result);

        setStatus("idle");
        setFile(null);
        setCooldownUntil(Date.now() + COOLDOWN_MS);
        setOpen(false);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Ошибка загрузки файла.");
        setStatus("error");
      }

      return;
    }

    /*
     * ============================
     * Генерация по теме
     * ============================
     */

    if (!topic.trim()) {
      setError("Введите тему квиза.");
      return;
    }

    if (!confirm("Это заменит все текущие вопросы. Продолжить?")) {
      return;
    }

    setStatus("loading");
    setError(null);

    try {
      const result = await generateQuiz({
        topic: topic.trim(),
        count,
        difficulty,
        wishes: wishes.trim() || undefined,
      });

      onGenerated(result);

      setStatus("idle");
      setCooldownUntil(Date.now() + COOLDOWN_MS);
      setOpen(false);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Не удалось сгенерировать квиз. Попробуйте ещё раз.",
      );

      setStatus("error");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!user) {
            setAuthPrompt(true);
            return;
          }
          setTopic(currentTitle);
          setOpen(true);
          setError(null);
        }}
        className={`btn-ghost cmd-primary ${compact ? "grid h-9 w-9 shrink-0 place-items-center rounded-xl p-0" : ""} ${className ?? ""}`}
        aria-label="Сгенерировать квиз"
        title="Сгенерировать квиз"
      >
        <Sparkles className="h-4 w-4" />
        <span className={compact ? "sr-only" : undefined}>Сгенерировать</span>
      </button>

      {authPrompt && <AIAuthPrompt onClose={() => setAuthPrompt(false)} />}

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] grid place-items-center bg-foreground/40 p-4"
            onClick={resetAndClose}
          >
            <div
              className="w-full max-w-md animate-fade-up rounded-3xl bg-surface p-5 shadow-lift"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Сгенерировать квиз
                  </h2>

                  <p className="mt-1 text-xs text-muted-foreground">
                    ИИ создаст вопросы по заданным параметрам.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={resetAndClose}
                  className="rounded-md p-1 text-muted-foreground hover:bg-surface-muted"
                  aria-label="Закрыть"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* ============================
                  Файл
              ============================ */}

              <div
                className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                  dragOver
                    ? "border-primary bg-primary-soft"
                    : "border-border-strong"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);

                  const f = e.dataTransfer.files?.[0];

                  if (f) {
                    handleFile(f);
                  }
                }}
              >
                {file ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-left">
                      <Upload className="h-4 w-4 shrink-0 text-primary" />

                      <span className="truncate text-sm font-medium">
                        {file.name}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="shrink-0 text-muted-foreground hover:text-danger"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />

                    <div className="text-sm font-medium">
                      Перетащите файл сюда
                    </div>

                    <div className="my-1 text-xs text-muted-foreground">
                      или
                    </div>

                    <label className="cursor-pointer text-sm font-semibold text-primary hover:underline">
                      выберите на компьютере

                      <input
                        type="file"
                        accept=".pdf,.docx,.txt,.md"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];

                          if (f) {
                            handleFile(f);
                          }
                        }}
                      />
                    </label>

                    <div className="mt-2 text-[11px] text-muted-foreground">
                      PDF, DOCX, TXT, MD · до 10 МБ
                    </div>
                  </>
                )}
              </div>

              {/* ============================
                  Разделитель
              ============================ */}

              <div className="my-4 flex items-center gap-2">
                <div className="flex-1 border-t border-border" />

                <span className="text-xs text-muted-foreground">
                  или введите тему
                </span>

                <div className="flex-1 border-t border-border" />
              </div>

              {/* ============================
                  Тема
              ============================ */}

              <label className="mb-3 block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Тема
                </span>

                <input
                  className="input-base"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Древний Египет, программирование…"
                  disabled={!!file}
                />
              </label>

              {/* ============================
                  Количество
              ============================ */}

              <label className="mb-3 block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Количество вопросов
                </span>

                <input
                  type="number"
                  min={5}
                  max={20}
                  className="input-base"
                  value={count}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);

                    setCount(
                      Math.min(
                        20,
                        Math.max(5, Number.isNaN(value) ? 10 : value),
                      ),
                    );
                  }}
                />

                <span className="mt-1 block text-[11px] text-muted-foreground">
                  От 5 до 20 вопросов.
                </span>
              </label>

              {/* ============================
                  Сложность
              ============================ */}

              <label className="mb-3 block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Сложность
                </span>

                <select
                  className="input-base"
                  value={difficulty}
                  onChange={(e) =>
                    setDifficulty(e.target.value as QuizDifficulty)
                  }
                >
                  <option value="easy">Лёгкая</option>
                  <option value="medium">Средняя</option>
                  <option value="hard">Сложная</option>
                  <option value="mixed">Смешанная</option>
                </select>

                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Смешанная — сложность будет постепенно возрастать.
                </span>
              </label>

              {/* ============================
                  Пожелания
              ============================ */}

              <label className="mb-3 block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Пожелания
                </span>

                <input
                  className="input-base"
                  value={wishes}
                  onChange={(e) => setWishes(e.target.value)}
                  placeholder="для 7 класса, с юмором, без сложных терминов…"
                />
              </label>

              {/* ============================
                  Ошибка
              ============================ */}

              {error && (
                <div className="mb-3 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}

              {/* ============================
                  Кнопка
              ============================ */}

              <button
                type="button"
                onClick={run}
                disabled={
                  status === "loading" ||
                  onCooldown ||
                  (!file && !topic.trim())
                }
                className="btn-accent w-full justify-center"
                title={
                  onCooldown
                    ? "Подождите перед следующей генерацией"
                    : undefined
                }
              >
                {status === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}

                {onCooldown
                  ? `Подождите ${cooldownLeft}с`
                  : file
                    ? "Сгенерировать из файла"
                    : "Сгенерировать"}
              </button>

              {/* ============================
                  Информация
              ============================ */}

              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Типы вопросов подбираются автоматически:
                choice, text, Да/Нет и matching.
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
