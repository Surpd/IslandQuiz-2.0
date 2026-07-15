import { HelpCircle, X } from "lucide-react";
import { useState, type ReactNode } from "react";

export function HelpButton({ children, title = "Как это работает" }: { children: ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Помощь"
        className="fixed bottom-6 left-6 z-40 grid h-11 w-11 place-items-center rounded-full border border-border-strong bg-surface text-muted-foreground shadow-lift transition-colors hover:text-primary"
      >
        <HelpCircle className="h-5 w-5" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg animate-fade-up rounded-3xl bg-surface p-6 shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">{title}</h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-muted"
                aria-label="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm text-muted-foreground">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
