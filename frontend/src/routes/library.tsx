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
  Play,
  GitFork,
  Trophy,
  Pencil,
  Eye,
  Star,
  X,
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
import { Avatar } from "@/components/avatar";
import { GameContent, gameSummary } from "@/components/game-content";
import type { GameKind, QuizData, StoredGame } from "@/lib/types";
import { quizVariants, withSelectedQuizVariant } from "@/lib/quiz-variants";
import { safeCanonicalTag } from "@/lib/tags";
import { allowsGamePreview } from "@/lib/game-permissions";


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
  const [playedIds, setPlayedIds] = useState<Set<string>>(new Set());
  const [playModal, setPlayModal] = useState<{ id: string; kind: GameKind } | null>(null);
  const [previewGame, setPreviewGame] = useState<StoredGame | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"date" | "rating" | "plays">("date");


  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };

  const reload = () => {
    listGames(undefined, 100, 0)
      .then((data) => {
        const clean = data.games.filter((x) => {
          const d = x?.data as { config?: unknown } | undefined;
          return !!x && !!x.kind && !!d && !!d.config;
        });
        setGames(clean);
      })
      .catch((e) => setError(e?.message ?? "Не удалось загрузить"));
    if (user) {
      listPlayedGameIdsForUser().then(setPlayedIds);
    } else {
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
    const counts = new Map<string, { name: string; count: number }>();
    for (const g of tabFiltered) for (const t of g.tags ?? []) {
      const key = safeCanonicalTag(t);
      const current = counts.get(key);
      counts.set(key, { name: current?.name ?? t.replace(/\s+/g, " ").trim(), count: (current?.count ?? 0) + 1 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 12).map(({ name }) => name);
  }, [tabFiltered]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = tabFiltered.filter((g) => {
      const title = ((g.data as { config?: { title?: string } })?.config?.title ?? "").toLowerCase();
      const tagsLower = (g.tags ?? []).map((t) => safeCanonicalTag(t));
      const matchQ = !q || title.includes(q) || tagsLower.some((t) => t.includes(q));
      const matchTags = !selectedTags.length || selectedTags.every((t) => tagsLower.includes(safeCanonicalTag(t)));
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
      <main className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 sm:py-10 sm:pb-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
              <LibraryIcon className="h-3.5 w-3.5" /> Библиотека
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Игры</h1>
            <p className="mt-1 text-muted-foreground">
              {user ? "Кликните на карточку, чтобы открыть игру." : "Войдите, чтобы видеть свои игры."}
            </p>
          </div>
          <Link to="/builder/quiz" search={{ id: undefined }} className="btn-accent">
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

        

        <div className="mb-5 flex snap-x flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
          {tabs.map((t) => {
            const disabled = !user && (t.key === "my" || t.key === "added" || t.key === "played");
            return (
              <button
                key={t.key}
                disabled={disabled}
                onClick={() => nav({ to: "/library", search: { tab: t.key } })}
                className={`shrink-0 snap-start rounded-full px-3 py-1.5 text-sm font-semibold transition-colors sm:px-4 ${
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

        <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию или тегу…"
            className="input-base min-w-0"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "date" | "rating" | "plays")}
            aria-label="Сортировка игр"
            className="input-base w-[7.5rem] px-3 sm:w-auto"
          >
            <option value="date">По дате</option>
            <option value="rating">По рейтингу</option>
            <option value="plays">По прохождениям</option>
          </select>
        </div>

        {popularTags.length > 0 && (
          <div className="mb-6 flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
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
                      : "shrink-0 bg-surface-muted text-muted-foreground hover:bg-primary-soft hover:text-primary"
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
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
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
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {filtered.map((g) => (
              <GameCard
                key={`${g.kind}-${g.id}`}
                g={g}
                tab={activeTab}
                onPlay={() => setPlayModal({ id: g.id, kind: g.kind })}
                onPreview={() => setPreviewGame(g)}
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

      {previewGame && <LibraryGamePreview game={previewGame} onClose={() => setPreviewGame(null)} />}

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
  onPreview,
}: {
  g: StoredGame;
  tab: TabKey;
  onPlay: () => void;
  onPreview: () => void;
}) {
  const { user } = useAuth();
  const nav = useNavigate();
  const Icon = KIND_ICON[g.kind] ?? FileText;
  const VisIcon = g.visibility === "public" ? Globe : g.visibility === "link" ? Link2 : Lock;
  const isMine = !!user && g.ownerId === user.id;
  const ownerId = g.ownerId;

  const openPlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onPlay();
  };

  const editGame = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isMine) return;
    if (g.kind === "quiz") nav({ to: "/builder/quiz", search: { id: g.id } });
    if (g.kind === "jeopardy") nav({ to: "/builder/jeopardy", search: { id: g.id } });
    if (g.kind === "millionaire") nav({ to: "/builder/millionaire", search: { id: g.id } });
  };

  return (
    <Link
      to="/game/$id"
      params={{ id: g.id }}
      className="surface-card group relative flex flex-col gap-2 overflow-hidden p-3 transition-all hover:-translate-y-0.5 hover:shadow-lift md:gap-3 md:p-5"
    >
      <div className="flex items-center justify-between">
        <div
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider md:px-2.5 md:text-[11px] ${KIND_ACCENT[g.kind]}`}
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
      <h3 className="line-clamp-2 font-display text-base font-bold md:text-lg">{titleOf(g)}</h3>
      <p className="truncate text-xs text-muted-foreground">{gameSummary(g)}</p>
      {g.kind === "quiz" && quizVariants(g.data as QuizData).length >= 2 && <span className="self-start rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{quizVariants(g.data as QuizData).length} варианта</span>}
      {g.forkedOwnerName && (
        <p className="hidden truncate text-xs text-muted-foreground md:block">на основе игры от {g.forkedOwnerName}</p>
      )}
      {!isMine && g.ownerName && ownerId && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            nav({ to: "/profile/$userId", params: { userId: ownerId } });
          }}
          className="hidden items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-primary hover:underline md:inline-flex"
        >
          <Avatar
            name={g.ownerName}
            avatar={undefined}
            size={18}
          />
          от {g.ownerName}
        </button>
      )}
      {g.tags && g.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {g.tags.slice(0, 2).map((t) => (
            <span key={t} className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              #{t}
            </span>
          ))}
          {g.tags.length > 2 && (
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              +{g.tags.length - 2}
            </span>
          )}
        </div>
      )}
      {(() => {
        const { avg, count } = computeRatingStats(g);
        return count > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground" aria-label={`Рейтинг ${avg.toFixed(1)} из 5, ${count} оценок`}>
            <Star className="h-3.5 w-3.5 fill-amber text-amber" />
            {avg.toFixed(1)} <span className="font-normal opacity-70">({count})</span>
          </span>
        ) : null;
      })()}

      <div className="relative mt-auto flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5 md:gap-2 md:pt-3">
        <p className="mr-auto text-[11px] text-muted-foreground md:text-xs">
          {new Date(g.updatedAt).toLocaleDateString("ru-RU")}
        </p>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground md:text-xs" title="Количество прохождений">
          <Play className="h-3 w-3" /> {g.playCount ?? 0}
        </span>
        <button
          type="button"
          onClick={openPlay}
          className="inline-flex min-h-8 items-center gap-1 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
        >
          <Play className="h-3 w-3" /> Играть
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPreview();
          }}
          title="Просмотреть"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border-strong text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label={`Просмотреть ${titleOf(g)}`}
        >
          <Eye className="h-4 w-4" />
        </button>
        {isMine && (
          <button
            type="button"
            onClick={editGame}
            title="Редактировать"
            aria-label={`Редактировать ${titleOf(g)}`}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Pencil className="h-4 w-4" />
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

function LibraryGamePreview({ game, onClose }: { game: StoredGame; onClose: () => void }) {
  const { user } = useAuth();
  const privileged = !!user && (user.role === "admin" || user.id === game.ownerId);
  const previewAllowed = allowsGamePreview(game, privileged);
  const config = (game.data as { config?: { title?: string; description?: string } }).config;
  const variants = game.kind === "quiz" ? quizVariants(game.data as QuizData) : [];
  const [variantId, setVariantId] = useState(variants[0]?.id);
  const displayedGame = game.kind === "quiz" ? { ...game, data: withSelectedQuizVariant(game.data as QuizData, variantId) } : game;
  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-foreground/40 p-0 pb-[calc(4rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4 sm:pb-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Предпросмотр ${titleOf(game)}`}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] min-h-0 w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-lift sm:max-h-[90dvh] sm:max-w-3xl sm:rounded-3xl"
      >
        <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">{KIND_LABEL[game.kind]}</p>
            <h2 className="mt-1 break-words font-display text-xl font-bold">{config?.title || titleOf(game)}</h2>
            {config?.description && <p className="mt-1 text-sm text-muted-foreground">{config.description}</p>}
            {game.tags && game.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {game.tags.map((tag) => <span key={tag} className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">#{tag}</span>)}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть предпросмотр" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-surface-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {variants.length >= 2 && <label className="mb-3 block text-xs font-semibold text-muted-foreground">Вариант для просмотра<select className="input-base mt-1" value={variantId} onChange={(event) => setVariantId(event.target.value)}>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name} · {variant.questions.length} вопросов</option>)}</select></label>}
          <div className="mb-3 rounded-xl bg-surface-muted px-3 py-2 text-xs text-muted-foreground">
            {!previewAllowed
              ? "Автор не разрешил просмотр вопросов до игры. Запустить игру можно ниже на странице игры."
              : game.showAnswers
                ? "Ответы доступны согласно настройкам игры."
                : "Ответы скрыты настройками игры."}
          </div>
          {previewAllowed ? <GameContent game={displayedGame} withAnswers={!!game.showAnswers} /> : (
            <div className="rounded-2xl border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">
              Содержание вопросов скрыто настройками автора.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
