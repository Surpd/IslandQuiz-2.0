// AI helper button (TZ AI v2.0 §2, §5, §6).
// - Пустое поле → мини-панель с полями «Тема» (если не пришла из билдера)
//   и «Пожелания», кнопка «Сгенерировать» → 3 варианта с уровнем сложности.
// - Заполненное поле → сразу запрос на улучшение, показываем 3 варианта.
// - Reroll: до 2 раз на одно и то же содержимое поля.
// - Loading / success / error — все три состояния.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Loader2, X, RefreshCw, MessageSquarePlus } from "lucide-react";
import {
  generateQuestion,
  type GeneratedQuestion,
} from "@/lib/api";

interface Props {
  /** Текущее содержимое поля (пустая строка = пусто). */
  currentValue: string;
  /** Тема из билдера (название квиза/категории/игры). undefined → ИИ придумает сам. */
  topic?: string;
  /** Формат для сервера: quiz-choice | quiz-bool | quiz-text | quiz-matching | jeopardy | millionaire. */
  format: string;
  /** Тип вопроса для API (только для choice/bool/text). */
  type?: "choice" | "bool" | "text";
  /** Подставляет выбранный вариант (весь объект: question + options/correct/correctAnswer/pairs). */
  onPick: (variant: GeneratedQuestion) => void;
  /** Опциональный tooltip. */
  title?: string;
}

const MAX_REROLLS = 2;

export function AIHelperButton({
  currentValue,
  topic,
  format,
  type,
  onPick,
  title = "Спросить AI",
}: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [variants, setVariants] = useState<GeneratedQuestion[]>([]);
  const [wishes, setWishes] = useState("");
  const [localTopic, setLocalTopic] = useState("");
  const [rerollCount, setRerollCount] = useState(0);
  const [lastHash, setLastHash] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const hasContent = currentValue.trim().length > 0;
  const effectiveTopic = (topic?.trim() || localTopic.trim() || undefined);
  const hash = useMemo(
    () => `${currentValue}|${effectiveTopic ?? ""}|${wishes}`,
    [currentValue, effectiveTopic, wishes],
  );

  // Сброс rerollCount, когда содержимое поля изменилось.
  useEffect(() => {
    if (lastHash && lastHash.split("|")[0] !== currentValue) {
      setRerollCount(0);
      setVariants([]);
      setLastHash(null);
    }
  }, [currentValue, lastHash]);

  const positionPanel = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 320;
    const left = Math.min(window.innerWidth - width - 8, Math.max(8, r.right - width));
    setPos({ top: r.bottom + 6, left });
  };

  useEffect(() => {
    if (!open) return;
    positionPanel();
    const onScroll = () => positionPanel();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const run = async (reroll = false) => {
    setStatus("loading");
    try {
      const { variants } = await generateQuestion({
        topic: effectiveTopic,
        type,
        format,
        currentText: hasContent ? currentValue : undefined,
        wishes: wishes.trim() || undefined,
        reroll,
      });
      setVariants(variants);
      setLastHash(hash);
      setStatus("idle");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  };

  const openPanel = () => {
    setOpen(true);
    if (hasContent) {
      // Улучшение — сразу запрос, без модалки.
      if (lastHash === hash && variants.length > 0) return; // кэш
      void run(false);
    }
  };

  const canReroll = rerollCount < MAX_REROLLS && variants.length > 0 && status !== "loading";

  const handleReroll = () => {
    if (!canReroll) return;
    setRerollCount((n) => n + 1);
    void run(true);
  };

  const handlePick = (v: GeneratedQuestion) => {
    onPick(v);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openPanel}
        title={title}
        aria-label={title}
        className="grid h-7 w-7 place-items-center rounded-md border border-border-strong bg-surface text-primary transition-colors hover:border-primary hover:bg-primary-soft"
      >
        <Sparkles className="h-3.5 w-3.5" />
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: pos.top, left: pos.left, width: 320 }}
            className="fixed z-[80] animate-fade-up rounded-2xl border border-border-strong bg-surface p-3 shadow-lift"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                AI-помощник
              </p>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-surface-muted"
                aria-label="Закрыть"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {hasContent ? (
              <p className="mb-2 rounded-lg bg-surface-muted px-2 py-1.5 text-[11px] text-muted-foreground">
                Улучшаем: <span className="italic">«{currentValue.slice(0, 60)}{currentValue.length > 60 ? "…" : ""}»</span>
              </p>
            ) : (
              <div className="mb-2 space-y-2">
                {!topic?.trim() && (
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Тема (необязательно)
                    </span>
                    <input
                      className="input-base text-sm"
                      value={localTopic}
                      onChange={(e) => setLocalTopic(e.target.value)}
                      placeholder="ИИ придумает сам, если пусто"
                    />
                  </label>
                )}
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Пожелания (необязательно)
                  </span>
                  <input
                    className="input-base text-sm"
                    value={wishes}
                    onChange={(e) => setWishes(e.target.value)}
                    placeholder="сложные, для 8 класса…"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => run(false)}
                  disabled={status === "loading"}
                  className="btn-accent w-full justify-center py-2 text-sm"
                >
                  {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Сгенерировать
                </button>
              </div>
            )}

            {status === "loading" && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Генерируем…
              </div>
            )}
            {status === "error" && (
              <div className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
                Не удалось сгенерировать. Попробуйте ещё раз.
                <button
                  onClick={() => run(false)}
                  className="ml-2 underline"
                >
                  Повторить
                </button>
              </div>
            )}
            {status === "idle" && variants.length > 0 && (
              <div className="space-y-1.5">
                {variants.map((v, i) => (
                  <button
                    key={i}
                    onClick={() => handlePick(v)}
                    className="block w-full rounded-xl border border-border bg-white p-2 text-left text-sm transition-colors hover:border-primary hover:bg-primary-soft"
                  >
                    <div className="mb-1 flex items-center gap-1">
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                          v.difficulty === "easy"
                            ? "bg-success-soft text-success"
                            : v.difficulty === "medium"
                              ? "bg-amber-soft text-amber"
                              : "bg-danger-soft text-danger"
                        }`}
                      >
                        {v.difficulty}
                      </span>
                    </div>
                    <div className="text-[13px] font-semibold leading-snug">{v.question}</div>
                  </button>
                ))}
                {hasContent && (
                  <div className="pt-1">
                    {rerollCount < MAX_REROLLS ? (
                      <button
                        type="button"
                        onClick={handleReroll}
                        disabled={!canReroll}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong px-2 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                      >
                        <RefreshCw className="h-3 w-3" /> Другие варианты ({MAX_REROLLS - rerollCount} осталось)
                      </button>
                    ) : (
                      <p className="text-center text-[11px] text-muted-foreground">
                        Лимит перегенерации исчерпан. Измените текст или пожелания.
                      </p>
                    )}
                  </div>
                )}
                {hasContent && (
                  <details className="pt-1">
                    <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-primary">
                      <MessageSquarePlus className="mr-1 inline h-3 w-3" /> Уточнить пожелания
                    </summary>
                    <input
                      className="input-base mt-1 text-xs"
                      value={wishes}
                      onChange={(e) => setWishes(e.target.value)}
                      placeholder="сложнее, короче, с примерами…"
                    />
                    <button
                      onClick={() => run(false)}
                      className="btn-ghost mt-1 w-full justify-center py-1 text-xs"
                    >
                      Применить и сгенерировать заново
                    </button>
                  </details>
                )}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
