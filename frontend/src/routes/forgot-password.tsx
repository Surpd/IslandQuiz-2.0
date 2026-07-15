import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { forgotPassword } from "@/lib/api";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Восстановление пароля — IslandQuiz" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await forgotPassword(email);
    setBusy(false);
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-display text-3xl font-black">Забыли пароль?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Укажите email — отправим ссылку для сброса пароля.
        </p>
        {sent ? (
          <div className="surface-card mt-6 flex flex-col gap-3 p-6">
            <p className="text-sm">
              Проверьте почту <span className="font-semibold">{email}</span> — мы отправили инструкцию по восстановлению пароля.
            </p>
            <Link to="/login" className="btn-accent justify-center py-3">
              Вернуться ко входу
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="surface-card mt-6 flex flex-col gap-3 p-6">
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
            <button type="submit" disabled={busy} className="btn-accent justify-center py-3">
              {busy ? "Отправляем…" : "Отправить инструкцию"}
            </button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Вспомнили пароль?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Войти
          </Link>
        </p>
      </main>
    </div>
  );
}
