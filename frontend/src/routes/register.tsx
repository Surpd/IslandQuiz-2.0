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
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pwdError = password ? validatePassword(password) : null;
  const mismatch = password2.length > 0 && password !== password2;
  const canSubmit =
    !busy && name && email && password && password2 && !pwdError && !mismatch;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const v = validatePassword(password);
    if (v) return setErr(v);
    if (password !== password2) return setErr("Пароли не совпадают");
    setBusy(true);
    const r = await register(name, email, password);
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Не удалось зарегистрироваться");
    else nav({ to: "/library" });
  };

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-display text-3xl font-black">Регистрация</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Аккаунт нужен, чтобы сохранять свои игры и делиться ими.
        </p>
        <form onSubmit={onSubmit} className="surface-card mt-6 flex flex-col gap-3 p-6">
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
