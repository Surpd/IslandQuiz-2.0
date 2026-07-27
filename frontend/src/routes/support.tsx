import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Heart, Wallet } from "lucide-react";

export const Route = createFileRoute("/support")({
  head: () => ({ meta: [{ title: "Поддержать — IslandQuiz" }] }),
  component: SupportPage,
});

function SupportPage() {
  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <Heart className="mx-auto mb-4 h-12 w-12 text-accent" />
        <h1 className="font-display text-3xl font-black">Поддержать проект</h1>
        <p className="mt-3 text-muted-foreground">
          IslandQuiz создаётся одним человеком. Если вам нравится платформа — поддержите её развитие.
        </p>

        <div className="mt-8 grid gap-4">
          {/* CloudTips / Чаевые */}
          <a
            href=""
            target="_blank"
            rel="noopener noreferrer"
            className="surface-card flex items-center gap-4 p-5 text-left hover:border-primary transition-colors"
          >
            <Wallet className="h-8 w-8 text-emerald-500 shrink-0" />
            <div>
              <div className="font-bold">Разовый донат (СБП / Карта)</div>
              <div className="text-sm text-muted-foreground">
                Быстрый перевод через CloudTips в пару кликов без регистрации.
              </div>
            </div>
          </a>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Спасибо за любую поддержку! Это мотивирует продолжать.
        </p>

        <Link to="/" className="btn-ghost mt-6 inline-flex">
          На главную
        </Link>
      </main>
    </div>
  );
}