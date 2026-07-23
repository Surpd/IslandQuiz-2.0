import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Heart, Send, Coffee } from "lucide-react";

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
          <a
            href="https://boosty.to/Surprisedi"
            target="_blank"
            rel="noopener noreferrer"
            className="surface-card flex items-center gap-4 p-5 text-left hover:border-primary transition-colors"
          >
            <Coffee className="h-8 w-8 text-amber" />
            <div>
              <div className="font-bold">Boosty</div>
              <div className="text-sm text-muted-foreground">Подписка или разовый донат. Карта, СБП.</div>
            </div>
          </a>

          <a
            href="https://t.me/Surprisedi"
            target="_blank"
            rel="noopener noreferrer"
            className="surface-card flex items-center gap-4 p-5 text-left hover:border-primary transition-colors"
          >
            <Send className="h-8 w-8 text-primary" />
            <div>
              <div className="font-bold">Telegram</div>
              <div className="text-sm text-muted-foreground">Напишите мне лично — скину реквизиты.</div>
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