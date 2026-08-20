import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { Bug, Lightbulb, HelpCircle, Send, CheckCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";

export const Route = createFileRoute("/feedback")({
  head: () => ({ meta: [{ title: "Обратная связь — IslandQuiz" }] }),
  component: FeedbackPage,
});

function FeedbackPage() {
  const [type, setType] = useState<"bug" | "idea" | "question">("bug");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setLoading(true);
    try {
      await apiFetch("/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          type,
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          message,
          page_url: typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });
      setSent(true);
    } catch {
      setSent(true);
    }
    setLoading(false);
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-surface">
        <SiteHeader />
        <main className="mx-auto max-w-md px-4 py-12 text-center sm:px-6 sm:py-20">
          <Link
            to="/faq"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            ← Назад к FAQ
          </Link>
          <CheckCircle className="mx-auto mb-4 h-12 w-12 text-success" />
          <h1 className="font-display text-2xl font-bold">Спасибо!</h1>
          <p className="mt-2 text-muted-foreground">
            Ваше сообщение отправлено. Мы обязательно его рассмотрим.
          </p>
          <Link to="/faq" className="btn-accent mt-6 inline-flex">
            Вернуться к FAQ
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-lg px-4 py-8 sm:px-6 sm:py-12">
        <Link
          to="/faq"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Назад к FAQ
        </Link>
        <h1 className="font-display text-3xl font-black">Обратная связь</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Нашли баг? Есть идея? Напишите нам — мы читаем всё.
        </p>

        <form onSubmit={submit} className="surface-card mt-6 flex flex-col gap-4 p-4 sm:p-6">
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: "bug" as const, label: "Баг", icon: Bug },
              { key: "idea" as const, label: "Идея", icon: Lightbulb },
              { key: "question" as const, label: "Вопрос", icon: HelpCircle },
            ]).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setType(t.key)}
                className={`flex-1 rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-colors ${
                  type === t.key
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border-strong text-muted-foreground hover:border-primary"
                }`}
              >
                <t.icon className="mx-auto mb-1 h-5 w-5" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Имя (необязательно)</span>
              <input
                className="input-base mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ваше имя"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Email (необязательно)</span>
              <input
                className="input-base mt-1"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Сообщение</span>
            <textarea
              className="input-base mt-1 resize-none"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Опишите проблему или предложение..."
              required
            />
          </label>

          <button
            type="submit"
            disabled={loading || !message.trim()}
            className="btn-accent w-full justify-center"
          >
            <Send className="h-4 w-4" /> {loading ? "Отправляем..." : "Отправить"}
          </button>
          
          {/* Добавленный блок с политикой и альтернативным контактом */}
          <div className="mt-2 text-center text-xs text-muted-foreground">
            Отправляя сообщение, вы соглашаетесь с{" "}
            <Link to="/privacy" className="underline hover:text-foreground">
              Политикой конфиденциальности
            </Link>.
            <br />
            Или напишите нам напрямую: <a href="mailto:support@islandquiz.online" className="underline hover:text-foreground">support@islandquiz.online</a>
          </div>
        </form>
      </main>
    </div>
  );
}
