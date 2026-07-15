import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, User as UserIcon, Library as LibraryIcon, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "./avatar";
import { useAuth } from "@/hooks/use-auth";

function LogoMark() {
  return (
    <span className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary font-display text-[13px] font-black tracking-tight text-primary-foreground">
        IQ
      </span>
      <span className="font-display text-lg font-bold tracking-tight">IslandQuiz</span>
    </span>
  );
}

const logoNavItems = [
  { to: "/builder/quiz" as const, label: "Квиз" },
  { to: "/builder/jeopardy" as const, label: "Своя игра" },
  { to: "/builder/millionaire" as const, label: "Миллионер" },
  { to: "/library" as const, label: "Библиотека" },
  { to: "/join" as const, label: "Присоединиться" },
];

export function LogoMenu() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [logoOpen, setLogoOpen] = useState(false);
  const logoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (logoRef.current && !logoRef.current.contains(e.target as Node)) setLogoOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={logoRef} className="relative">
      <button
        type="button"
        onClick={() => setLogoOpen((v) => !v)}
        aria-expanded={logoOpen}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-lg px-1 py-1 hover:bg-surface-muted"
      >
        <LogoMark />
        <ChevronDown className={`h-4 w-4 opacity-60 transition-transform ${logoOpen ? "rotate-180" : ""}`} />
      </button>
      {logoOpen && (
        <div className="absolute left-0 top-full z-40 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-surface shadow-lift md:w-56">
          <Link
            to="/"
            onClick={() => setLogoOpen(false)}
            className={`block px-3 py-2 text-sm hover:bg-surface-muted ${pathname === "/" ? "font-semibold text-primary" : ""}`}
          >
            Главная
          </Link>
          <div className="border-t border-border" />
          {logoNavItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setLogoOpen(false)}
              className={`block px-3 py-2 text-sm hover:bg-surface-muted ${pathname === item.to ? "font-semibold text-primary" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 w-full border-b border-border bg-white/80 backdrop-blur-md ${compact ? "" : ""}`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-6">
        <LogoMenu />

        <nav className="hidden gap-6 md:flex">
          <Link to="/library" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
            Библиотека
          </Link>
          <Link to="/builder/quiz" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
            Квиз
          </Link>
          <Link to="/builder/jeopardy" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
            Своя игра
          </Link>
          <Link to="/builder/millionaire" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
            Миллионер
          </Link>
          <Link to="/join" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
            Присоединиться
          </Link>
        </nav>

        {user ? (
          <div ref={menuRef} className="relative z-50">
            <button
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2 py-1.5 text-sm font-semibold hover:bg-surface-muted"
            >
              <Avatar name={user.name} avatar={user.avatar} size={26} />
              <span className="max-w-[8ch] truncate sm:max-w-[12ch]">{user.name}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
            {open && (
              <div className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-xl border border-border bg-surface shadow-lift">
                <Link
                  to="/library"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted"
                >
                  <LibraryIcon className="h-4 w-4 text-primary" /> Мои игры
                </Link>
                <Link
                  to="/profile"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted"
                >
                  <UserIcon className="h-4 w-4 text-primary" /> Профиль
                </Link>
                <button
                  onClick={async () => {
                    setOpen(false);
                    await logout();
                    nav({ to: "/" });
                  }}
                  className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft"
                >
                  <LogOut className="h-4 w-4" /> Выйти
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link
            to="/login"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-105 active:scale-95"
          >
            Войти
          </Link>
        )}
      </div>
    </header>
  );
}
