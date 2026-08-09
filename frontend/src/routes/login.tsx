import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { SiteHeader } from "@/components/site-header";
import { PasswordInput } from "@/components/password-input";
import { useAuth } from "@/hooks/use-auth";


export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Вход — IslandQuiz" }] }),
  component: LoginPage,
});

function TelegramLoginButton({ onError }: { onError: (msg: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", "IslandQuizbot");
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    
    (window as any).onTelegramAuth = async (tgUser: any) => {
      try {
        const res = await fetch("https://api.islandquiz.online/api/auth/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tgUser),
        });
        const data = await res.json();
        if (data.ok && data.token) {
          localStorage.setItem("islandquiz.token", data.token);
          window.location.href = "/library";
        } else {
          onError(data.error || "Не удалось войти через Telegram");
        }
      } catch {
        onError("Ошибка соединения");
      }
    };

    containerRef.current?.appendChild(script);

    return () => {
      delete (window as any).onTelegramAuth;
    };
  }, [onError]);

  return <div ref={containerRef} id="telegram-login-container" />;
}

function LoginPage() {
  const nav = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await login(email, password);
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Не удалось войти");
    else nav({ to: "/library" });
  };

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="font-display text-3xl font-black">Вход</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Если у вас ещё нет аккаунта, зарегистрируйтесь на отдельной странице.
        </p>

        {/* Telegram Login Widget */}
        <div className="surface-card mt-6 p-6 text-center">
          <p className="text-sm text-muted-foreground mb-4">Быстрый вход</p>
          <TelegramLoginButton onError={(e) => setErr(e)} />
        </div>

        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-border"></div>
          <span className="text-xs text-muted-foreground">или</span>
          <div className="flex-1 h-px bg-border"></div>
        </div>

        <form onSubmit={onSubmit} className="surface-card flex flex-col gap-3 p-6">
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
                autoComplete="current-password"
              />
            </div>
          </label>
          {err && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{err}</p>
          )}
          <button type="submit" disabled={busy} className="btn-accent justify-center py-3">
            {busy ? "Входим…" : "Войти"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link to="/forgot-password" className="font-semibold text-primary hover:underline">
            Забыли пароль?
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Нет аккаунта?{" "}
          <Link to="/register" className="font-semibold text-primary hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </main>
    </div>
  );
}