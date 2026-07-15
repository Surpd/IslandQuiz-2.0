import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Play,
  Printer,
  FileSpreadsheet,
  Pencil,
  Trophy,
  Trash2,
  UserPlus,
  Lock,
  Link2,
  Globe,
  Check,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { PlayModal } from "@/components/play-modal";
import { RatingStars } from "@/components/rating-stars";
import { Avatar } from "@/components/avatar";
import { GameContent, gameSummary } from "@/components/game-content";
import { useAuth } from "@/hooks/use-auth";
import { findGame, deleteGame, saveGame, computeRatingStats, getMyRating, rateGame, setGameShowAnswers } from "@/lib/api";

import {
  exportQuizExcel,
  exportJeopardyExcel,
  exportMillionaireExcel,
  printQuiz,
  printJeopardy,
  printMillionaire,
} from "@/lib/exports";
import type {
  GameKind,
  GameVisibility,
  QuizData,
  JeopardyData,
  MillionaireData,
  StoredGame,
} from "@/lib/types";
import { findUserById } from "@/lib/auth";

export const Route = createFileRoute("/game/$id")({
  head: () => ({ meta: [{ title: "Дашборд игры — IslandQuiz" }] }),
  component: GameDashboard,
});

const KIND_LABEL: Record<GameKind, string> = {
  quiz: "Квиз",
  jeopardy: "Своя игра",
  millionaire: "Миллионер",
};

function titleOf(g: StoredGame): string {
  const d = g.data as Partial<QuizData> & { config?: { title?: string } };
  return d?.config?.title || `${KIND_LABEL[g.kind]} · ${g.id}`;
}

