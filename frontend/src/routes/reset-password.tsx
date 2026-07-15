import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { PasswordInput, validatePassword } from "@/components/password-input";
import { resetPassword } from "@/lib/api";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Новый пароль — IslandQuiz" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const pwdError = pwd ? validatePassword(pwd) : null;
  const mismatch = pwd2.length > 0 && pwd !== pwd2;
  const canSubmit = !busy && pwd && pwd2 && !pwdError && !mismatch;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const v = validatePassword(pwd);
    if (v) return setErr(v);
    if (pwd !== pwd2) return setErr("Пароли не совпадают");
    setBusy(true);
    const r = await resetPassword(token, pwd);
    setBusy(false);
    if (r.ok) setDone(true);
    else setErr("Не удалось изменить пароль");
  };

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-display text-3xl font-black">Новый пароль</h1>
        {done ? (
          <div className="surface-card mt-6 flex flex-col gap-3 p-6">
            <p className="text-sm">Пароль изменён!</p>
            <Link to="/login" className="btn-accent justify-center py-3">
              Войти
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="surface-card mt-6 flex flex-col gap-3 p-6">
            <label className="text-sm font-semibold">
              Новый пароль
              <div className="mt-1">
                <PasswordInput
                  required
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
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
                  value={pwd2}
                  onChange={(e) => setPwd2(e.target.value)}
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
              {busy ? "Сохраняем…" : "Изменить пароль"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
