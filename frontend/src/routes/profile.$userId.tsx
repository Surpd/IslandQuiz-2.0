import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, Grid3x3, Coins } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Avatar } from "@/components/avatar";
import { RatingStars } from "@/components/rating-stars";
import { getUserProfile, computeRatingStats, type PublicProfile } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { GameKind, StoredGame } from "@/lib/types";

export const Route = createFileRoute("/profile/$userId")({
  head: () => ({ meta: [{ title: "Профиль — IslandQuiz" }] }),
  component: PublicProfilePage,
});

const KIND_LABEL: Record<GameKind, string> = {
  quiz: "Квиз",
  jeopardy: "Своя игра",
  millionaire: "Миллионер",
};
const KIND_ICON: Record<GameKind, typeof FileText> = {
  quiz: FileText,
  jeopardy: Grid3x3,
  millionaire: Coins,
};

function titleOf(g: StoredGame): string {
  const d = g.data as { config?: { title?: string } };
  return d?.config?.title || `${KIND_LABEL[g.kind]} · ${g.id}`;
}

function PublicProfilePage() {
  const { userId } = Route.useParams();
  const { user } = useAuth();
  const [data, setData] = useState<PublicProfile | null | undefined>(undefined);

  useEffect(() => {
    getUserProfile(userId).then(setData);
  }, [userId]);

  if (data === undefined) {
    return (
      <div className="min-h-screen bg-surface">
        <SiteHeader />
        <div className="mx-auto max-w-4xl px-6 py-10">
          <div className="surface-card h-40 animate-pulse bg-surface-muted" />
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-surface">
        <SiteHeader />
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <h1 className="font-display text-2xl font-bold">Профиль не найден</h1>
          <Link to="/library" className="btn-accent mt-4 inline-flex">В библиотеку</Link>
        </div>
      </div>
    );
  }
  const isMe = user?.id === data.user.id;

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex items-center gap-4">
          <Avatar name={data.user.name} avatar={data.user.avatar} size={80} />
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-black">{data.user.name}</h1>
            {data.user.subject && (
              <p className="text-sm text-primary">{data.user.subject}</p>
            )}
            {data.user.bio && (
              <p className="mt-1 text-sm text-muted-foreground">{data.user.bio}</p>
            )}
            {isMe && (
              <Link to="/profile" className="mt-2 inline-flex text-xs font-semibold text-primary hover:underline">
                Редактировать профиль →
              </Link>
            )}
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="surface-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Игр создано</p>
            <p className="mt-1 font-display text-2xl font-black">{data.stats.gamesCount}</p>
          </div>
          <div className="surface-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Средний рейтинг</p>
            <div className="mt-1"><RatingStars value={data.stats.avgRating} count={data.stats.totalRatings} /></div>
          </div>
          <div className="surface-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Оценок получено</p>
            <p className="mt-1 font-display text-2xl font-black">{data.stats.totalRatings}</p>
          </div>
        </div>

        <h2 className="font-display mb-3 text-lg font-bold">
          {isMe ? "Мои игры" : "Публичные игры"}
        </h2>
        {data.games.length === 0 ? (
          <div className="surface-card grid place-items-center py-16 text-center text-sm text-muted-foreground">
            Здесь пока пусто.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.games.map((g) => {
              const Icon = KIND_ICON[g.kind];
              const { avg, count } = computeRatingStats(g);
              return (
                <Link
                  key={g.id}
                  to="/game/$id"
                  params={{ id: g.id }}
                  className="surface-card flex items-start gap-3 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-bold">{titleOf(g)}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{KIND_LABEL[g.kind]}</span>
                      {count > 0 && (
                        <>
                          <span>·</span>
                          <RatingStars value={avg} count={count} size={11} />
                        </>
                      )}
                    </div>
                    {g.tags && g.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {g.tags.slice(0, 3).map((t) => (
                          <span key={t} className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