function GameDashboard() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user, forkGame, setGameVisibility } = useAuth();

  const [game, setGame] = useState<StoredGame | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [openPlay, setOpenPlay] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2000);
  };

  const reload = () => {
    findGame(id)
      .then((g) => setGame(g))
      .catch((e) => setError(e?.message ?? "Не удалось загрузить"));
  };

  useEffect(reload, [id]);

  const isMine = !!user && !!game && game.ownerId === user.id;
  const isPrivateOther =
    !!game && !isMine && game.ownerId && game.visibility !== "public";

  const doPrint = () => {
    if (!game) return;
    try {
      if (game.kind === "quiz") printQuiz(game.data as QuizData, { withAnswers: true });
      else if (game.kind === "jeopardy")
        printJeopardy(game.data as JeopardyData, { withAnswers: true });
      else printMillionaire(game.data as MillionaireData, { withAnswers: true });
    } catch {
      showToast("Ошибка печати");
    }
  };

  const doExport = () => {
    if (!game) return;
    try {
      if (game.kind === "quiz") exportQuizExcel(game.data as QuizData);
      else if (game.kind === "jeopardy") exportJeopardyExcel(game.data as JeopardyData);
      else exportMillionaireExcel(game.data as MillionaireData);
    } catch {
      showToast("Ошибка экспорта");
    }
  };

  const doDelete = async () => {
    if (!game) return;
    if (!confirm(`Удалить «${titleOf(game)}»?`)) return;
    try {
      await deleteGame(game.kind, game.id);
      navigate({ to: "/library" });
    } catch {
      showToast("Не удалось удалить");
    }
  };

  const doFork = async () => {
    if (!game) return;
    const r = await forkGame(game.id);
    if (r) {
      showToast("Игра добавлена в «Мои»");
      navigate({ to: "/game/$id", params: { id: r.id } });
    }
  };

  const changeVis = async (v: GameVisibility) => {
    if (!game) return;
    await setGameVisibility(game.id, v);
    reload();
  };

  const saveTitle = async () => {
    if (!game) return;
    const t = titleInput.trim();
    if (!t) {
      setEditingTitle(false);
      return;
    }
    const dataAny = game.data as { config?: { title?: string } };
    const newData = { ...dataAny, config: { ...(dataAny.config ?? {}), title: t } };
    await saveGame({ id: game.id, kind: game.kind, data: newData as never });
    setEditingTitle(false);
    reload();
  };

  if (game === undefined && !error) {
    return (
      <div className="min-h-screen bg-surface">
        <SiteHeader />
        <div className="mx-auto max-w-5xl px-6 py-12">
          <div className="surface-card h-64 animate-pulse bg-surface-muted" />
        </div>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="min-h-screen bg-surface">
        <SiteHeader />
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <h1 className="font-display text-2xl font-bold">Игра не найдена</h1>
          <p className="mt-2 text-muted-foreground">{error ?? "Возможно, она была удалена."}</p>
          <Link to="/library" className="btn-accent mt-4 inline-flex">
            В библиотеку
          </Link>
        </div>
      </div>
    );
  }

  const visOptions: Array<{ v: GameVisibility; label: string; Icon: typeof Lock }> = [
    { v: "private", label: "Только я", Icon: Lock },
    { v: "link", label: "По ссылке", Icon: Link2 },
    { v: "public", label: "Публичная", Icon: Globe },
  ];




  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link
          to="/library"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> В библиотеку
        </Link>

        <div className="mb-6">
          <div className="mb-2 inline-flex rounded-full bg-primary-soft px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
            {KIND_LABEL[game.kind]}
          </div>

          {isMine && editingTitle ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTitle();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="input-base font-display text-3xl font-black"
              />
              <button onClick={saveTitle} className="btn-accent">
                <Check className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <h1
              className={`font-display text-4xl font-black tracking-tight ${isMine ? "cursor-pointer hover:opacity-80" : ""}`}
              onClick={() => {
                if (isMine) {
                  setTitleInput(titleOf(game));
                  setEditingTitle(true);
                }
              }}
              title={isMine ? "Клик — изменить название" : undefined}
            >
              {titleOf(game)}
            </h1>
          )}

          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <span>Владелец:</span>
            {isMine ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                <Avatar name={user!.name} avatar={user!.avatar} size={22} /> Вы
              </span>
            ) : game.ownerId && game.ownerName ? (
              <Link
                to="/profile/$userId"
                params={{ userId: game.ownerId }}
                className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
              >
                <Avatar
                  name={game.ownerName}
                  avatar={findUserById(game.ownerId)?.avatar}
                  size={22}
                />
                {game.ownerName}
              </Link>
            ) : (
              <span>неизвестен</span>
            )}
          </div>
          {game.forkedOwnerName && (
            <p className="text-sm text-muted-foreground">
              На основе игры от {game.forkedOwnerName}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Обновлено: {new Date(game.updatedAt).toLocaleString("ru-RU")}
          </p>
          {game.tags && game.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {game.tags.map((t) => (
                <span key={t} className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  #{t}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {(() => {
              const { avg, count } = computeRatingStats(game);
              const my = getMyRating(game, user?.id);
              return (
                <>
                  <RatingStars value={avg} count={count} size={18} />
                  {user && !isMine && (
                    <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>Ваша оценка:</span>
                      <RatingStars
                        value={my ?? 0}
                        interactive
                        showCount={false}
                        onRate={async (n) => {
                          await rateGame(game.id, n);
                          reload();
                        }}
                        size={18}
                      />
                    </div>
                  )}
                  {!user && (
                    <Link to="/login" className="text-xs font-semibold text-primary hover:underline">
                      Войдите, чтобы оценить
                    </Link>
                  )}
                </>
              );
            })()}
          </div>

        </div>

        {/* Visibility (only for own games) */}
        {isMine && (
          <div className="surface-card mb-4 flex flex-wrap items-center gap-2 p-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Видимость:
            </span>
            {visOptions.map(({ v, label, Icon }) => (
              <button
                key={v}
                onClick={() => changeVis(v)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  game.visibility === v
                    ? "bg-foreground text-white"
                    : "bg-surface-muted text-muted-foreground hover:bg-border"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
            {game.visibility === "public" && (
              <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!!game.showAnswers}
                  onChange={async (e) => {
                    await setGameShowAnswers(game.id, e.target.checked);
                    reload();
                  }}
                />
                Показывать ответы в «Содержании»
              </label>
            )}
          </div>
        )}

        {/* Actions */}
        {isPrivateOther ? (
          <div className="surface-card p-8 text-center">
            <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 font-semibold">Игра недоступна</p>
            <p className="text-sm text-muted-foreground">Автор скрыл эту игру.</p>
          </div>
        ) : isMine ? (
          <div className="surface-card mb-6 flex flex-wrap gap-2 p-4">
            <button onClick={() => setOpenPlay(true)} className="btn-accent">
              <Play className="h-4 w-4" /> Играть
            </button>
            <a href={`/builder/${game.kind}?id=${game.id}`} className="btn-ghost">
              <Pencil className="h-4 w-4" /> Редактировать
            </a>
            <button onClick={doExport} className="btn-ghost">
              <FileSpreadsheet className="h-4 w-4" /> Экспорт
            </button>
            <button onClick={doPrint} className="btn-ghost">
              <Printer className="h-4 w-4" /> Печать
            </button>
            <button onClick={doDelete} className="btn-ghost ml-auto text-danger hover:bg-danger-soft">
              <Trash2 className="h-4 w-4" /> Удалить
            </button>
          </div>
        ) : (
          <div className="surface-card mb-6 flex flex-wrap gap-2 p-4">
            {user ? (
              <button onClick={doFork} className="btn-accent">
                <UserPlus className="h-4 w-4" /> Добавить себе
              </button>
            ) : (
              <Link to="/login" className="btn-ghost">
                Войдите, чтобы добавить
              </Link>
            )}
            <button onClick={() => setOpenPlay(true)} className="btn-ghost">
              <Play className="h-4 w-4" /> Играть
            </button>
          </div>
        )}

        {/* Results (owner) vs Content (foreign) */}
        {!isPrivateOther && (
          isMine ? (
            <div className="surface-card p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-base font-bold">Результаты прохождений</h2>
                  <p className="text-sm text-muted-foreground">
                    Вся статистика, ответы и таблицы лидеров.
                  </p>
                </div>
                <Link
                  to={`/${game.kind}/${game.id}/results`}
                  className="btn-accent inline-flex items-center gap-2"
                >
                  <Trophy className="h-4 w-4" /> Открыть результаты
                </Link>
              </div>
            </div>

          ) : (
            <div className="surface-card p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold">Содержание</h2>
                  <p className="text-sm text-muted-foreground">
                    {gameSummary(game)}
                    {!game.showAnswers && " · ответы скрыты автором"}
                  </p>
                </div>
              </div>
              <GameContent game={game} withAnswers={!!game.showAnswers} />
            </div>
          )
        )}
      </main>

      {openPlay && (
        <PlayModal gameId={game.id} kind={game.kind} onClose={() => setOpenPlay(false)} />
      )}

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-white shadow-lift">
          {toast}
        </div>
      )}
    </div>
  );
}
