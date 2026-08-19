import { Link, useLocation } from "@tanstack/react-router";
import { Home, Library, Plus, UserRound } from "lucide-react";

const items = [
  { to: "/" as const, label: "Главная", Icon: Home, match: (path: string) => path === "/" },
  { to: "/library" as const, label: "Библиотека", Icon: Library, match: (path: string) => path.startsWith("/library") },
  { to: "/builder/quiz" as const, label: "Создать", Icon: Plus, match: (path: string) => path.startsWith("/builder") },
  { to: "/profile" as const, label: "Профиль", Icon: UserRound, match: (path: string) => path.startsWith("/profile") },
];

export function MobileBottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-18px_rgba(15,23,42,0.35)] backdrop-blur-md md:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-4 items-center gap-1">
        {items.map(({ to, label, Icon, match }) => {
          const active = match(pathname);
          const create = label === "Создать";
          return (
            <Link
              key={to}
              to={to}
              search={to === "/builder/quiz" ? { id: undefined } : undefined}
              aria-current={active ? "page" : undefined}
              className={`flex h-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold transition-colors ${
                create
                  ? "text-primary"
                  : active
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              }`}
            >
              <span
                className={`grid h-7 w-7 place-items-center rounded-full ${
                  create ? "bg-primary text-primary-foreground shadow-sm" : ""
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="truncate px-1">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
