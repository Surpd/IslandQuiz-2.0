import { Link, useLocation } from "@tanstack/react-router";
import { Coins, FileText, Grid3X3, Home, Library, Plus, ScanLine, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";

const items = [
  { to: "/" as const, label: "Главная", Icon: Home, match: (path: string) => path === "/" },
  { to: "/library" as const, label: "Библиотека", Icon: Library, match: (path: string) => path.startsWith("/library") },
  { to: "/" as const, label: "Создать", Icon: Plus, match: () => false },
  { to: "/join" as const, label: "Join", Icon: ScanLine, match: (path: string) => path.startsWith("/join") },
  { to: "/profile" as const, label: "Профиль", Icon: UserRound, match: (path: string) => path.startsWith("/profile") },
];

const createOptions = [
  { to: "/builder/quiz" as const, label: "Квиз", Icon: FileText, tone: "bg-primary-soft text-primary" },
  { to: "/builder/jeopardy" as const, label: "Своя игра", Icon: Grid3X3, tone: "bg-accent-soft text-accent" },
  { to: "/builder/millionaire" as const, label: "Миллионер", Icon: Coins, tone: "bg-amber-soft text-amber-foreground" },
];

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!createOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCreateOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [createOpen]);

  return (
    <>
      {createOpen && (
        <div className="fixed inset-0 z-[60] bg-foreground/30 md:hidden" onClick={() => setCreateOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-create-title"
            className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-border bg-surface px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 shadow-lift"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-strong" />
            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <h2 id="mobile-create-title" className="font-display text-lg font-bold">Создать игру</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Выберите формат</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Закрыть выбор формата"
                className="grid h-10 w-10 place-items-center rounded-full border border-border text-muted-foreground hover:bg-surface-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              {createOptions.map(({ to, label, Icon, tone }) => (
                <Link
                  key={to}
                  to={to}
                  search={{ id: undefined }}
                  onClick={() => setCreateOpen(false)}
                  className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-background px-3 py-2.5 transition-colors hover:bg-surface-muted"
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold">{label}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
      <nav
        aria-label="Основная навигация"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-18px_rgba(15,23,42,0.35)] backdrop-blur-md md:hidden"
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center gap-0.5">
          {items.map(({ to, label, Icon, match }) => {
            const create = label === "Создать";
            const active = match(pathname);
            const content = (
              <>
                <span
                  className={`grid h-7 w-7 place-items-center rounded-full ${
                    create ? "bg-primary text-primary-foreground shadow-sm" : active ? "bg-primary-soft" : ""
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active && !create ? "text-primary" : ""}`} />
                </span>
                <span className="truncate px-0.5">{label}</span>
              </>
            );
            if (create) {
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  aria-expanded={createOpen}
                  className="flex h-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold text-primary transition-colors"
                >
                  {content}
                </button>
              );
            }
            return (
              <Link
                key={label}
                to={to}
                aria-current={active ? "page" : undefined}
                className={`flex h-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold transition-colors ${
                  active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                }`}
              >
                {content}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
