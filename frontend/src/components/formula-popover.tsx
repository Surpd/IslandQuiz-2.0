// LaTeX formula helper: a small popover with templates that insert LaTeX
// snippets at the cursor position of an associated input/textarea.
// Live preview uses the LaTeX component (KaTeX under the hood).
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
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
  const [preview, setPreview] = useState("\\(x^{2} + y^{2} = r^{2}\\)");
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!popRef.current) return;
      if (!popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const insert = (tpl: Template) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + tpl.insert + value.slice(end);
    onChange(next);
    // Restore focus & caret after React updates the DOM value.
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = start + tpl.insert.length - (tpl.caret ?? 0);
      try {
        el.setSelectionRange(caret, caret);
      } catch {
        /* noop */
      }
    });
    setPreview(tpl.insert);
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-label="Вставить формулу"
        title="Вставить формулу LaTeX"
        className="grid h-7 w-7 place-items-center rounded-md border border-border-strong bg-surface font-serif text-[13px] italic text-primary transition-colors hover:border-primary hover:bg-primary-soft"
      >
        ƒx
      </button>
      {open && (
        <div
          ref={popRef}
          className="absolute right-0 top-9 z-50 w-[320px] animate-fade-up rounded-2xl border border-border-strong bg-surface p-3 shadow-lift"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Формулы LaTeX
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Закрыть"
              className="rounded-md p-1 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
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
          <div className="mt-3 rounded-xl border border-dashed border-border-strong bg-surface-muted p-3 text-center text-lg">
            <LaTeX>{preview}</LaTeX>
          </div>
          <p className="mt-1 text-center text-[10px] text-muted-foreground">
            Клик — вставит на месте курсора
          </p>
        </div>
      )}
    </div>
  );
}
