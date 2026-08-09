import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { SiteHeader } from "@/components/site-header";
import { PasswordInput } from "@/components/password-input";
import { useAuth } from "@/hooks/use-auth";


export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      {
        title: "Вход — IslandQuiz",
      },
    ],
  }),

  component: LoginPage,
});


const TELEGRAM_TOKEN_KEY = "telegram_token";
const AUTH_TOKEN_KEY = "islandquiz.token";


function LoginPage() {
  const nav = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [telegramBusy, setTelegramBusy] = useState(false);


  // ==========================================================
  // Telegram completion
  // ==========================================================

  useEffect(() => {
    const params = new URLSearchParams(
      window.location.search,
    );
  
    const telegramToken =
      params.get("telegram_token");
  
    if (!telegramToken) {
      return;
    }
  
    let cancelled = false;
  
    setTelegramBusy(true);
    setErr(null);
  
    finishTelegramToken(telegramToken)
      .catch((error) => {
        if (!cancelled) {
          setErr(
            error instanceof Error
              ? error.message
              : "Ошибка входа через Telegram",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTelegramBusy(false);
        }
      });
  
    return () => {
      cancelled = true;
    };
  }, []);


  // ==========================================================
  // Telegram token → JWT
  // ==========================================================

  async function finishTelegramToken(
    token: string,
  ) {
    const res = await fetch(
      `https://api.islandquiz.online/api/auth/telegram/complete?token=${encodeURIComponent(
        token,
      )}`,
      {
        method: "GET",
      },
    );
  
    const data =
      await res.json().catch(() => null);
  
    if (!res.ok || !data?.ok || !data?.token) {
      throw new Error(
        data?.detail ||
          "Недействительная ссылка Telegram",
      );
    }
  
    localStorage.setItem(
      AUTH_TOKEN_KEY,
      data.token,
    );
  
    window.history.replaceState(
      {},
      document.title,
      "/login",
    );
  
    nav({
      to: "/library",
    });
  }


  // ==========================================================
  // Email/password login
  // ==========================================================

  const onSubmit = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    setBusy(true);
    setErr(null);

    try {
      const r = await login(
        email,
        password,
      );

      if (!r.ok) {
        setErr(
          r.error ??
            "Не удалось войти",
        );

        return;
      }

      nav({
        to: "/library",
      });
    } finally {
      setBusy(false);
    }
  };


  // ==========================================================
  // Start Telegram login
  // ==========================================================

  const loginWithTelegram =
    async () => {
      setTelegramBusy(true);
      setErr(null);

      try {
        const res = await fetch(
          "https://api.islandquiz.online/api/auth/telegram/start",
          {
            method: "POST",
            credentials: "include",
          },
        );

        const data =
          await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(
            data.error ||
              data.detail ||
              "Не удалось войти через Telegram",
          );
        }

        window.location.href =
          data.url;
      } catch (error) {
        setErr(
          error instanceof Error
            ? error.message
            : "Ошибка соединения",
        );

        setTelegramBusy(false);
      }
    };


  // ==========================================================
  // UI
  // ==========================================================

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto w-full max-w-md px-4 py-8">
        <h1 className="text-2xl font-bold">
          Вход
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Если у вас ещё нет аккаунта,
          зарегистрируйтесь на отдельной странице.
        </p>


        {/* ====================================================
            Telegram Login
        ==================================================== */}

        <div className="surface-card mt-6 p-6 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            Быстрый вход
          </p>

          <button
            type="button"
            onClick={loginWithTelegram}
            disabled={telegramBusy}
            className="btn-ghost flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 transition-colors hover:bg-surface-muted disabled:opacity-50"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-[#2AABEE]"
            >
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.46-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.015-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.441-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.141.119.098.152.228.168.32.016.093.036.305.02.471z" />
            </svg>

            {telegramBusy
              ? "Открываем Telegram…"
              : "Войти через Telegram"}
          </button>
        </div>


        {/* ====================================================
            Separator
        ==================================================== */}

        <div className="my-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-border" />

          <span className="text-xs text-muted-foreground">
            или
          </span>

          <div className="h-px flex-1 bg-border" />
        </div>


        {/* ====================================================
            Email / password
        ==================================================== */}

        <form
          onSubmit={onSubmit}
          className="surface-card flex flex-col gap-3 p-6"
        >
          <label className="text-sm font-semibold">
            Email

            <input
              type="email"
              required
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
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
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                autoComplete="current-password"
              />
            </div>
          </label>


          {err && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {err}
            </p>
          )}


          <button
            type="submit"
            disabled={busy || telegramBusy}
            className="btn-accent justify-center py-3"
          >
            {busy
              ? "Входим…"
              : "Войти"}
          </button>
        </form>


        {/* ====================================================
            Forgot password
        ==================================================== */}

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link
            to="/forgot-password"
            className="font-semibold text-primary hover:underline"
          >
            Забыли пароль?
          </Link>
        </p>


        {/* ====================================================
            Register
        ==================================================== */}

        <p className="mt-2 text-center text-sm text-muted-foreground">
          Нет аккаунта?{" "}

          <Link
            to="/register"
            className="font-semibold text-primary hover:underline"
          >
            Зарегистрироваться
          </Link>
        </p>
      </main>
    </div>
  );
}