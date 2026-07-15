import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Library as LibraryIcon,
  Plus,
  Sparkles,
  FileText,
  Grid3x3,
  Coins,
  Globe,
  Lock,
  Link2,
  UserPlus,
  Play,
  GitFork,
  Trophy,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { PlayModal } from "@/components/play-modal";
import {
  listGames,
  bindOrphanGames,
  countOrphanGames,
  listPlayedGameIdsForUser,
  computeRatingStats,
} from "@/lib/api";
import { cleanupInvalidGames } from "@/lib/storage";
import { useAuth } from "@/hooks/use-auth";
import { RatingStars } from "@/components/rating-stars";
import { Avatar } from "@/components/avatar";
import { gameSummary } from "@/components/game-content";
import { findUserById } from "@/lib/auth";
import type { GameKind, QuizData, StoredGame } from "@/lib/types";


type TabKey = "my" | "public" | "added" | "played";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Библиотека — IslandQuiz" },
      { name: "description", content: "Ваши квизы, «Своя игра» и «Миллионер»." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { tab?: TabKey } => {
    const t = s.tab;
    return t === "my" || t === "public" || t === "added" || t === "played" ? { tab: t } : {};
  },
  component: LibraryPage,
});

const KIND_LABEL: Record<GameKind, string> = {
  quiz: "Квиз",
  jeopardy: "Своя игра",
  millionaire: "Миллионер",
};

const KIND_ACCENT: Record<GameKind, string> = {
  quiz: "bg-primary-soft text-primary",
  jeopardy: "bg-amber-soft text-amber",
  millionaire: "bg-success-soft text-success",
};

const KIND_ICON: Record<GameKind, typeof FileText> = {
  quiz: FileText,
  jeopardy: Grid3x3,
  millionaire: Coins,
};

function titleOf(g: StoredGame): string {
  const d = g.data as Partial<QuizData> & { config?: { title?: string } };
  return d?.config?.title || `${KIND_LABEL[g.kind]} · ${g.id}`;
}

function LibraryPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { tab } = useSearch({ from: "/library" });
  const activeTab: TabKey = tab ?? (user ? "my" : "public");
  const [games, setGames] = useState<StoredGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orphanCount, setOrphanCount] = useState(0);
  const [playedIds, setPlayedIds] = useState<Set<string>>(new Set());
  const [playModal, setPlayModal] = useState<{ id: string; kind: GameKind } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"date" | "rating" | "plays">("date");


  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };

  const reload = () => {
    try { cleanupInvalidGames(); } catch { /* ignore */ }
    listGames()
      .then((g) => {
        const clean = g.filter((x) => {
          const d = x?.data as { config?: unknown } | undefined;
          return !!x && !!x.kind && !!d && !!d.config;
        });
        setGames(clean);
      })
      .catch((e) => setError(e?.message ?? "Не удалось загрузить"));
    if (user) {
      setOrphanCount(countOrphanGames());
      listPlayedGameIdsForUser(user.id).then(setPlayedIds);
    } else {
      setOrphanCount(0);
      setPlayedIds(new Set());
    }
  };

  useEffect(reload, [user]);

  const tabFiltered = useMemo(() => {
    if (!games) return [];
    switch (activeTab) {
      case "my":
        return user ? games.filter((g) => g.ownerId === user.id) : [];
      case "public":
        return games.filter((g) => g.visibility === "public" && g.ownerId !== user?.id);
      case "added":
        return user
          ? games.filter((g) => g.ownerId === user.id && g.forkedFrom)
          : [];
      case "played":
        return games.filter((g) => playedIds.has(g.id));
    }
  }, [games, activeTab, user, playedIds]);

  const popularTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of tabFiltered) for (const t of g.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t);
  }, [tabFiltered]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = tabFiltered.filter((g) => {
      const title = ((g.data as { config?: { title?: string } })?.config?.title ?? "").toLowerCase();
      const tagsLower = (g.tags ?? []).map((t) => t.toLowerCase());
      const matchQ = !q || title.includes(q) || tagsLower.some((t) => t.includes(q));
      const matchTags = !selectedTags.length || selectedTags.every((t) => tagsLower.includes(t.toLowerCase()));
      return matchQ && matchTags;
    });
    if (sortBy === "rating") {
      list = [...list].sort((a, b) => computeRatingStats(b).avg - computeRatingStats(a).avg);
    } else if (sortBy === "plays") {
      list = [...list].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
    } else {
      list = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return list;
  }, [tabFiltered, search, selectedTags, sortBy]);


  const onBind = async () => {
    const n = await bindOrphanGames();
    showToast(`Привязано игр: ${n}`);
    reload();
  };

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "my", label: "Мои" },
    { key: "public", label: "Публичные" },
    { key: "added", label: "Добавленные" },
    { key: "played", label: "Пройденные" },
  ];

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
              <LibraryIcon className="h-3.5 w-3.5" /> Библиотека
            </div>
            <h1 className="font-display text-4xl font-bold tracking-tight">Игры</h1>
            <p className="mt-1 text-muted-foreground">
              {user ? "Кликните на карточку, чтобы открыть игру." : "Войдите, чтобы видеть свои игры."}
            </p>
          </div>
          <Link to="/builder/quiz" className="btn-accent">
            <Plus className="h-4 w-4" /> Новый квиз
          </Link>
        </div>

        {!user && (
          <div className="mb-6 rounded-2xl border border-primary/30 bg-primary-soft px-4 py-3 text-sm">
            Войдите, чтобы создавать свои игры и видеть пройденные.{" "}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Войти
            </Link>
          </div>
        )}

        {user && orphanCount > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-amber/30 bg-amber-soft px-4 py-3 text-sm">
            <span>
              У вас есть <b>{orphanCount}</b> анонимных игр. Привязать к аккаунту?
            </span>
            <button onClick={onBind} className="btn-accent ml-auto">
              Привязать
            </button>
          </div>
        )}

        <div className="mb-6 flex flex-wrap gap-2">
          {tabs.map((t) => {
            const disabled = !user && (t.key === "my" || t.key === "added" || t.key === "played");
            return (
              <button
                key={t.key}
                disabled={disabled}
                onClick={() => nav({ to: "/library", search: { tab: t.key } })}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                  activeTab === t.key
                    ? "bg-foreground text-white"
                    : "bg-surface-muted text-muted-foreground hover:bg-border"
                } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию или тегу…"
            className="input-base min-w-[220px] flex-1"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "date" | "rating" | "plays")}
            className="input-base w-auto"
          >
            <option value="date">По дате</option>
            <option value="rating">По рейтингу</option>
            <option value="plays">По прохождениям</option>
          </select>
        </div>

        {popularTags.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-1.5">
            {popularTags.map((t) => {
              const active = selectedTags.includes(t);
              return (
                <button
                  key={t}
                  onClick={() =>
                    setSelectedTags((prev) => (active ? prev.filter((x) => x !== t) : [...prev, t]))
                  }
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-primary text-white"
                      : "bg-surface-muted text-muted-foreground hover:bg-primary-soft hover:text-primary"
                  }`}
                >
                  #{t}
                </button>
              );
            })}
            {(selectedTags.length > 0 || search) && (
              <button
                onClick={() => { setSelectedTags([]); setSearch(""); }}
                className="ml-1 text-xs font-semibold text-muted-foreground underline hover:text-foreground"
              >
                Сбросить
              </button>
            )}
          </div>
        )}


        {error && (
          <div className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div>
        )}

        {games === null && !error ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="surface-card h-40 animate-pulse bg-surface-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="surface-card grid place-items-center py-20 text-center">
            <Sparkles className="mb-3 h-8 w-8 text-primary" />
            <h3 className="font-display text-xl font-bold">Пусто</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeTab === "public"
                ? "Публичных игр пока нет."
                : activeTab === "added"
                  ? "Добавьте себе понравившуюся публичную игру."
                  : activeTab === "played"
                    ? "Сыграйте в любую игру — она появится здесь."
                    : "Создайте первую игру в конструкторе."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((g) => (
              <GameCard
                key={`${g.kind}-${g.id}`}
                g={g}
                tab={activeTab}
                onPlay={() => setPlayModal({ id: g.id, kind: g.kind })}
                onForked={() => {
                  showToast("Игра добавлена в «Мои»");
                  reload();
                }}
              />
            ))}
          </div>
        )}
      </main>

      {playModal && (
        <PlayModal
          gameId={playModal.id}
          kind={playModal.kind}
          onClose={() => setPlayModal(null)}
        />
      )}

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-white shadow-lift">
          {toast}
        </div>
      )}
    </div>
  );
}

function GameCard({
  g,
  tab,
  onPlay,
  onForked,
}: {
  g: StoredGame;
  tab: TabKey;
  onPlay: () => void;
  onForked: () => void;
}) {
  const { user, forkGame } = useAuth();
  const nav = useNavigate();
  const Icon = KIND_ICON[g.kind] ?? FileText;
  const VisIcon = g.visibility === "public" ? Globe : g.visibility === "link" ? Link2 : Lock;
  const isMine = user && g.ownerId === user.id;

  const doFork = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await forkGame(g.id);
    onForked();
  };

  const openPlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onPlay();
  };

  return (
    <Link
      to="/game/$id"
      params={{ id: g.id }}
      className="surface-card group relative flex flex-col gap-3 overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="flex items-center justify-between">
        <div
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${KIND_ACCENT[g.kind]}`}
        >
          <Icon className="h-3 w-3" />
          {KIND_LABEL[g.kind]}
        </div>
        {isMine && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
            title={g.visibility}
          >
            <VisIcon className="h-3 w-3" />
          </span>
        )}
      </div>
      <h3 className="line-clamp-2 font-display text-lg font-bold">{titleOf(g)}</h3>
      <p className="text-xs text-muted-foreground">{gameSummary(g)}</p>
      {g.forkedOwnerName && (
        <p className="text-xs text-muted-foreground">на основе игры от {g.forkedOwnerName}</p>
      )}
      {!isMine && g.ownerName && g.ownerId && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            nav({ to: "/profile/$userId", params: { userId: g.ownerId } });
          }}
          className="inline-flex items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-primary hover:underline"
        >
          <Avatar
            name={g.ownerName}
            avatar={findUserById(g.ownerId)?.avatar}
            size={18}
          />
          от {g.ownerName}
        </button>
      )}
      {g.tags && g.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {g.tags.slice(0, 4).map((t) => (
            <span key={t} className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              #{t}
            </span>
          ))}
        </div>
      )}
      {(() => {
        const { avg, count } = computeRatingStats(g);
        return count > 0 ? <RatingStars value={avg} count={count} size={12} /> : null;
      })()}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          {new Date(g.updatedAt).toLocaleDateString("ru-RU")}
        </p>
        {tab === "public" && user && (
          <button
            onClick={doFork}
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
          >
            <UserPlus className="h-3 w-3" /> Добавить
          </button>
        )}
        {(tab === "public" || tab === "played") && (
          <button
            onClick={openPlay}
            className="inline-flex items-center gap-1 rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
          >
            <Play className="h-3 w-3" /> Играть
          </button>
        )}
        {tab === "played" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success">
            <Trophy className="h-3 w-3" /> сыграно
          </span>
        )}
        {tab === "added" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 text-[10px] font-semibold text-amber">
            <GitFork className="h-3 w-3" /> копия
          </span>
        )}
      </div>
    </Link>
  );
}
