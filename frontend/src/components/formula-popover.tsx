// LaTeX formula helper: a small popover with templates that insert LaTeX
// snippets at the cursor position of an associated input/textarea.
// Live preview uses the LaTeX component (KaTeX under the hood).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Eraser, RotateCcw, Trash2, X } from "lucide-react";
import { LaTeX } from "@/lib/latex";

type FieldRef = React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;

interface Template {
  label: string;
  insert: string;
  // Optional cursor offset from the end (positive = move left by N chars)
  caret?: number;
}

const TEMPLATES: { title: string; items: Template[] }[] = [
  {
    title: "Основное",
    items: [
      { label: "x²", insert: "\\(x^{2}\\)", caret: 2 },
      { label: "xₙ", insert: "\\(x_{n}\\)", caret: 2 },
      { label: "√", insert: "\\(\\sqrt{x}\\)", caret: 2 },
      { label: "∛", insert: "\\(\\sqrt[3]{x}\\)", caret: 2 },
      { label: "a⁄b", insert: "\\(\\frac{a}{b}\\)", caret: 2 },
      { label: "( )", insert: "\\(\\left( x \\right)\\)", caret: 10 },
    ],
  },
  {
    title: "Операторы",
    items: [
      { label: "∫", insert: "\\(\\int_{a}^{b} f(x)\\,dx\\)", caret: 2 },
      { label: "∑", insert: "\\(\\sum_{i=1}^{n} x_i\\)", caret: 2 },
      { label: "∏", insert: "\\(\\prod_{i=1}^{n} x_i\\)", caret: 2 },
      { label: "lim", insert: "\\(\\lim_{x \\to \\infty}\\)", caret: 2 },
      { label: "∂", insert: "\\(\\partial\\)", caret: 2 },
      { label: "→", insert: "\\(\\to\\)", caret: 2 },
    ],
  },
  {
    title: "Греческие",
    items: [
      { label: "α", insert: "\\(\\alpha\\)", caret: 2 },
      { label: "β", insert: "\\(\\beta\\)", caret: 2 },
      { label: "γ", insert: "\\(\\gamma\\)", caret: 2 },
      { label: "θ", insert: "\\(\\theta\\)", caret: 2 },
      { label: "π", insert: "\\(\\pi\\)", caret: 2 },
      { label: "Σ", insert: "\\(\\Sigma\\)", caret: 2 },
      { label: "Ω", insert: "\\(\\Omega\\)", caret: 2 },
      { label: "λ", insert: "\\(\\lambda\\)", caret: 2 },
    ],
  },
  {
    title: "Символы",
    items: [
      { label: "±", insert: "\\(\\pm\\)", caret: 2 },
      { label: "∞", insert: "\\(\\infty\\)", caret: 2 },
      { label: "≠", insert: "\\(\\neq\\)", caret: 2 },
      { label: "≤", insert: "\\(\\leq\\)", caret: 2 },
      { label: "≥", insert: "\\(\\geq\\)", caret: 2 },
      { label: "∈", insert: "\\(\\in\\)", caret: 2 },
      { label: "∀", insert: "\\(\\forall\\)", caret: 2 },
      { label: "∃", insert: "\\(\\exists\\)", caret: 2 },
    ],
  },
  {
    title: "Функции",
    items: [
      { label: "sin", insert: "\\(\\sin(x)\\)", caret: 2 },
      { label: "cos", insert: "\\(\\cos(x)\\)", caret: 2 },
      { label: "tan", insert: "\\(\\tan(x)\\)", caret: 2 },
      { label: "log", insert: "\\(\\log(x)\\)", caret: 2 },
      { label: "ln", insert: "\\(\\ln(x)\\)", caret: 2 },
      { label: "eˣ", insert: "\\(e^{x}\\)", caret: 2 },
    ],
  },
];

