// «Сгенерировать квиз»
// AI generation with topic/file, question count, difficulty and wishes.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Loader2, Minus, Plus, RotateCcw, X, Upload } from "lucide-react";
import {
  generateQuiz,
  generateQuizFromFile,
  getQuizTypeDistribution,
  type GeneratedQuizQuestion,
  type QuizDifficulty,
  type QuizTypeDistribution,
} from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { AIAuthPrompt } from "@/components/ai-auth-prompt";

const COOLDOWN_MS = 30_000;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];
const MIN_QUESTION_COUNT = 5;
const MAX_QUESTION_COUNT = 20;
const QUESTION_COUNT_ERROR = "Количество вопросов должно быть от 5 до 20.";
const QUESTION_TYPES: { type: GeneratedQuizQuestion["type"]; label: string }[] = [
  { type: "choice", label: "Выбор ответа" },
  { type: "bool", label: "Правда / Ложь" },
  { type: "text", label: "Текстовый ответ" },
  { type: "matching", label: "Соответствие" },
  { type: "close", label: "Заполнить пропуск" },
  { type: "ordering", label: "Порядок" },
];

function parseQuestionCount(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const count = Number(trimmed);
  return Number.isInteger(count) && count >= MIN_QUESTION_COUNT && count <= MAX_QUESTION_COUNT
    ? count
    : null;
}

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
  const [count, setCount] = useState("10");
  const [countError, setCountError] = useState<string | null>(null);
  const [mode, setMode] = useState<"quick" | "advanced">("quick");
  const [distribution, setDistribution] = useState<QuizTypeDistribution | null>(null);
  const [distributionLoading, setDistributionLoading] = useState(false);
  const distributionRequestId = useRef(0);

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

  const resetAndClose = useCallback(() => {
    setOpen(false);
    setFile(null);
    setError(null);
    setCountError(null);
    setStatus("idle");
    setMode("quick");
    setDistribution(null);
    distributionRequestId.current += 1;
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") resetAndClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, resetAndClose]);

  const loadAutomaticDistribution = async (questionCount: number) => {
    const requestId = ++distributionRequestId.current;
    setDistributionLoading(true);
    setError(null);
    try {
      const nextDistribution = await getQuizTypeDistribution(questionCount);
      if (requestId === distributionRequestId.current) setDistribution(nextDistribution);
    } catch (err) {
      if (requestId === distributionRequestId.current) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить распределение типов.");
      }
    } finally {
      if (requestId === distributionRequestId.current) setDistributionLoading(false);
    }
  };

  const selectAdvancedMode = async () => {
    const parsedCount = parseQuestionCount(count);
    if (parsedCount === null) {
      setCountError(QUESTION_COUNT_ERROR);
      return;
    }
    setMode("advanced");
    setCountError(null);
    if (!distribution) await loadAutomaticDistribution(parsedCount);
  };

  const distributionTotal = distribution
    ? Object.values(distribution).reduce((sum, amount) => sum + amount, 0)
    : 0;

  const adjustType = (type: GeneratedQuizQuestion["type"], delta: -1 | 1) => {
    setDistribution((current) => {
      if (!current) return current;
      const total = Object.values(current).reduce((sum, amount) => sum + amount, 0);
      if ((delta < 0 && (current[type] === 0 || total <= MIN_QUESTION_COUNT)) ||
          (delta > 0 && total >= MAX_QUESTION_COUNT)) return current;
      const next = { ...current, [type]: current[type] + delta };
      setCount(String(total + delta));
      return next;
    });
  };

  const run = async () => {
    if (!user) {
      setAuthPrompt(true);
      return;
    }
    if (onCooldown || status === "loading") {
      return;
    }

    const parsedCount = mode === "advanced" ? distributionTotal : parseQuestionCount(count);
    if (parsedCount === null) {
      setCountError(QUESTION_COUNT_ERROR);
      return;
    }
    if (mode === "advanced" && (!distribution || distributionLoading)) {
      setError("Дождитесь загрузки распределения типов.");
      return;
    }
    setCount(String(parsedCount));

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
          count: parsedCount,
          difficulty,
          wishes: wishes.trim() || undefined,
          type_distribution: mode === "advanced" ? distribution ?? undefined : undefined,
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
        count: parsedCount,
        difficulty,
        wishes: wishes.trim() || undefined,
        type_distribution: mode === "advanced" ? distribution ?? undefined : undefined,
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
          setMode("quick");
          setDistribution(null);
          distributionRequestId.current += 1;
          setOpen(true);
          setError(null);
          setCountError(null);
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
            className="fixed inset-0 z-[70] flex items-end justify-center bg-foreground/40 md:grid md:place-items-center md:p-4"
            onClick={resetAndClose}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="ai-generate-quiz-title"
              className="max-h-[calc(100dvh-1rem)] w-full max-w-md animate-fade-up overflow-y-auto rounded-t-3xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lift md:max-h-[calc(100dvh-2rem)] md:rounded-3xl md:p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 id="ai-generate-quiz-title" className="flex items-center gap-2 font-display text-lg font-bold">
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

              <div className="mb-4 grid grid-cols-2 rounded-xl bg-surface-muted p-1" aria-label="Режим генерации">
                <button
                  type="button"
                  onClick={() => setMode("quick")}
                  aria-pressed={mode === "quick"}
                  className={`min-h-10 rounded-lg px-2 text-sm font-semibold transition-colors ${mode === "quick" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Быстро
                </button>
                <button
                  type="button"
                  onClick={selectAdvancedMode}
                  aria-pressed={mode === "advanced"}
                  className={`min-h-10 rounded-lg px-2 text-sm font-semibold transition-colors ${mode === "advanced" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Настроить типы
                </button>
              </div>

              {/* ============================
                  Файл
              ============================ */}

              <div
                className={`hidden rounded-xl border-2 border-dashed p-5 text-center transition-colors md:block ${
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

              <div className="flex min-h-14 items-center gap-1 rounded-xl border border-border-strong px-2 py-1 md:hidden">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-1 py-2">
                  <Upload className="h-5 w-5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {file ? file.name : "Добавить материал"}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">PDF, DOCX, TXT, MD · до 10 МБ</span>
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    className="hidden"
                    onChange={(event) => {
                      const selected = event.target.files?.[0];
                      if (selected) handleFile(selected);
                    }}
                  />
                </label>
                {file && (
                  <button
                    type="button"
                    onClick={(event) => { event.preventDefault(); setFile(null); }}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-surface-muted hover:text-danger"
                    aria-label="Удалить выбранный файл"
                  >
                    <X className="h-4 w-4" />
                  </button>
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

              {mode === "quick" ? <label className="mb-3 block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Количество вопросов
                </span>

                <input
                  type="number"
                  min={MIN_QUESTION_COUNT}
                  max={MAX_QUESTION_COUNT}
                  step={1}
                  className="input-base w-full min-w-0"
                  value={count}
                  onChange={(e) => {
                    setCount(e.target.value);
                    setCountError(null);
                    setDistribution(null);
                    distributionRequestId.current += 1;
                  }}
                  onBlur={() => {
                    const parsedCount = parseQuestionCount(count);
                    if (parsedCount === null) {
                      setCountError(QUESTION_COUNT_ERROR);
                      return;
                    }
                    setCount(String(parsedCount));
                  }}
                  aria-invalid={countError !== null}
                  aria-describedby={countError ? "ai-question-count-error" : undefined}
                />

                <span
                  id="ai-question-count-error"
                  className={`mt-1 block text-[11px] ${countError ? "text-danger" : "text-muted-foreground"}`}
                >
                  {countError ?? "От 5 до 20 вопросов."}
                </span>
              </label> : (
                <section className="mb-3" aria-labelledby="ai-type-distribution-title">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span id="ai-type-distribution-title" className="text-xs font-semibold text-muted-foreground">
                      Типы вопросов
                    </span>
                    <span className="text-xs font-semibold" aria-live="polite">
                      Всего: {distributionTotal} из {MAX_QUESTION_COUNT}
                    </span>
                  </div>
                  {distributionLoading ? (
                    <div className="grid min-h-36 place-items-center" aria-label="Загрузка распределения">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  ) : distribution ? (
                    <div className="divide-y divide-border rounded-xl border border-border px-3">
                      {QUESTION_TYPES.map(({ type, label }) => (
                        <div key={type} className="flex min-h-12 items-center gap-2 py-1">
                          <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => adjustType(type, -1)}
                              disabled={distribution[type] === 0 || distributionTotal <= MIN_QUESTION_COUNT}
                              className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-35"
                              aria-label={`Уменьшить количество: ${label}`}
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <output className="w-7 text-center text-sm font-bold" aria-label={`${label}: ${distribution[type]}`}>
                              {distribution[type]}
                            </output>
                            <button
                              type="button"
                              onClick={() => adjustType(type, 1)}
                              disabled={distributionTotal >= MAX_QUESTION_COUNT}
                              className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-35"
                              aria-label={`Увеличить количество: ${label}`}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => loadAutomaticDistribution(distributionTotal || parseQuestionCount(count) || 10)}
                    disabled={distributionLoading}
                    className="mt-1 flex min-h-10 items-center gap-1.5 text-xs font-semibold text-primary disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Вернуть авто-распределение
                  </button>
                </section>
              )}

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
                  distributionLoading ||
                  (mode === "advanced" && !distribution) ||
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

              {mode === "quick" && (
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  Типы вопросов подбираются автоматически.
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
