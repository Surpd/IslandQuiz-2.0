// Jeopardy — AI-иконка рядом с названием категории (TZ AI v2.0 §4).
// Если категория пустая → сначала предлагаем 3 темы категорий (по теме
// всей игры), после выбора → генерируем вопросы в пустые слоты.
// Если категория уже названа → сразу генерируем вопросы в пустые слоты
// без модалок.
import { useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Loader2, X, MessageSquarePlus, RefreshCw } from "lucide-react";
import {
  generateJeopardyCategories,
  generateJeopardyQuestions,
  type GeneratedJeopardyCategory,
  type GeneratedJeopardyQuestion,
} from "@/lib/api";

interface Props {
  categoryName: string;
  gameTopic?: string;
  emptySlots: number[];
  onPickCategory: (name: string) => void;
  onFillQuestions: (items: GeneratedJeopardyQuestion[]) => void;
}

export function AIJeopardyCategoryButton({
  categoryName,
  gameTopic,
  emptySlots,
  onPickCategory,
  onFillQuestions,
}: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [wishes, setWishes] = useState("");
  const [categories, setCategories] = useState<GeneratedJeopardyCategory[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };

  const fillQuestions = async (category: string) => {
    if (emptySlots.length === 0) {
      showToast("Все слоты уже заполнены");
      return;
    }
    setStatus("loading");
    try {
      const { questions } = await generateJeopardyQuestions({
        category,
        emptySlots,
        wishes: wishes.trim() || undefined,
      });
      onFillQuestions(questions);
      setStatus("idle");
      showToast(`Сгенерировано вопросов: ${questions.length}`);
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError("Не удалось сгенерировать вопросы. Попробуйте ещё раз.");
    }
  };

  const openCategoryFlow = async () => {
    setStatus("loading");
    setError(null);
    try {
      const { categories } = await generateJeopardyCategories({
        topic: gameTopic?.trim() || undefined,
        wishes: wishes.trim() || undefined,
      });
      setCategories(categories);
      setStatus("idle");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setError("Не удалось сгенерировать категории. Попробуйте ещё раз.");
    }
  };

  const handleClick = () => {
    if (categoryName.trim()) {
      // Категория уже названа — сразу заполняем пустые слоты.
      void fillQuestions(categoryName.trim());
    } else {
      setOpen(true);
      void openCategoryFlow();
    }
  };

  const handleWishes = () => {
    setOpen(true);
    setCategories([]);
    setError(null);
  };

  const pickCategory = (name: string) => {
    onPickCategory(name);
    setOpen(false);
    // Сразу генерируем вопросы под новую категорию.
    void fillQuestions(name);
  };

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        title={categoryName ? "Заполнить пустые слоты AI" : "Придумать категорию через AI"}
        aria-label="AI"
        className="grid h-8 w-8 place-items-center rounded-md border border-border-strong bg-surface text-primary transition-colors hover:border-primary hover:bg-primary-soft disabled:opacity-60"
      >
        {status === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={handleWishes}
        title="Уточнить пожелания"
        aria-label="Пожелания"
        className="grid h-8 w-8 place-items-center rounded-md border border-border-strong bg-surface text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
      </button>

      {toast &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed bottom-20 left-1/2 z-[90] -translate-x-1/2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-white shadow-lift">
            {toast}
          </div>,
          document.body,
        )}

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] grid place-items-center bg-foreground/40 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-md animate-fade-up rounded-3xl bg-surface p-5 shadow-lift"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-display font-bold">
                  <Sparkles className="h-4 w-4 text-primary" /> AI: категория
                </h3>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-surface-muted"
                  aria-label="Закрыть"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <label className="mb-3 block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Пожелания (необязательно)
                </span>
                <input
                  className="input-base text-sm"
                  value={wishes}
                  onChange={(e) => setWishes(e.target.value)}
                  placeholder="для 5 класса, с юмором…"
                />
              </label>
              <button
                onClick={openCategoryFlow}
                disabled={status === "loading"}
                className="btn-accent mb-3 w-full justify-center"
              >
                {status === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Предложить категории
              </button>

              {status === "error" && error && (
                <div className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}
              {status === "idle" && categories.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Выберите категорию — вопросы для пустых слотов сгенерируются автоматически.
                  </p>
                  {categories.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => pickCategory(c.name)}
                      className="block w-full rounded-xl border border-border bg-white p-3 text-left transition-colors hover:border-primary hover:bg-primary-soft"
                    >
                      <div className="font-semibold text-sm">{c.name}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{c.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