export function FormulaButton({
  inputRef,
  value,
  onChange,
}: {
  inputRef: FieldRef;
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState(0);
  const [preview, setPreview] = useState("\\(x^{2} + y^{2} = r^{2}\\)");
  const popRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const restoreRef = useRef<{ start: number; end: number; scrollY: number } | null>(null);
  const previousValueRef = useRef(value);

  const restoreField = () => {
    const el = inputRef.current;
    const restore = restoreRef.current;
    if (!el || !restore) return;
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      try {
        el.setSelectionRange(restore.start, restore.end);
      } catch {
        /* noop */
      }
      window.scrollTo({ top: restore.scrollY, behavior: "auto" });
    });
  };

  const closePanel = () => {
    setOpen(false);
    setPosition(null);
    restoreField();
  };

  const positionPanel = () => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(320, Math.max(0, window.innerWidth - 24));
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width));
    const top = Math.min(rect.bottom + 8, Math.max(12, window.innerHeight - 420));
    setPosition({ top, left, width });
  };

  const keepFieldAboveKeyboard = () => {
    const el = inputRef.current;
    if (!el || !window.matchMedia("(max-width: 767px)").matches) return;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const keyboardHeight = Math.min(360, Math.max(220, viewportHeight * 0.42));
    const visibleBottom = viewportHeight - keyboardHeight - 10;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > visibleBottom) {
      window.scrollBy({ top: rect.bottom - visibleBottom, behavior: "auto" });
    } else if (rect.top < 96) {
      window.scrollBy({ top: rect.top - 96, behavior: "auto" });
    }
  };

  useEffect(() => {
    if (!open) return;
    positionPanel();
    const onViewportChange = () => {
      positionPanel();
      keepFieldAboveKeyboard();
    };
    const onDoc = (e: MouseEvent) => {
      if (!popRef.current) return;
      if (!popRef.current.contains(e.target as Node)) closePanel();
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && closePanel();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open]);

  const togglePanel = () => {
    if (open) {
      closePanel();
      return;
    }
    const el = inputRef.current;
    restoreRef.current = {
      start: el?.selectionStart ?? value.length,
      end: el?.selectionEnd ?? value.length,
      scrollY: window.scrollY,
    };
    el?.blur();
    positionPanel();
    setOpen(true);
    if (window.matchMedia("(max-width: 767px)").matches && el) {
      requestAnimationFrame(() => {
        keepFieldAboveKeyboard();
      });
    }
  };

  const insert = (tpl: Template) => {
    const el = inputRef.current;
    const savedSelection = restoreRef.current;
    const start = savedSelection?.start ?? el?.selectionStart ?? value.length;
    const end = savedSelection?.end ?? el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + tpl.insert + value.slice(end);
    previousValueRef.current = value;
    onChange(next);
    const caret = start + tpl.insert.length - (tpl.caret ?? 0);
    restoreRef.current = {
      start: caret,
      end: caret,
      scrollY: restoreRef.current?.scrollY ?? window.scrollY,
    };
    // Keep the native keyboard closed while Formula Keyboard is active.
    requestAnimationFrame(() => {
      if (!el) return;
      try {
        el.setSelectionRange(caret, caret);
      } catch {
        /* noop */
      }
    });
    setPreview(tpl.insert);
  };

  const updateValue = (next: string) => {
    previousValueRef.current = value;
    onChange(next);
  };

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={togglePanel}
        aria-label="Вставить формулу"
        title="Вставить формулу LaTeX"
        className="grid h-7 w-7 place-items-center rounded-md border border-border-strong bg-surface font-serif text-[13px] italic text-primary transition-colors hover:border-primary hover:bg-primary-soft"
      >
        ƒx
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          data-testid="formula-palette"
          style={position ?? { top: 12, left: 12, width: Math.min(320, Math.max(0, window.innerWidth - 24)) }}
          className="formula-panel fixed z-50 max-w-[calc(100vw-1.5rem)] animate-fade-up overflow-y-auto rounded-2xl border border-border-strong bg-surface p-3 shadow-lift [max-height:calc(100dvh-1.5rem)]"
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border-strong md:hidden" />
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Формулы LaTeX
            </p>
            <button
              type="button"
              onClick={closePanel}
              aria-label="Закрыть"
              className="rounded-md p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="formula-mobile-groups mb-2 flex gap-1 overflow-x-auto pb-1 md:hidden">
            {TEMPLATES.map((group, index) => (
              <button
                key={group.title}
                type="button"
                onClick={() => setActiveGroup(index)}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${activeGroup === index ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground"}`}
              >
                {group.title}
              </button>
            ))}
          </div>
          <div className="formula-mobile-items max-h-24 overflow-y-auto pr-1 md:hidden">
            <div className="grid grid-cols-4 gap-1">
              {TEMPLATES[activeGroup].items.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => insert(tpl)}
                  className="rounded-lg border border-border bg-surface-muted px-1 py-1.5 text-sm text-foreground transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>
          <div className="hidden max-h-72 space-y-2 overflow-y-auto pr-1 md:block">
            {TEMPLATES.map((group) => (
              <div key={group.title}>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.title}
                </p>
                <div className="grid grid-cols-4 gap-1">
                  {group.items.map((tpl) => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => insert(tpl)}
                      className="rounded-lg border border-border bg-surface-muted px-1 py-1.5 text-sm text-foreground transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary"
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 rounded-xl border border-dashed border-border-strong bg-surface-muted p-2 text-center text-base md:mt-3 md:p-3 md:text-lg">
            <LaTeX>{preview}</LaTeX>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1 border-t border-border pt-2">
            <button type="button" onClick={() => updateValue(previousValueRef.current)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-surface-muted"><RotateCcw className="h-3 w-3" /> Отмена</button>
            <button type="button" onClick={() => updateValue(value.slice(0, -1))} className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-surface-muted"><Trash2 className="h-3 w-3" /> Удалить</button>
            <button type="button" onClick={() => updateValue("")} className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-surface-muted"><Eraser className="h-3 w-3" /> Очистить</button>
            <button type="button" onClick={closePanel} className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-2 py-1.5 text-[11px] font-semibold text-primary-foreground"><Check className="h-3 w-3" /> Готово</button>
          </div>
          <p className="mt-1 text-center text-[10px] text-muted-foreground">
            Клик — вставит на месте курсора
          </p>
        </div>,
        document.body,
      )}
    </div>
  );
}
