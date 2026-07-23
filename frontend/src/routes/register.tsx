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
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Я принимаю условия{" "}
              <Link to="/privacy" className="text-primary hover:underline" target="_blank">
                Политики конфиденциальности
              </Link>{" "}
              и даю согласие на обработку персональных данных
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