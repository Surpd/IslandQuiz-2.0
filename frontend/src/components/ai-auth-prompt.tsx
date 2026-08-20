import { Link } from "@tanstack/react-router";
import { LogIn, UserPlus, X } from "lucide-react";

export function AIAuthPrompt({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-foreground/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Вход для AI"
    >
      <div className="w-full max-w-sm rounded-3xl bg-surface p-5 shadow-lift">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">Нужен аккаунт</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Для AI-генерации войдите или создайте аккаунт.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-lg p-1 text-muted-foreground hover:bg-surface-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Link to="/login" className="btn-accent justify-center">
            <LogIn className="h-4 w-4" /> Войти
          </Link>
          <Link to="/register" className="btn-ghost justify-center">
            <UserPlus className="h-4 w-4" /> Регистрация
          </Link>
        </div>
      </div>
    </div>
  );
}
