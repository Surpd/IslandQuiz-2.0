import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { PasswordInput, validatePassword } from "@/components/password-input";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Регистрация — IslandQuiz" }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const nav = useNavigate();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pwdError = password ? validatePassword(password) : null;
  const mismatch = password2.length > 0 && password !== password2;
  const canSubmit =
    !busy && name && email && password && password2 && !pwdError && !mismatch && agreed;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await register(name, email, password);
      if (!r.ok) setErr(r.error ?? "Не удалось зарегистрироваться");
      else nav({ to: "/library" });
    } catch {
      setErr("Не удалось соединиться с сервером");
    } finally {
      setBusy(false);
    }
  };

  const loginWithTelegram = async () => {
    const telegramWindow = window.open("about:blank", "_blank");
    try {
      const res = await fetch("https://api.islandquiz.online/api/auth/telegram/start", {
        method: "POST",
      });
      const data = await res.json();
      if (data.ok) {
        if (telegramWindow) telegramWindow.location.href = data.url;
        else window.location.href = data.url;
      }
      else setErr(data.error || "Не удалось войти через Telegram");
    } catch {
      setErr("Ошибка соединения");
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-display text-3xl font-black">Регистрация</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Аккаунт нужен, чтобы сохранять свои игры и делиться ими.
        </p>

        {/* Telegram Login */}
        <div className="surface-card mt-6 p-6 text-center">
          <p className="text-sm text-muted-foreground mb-4">Быстрая регистрация</p>
          <button
            type="button"
            onClick={loginWithTelegram}
            className="btn-ghost w-full flex items-center justify-center gap-2 py-3 border border-border rounded-xl hover:bg-surface-muted transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[#2AABEE]">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.46-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.015-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.441-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.141.119.098.152.228.168.32.016.093.036.305.02.471z"/>
            </svg>
            Войти через Telegram
          </button>
        </div>

        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-border"></div>
          <span className="text-xs text-muted-foreground">или</span>
          <div className="flex-1 h-px bg-border"></div>
        </div>

        <form onSubmit={onSubmit} className="surface-card flex flex-col gap-3 p-6">
          <label className="text-sm font-semibold">
            Имя
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-base mt-1 w-full"
              autoComplete="name"
            />
          </label>
          <label className="text-sm font-semibold">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-base mt-1 w-full"
              autoComplete="email"
            />
          </label>
          <label className="text-sm font-semibold">
            Пароль
            <div className="mt-1">
              <PasswordInput
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {pwdError && (
              <span className="mt-1 block text-xs font-normal text-danger">{pwdError}</span>
            )}
          </label>
          <label className="text-sm font-semibold">
            Повторите пароль
            <div className="mt-1">
              <PasswordInput
                required
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {mismatch && (
              <span className="mt-1 block text-xs font-normal text-danger">
                Пароли не совпадают
              </span>
            )}
          </label>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Я принимаю{" "}
              <Link to="/terms" className="text-primary hover:underline" target="_blank">
                Пользовательское соглашение
              </Link>{" "}
              и{" "}
              <Link to="/privacy" className="text-primary hover:underline" target="_blank">
                Политику конфиденциальности
              </Link>
              , даю согласие на обработку персональных данных
            </span>
          </label>
          {err && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{err}</p>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            className="btn-accent justify-center py-3 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Создаём…" : "Зарегистрироваться"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Уже есть аккаунт?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Войти
          </Link>
        </p>
      </main>
    </div>
  );
}
