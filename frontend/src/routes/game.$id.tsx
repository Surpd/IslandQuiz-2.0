import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Play,
  Printer,
  FileText,
  FileSpreadsheet,
  Pencil,
  Trophy,
  Trash2,
  UserPlus,
  Lock,
  Link2,
  Globe,
  Check,
  Copy,
  MoreHorizontal,
  Share2,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { PlayModal } from "@/components/play-modal";
import { RatingStars } from "@/components/rating-stars";
import { Avatar } from "@/components/avatar";
import { GameContent, gameSummary } from "@/components/game-content";
import { useAuth } from "@/hooks/use-auth";
import { findGame, getGamePreview, deleteGame, saveGame, computeRatingStats, getMyRating, rateGame, setGameShowAnswers } from "@/lib/api";

import {
  exportQuizExcel,
  exportJeopardyExcel,
  exportMillionaireExcel,
  downloadQuizPdf,
  downloadJeopardyPdf,
  downloadMillionairePdf,
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
import { PRIMARY_VARIANT_ID, quizVariants, withSelectedQuizVariant } from "@/lib/quiz-variants";
import { allowsGameCopy, allowsGamePreview } from "@/lib/game-permissions";


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
  const [previewGame, setPreviewGame] = useState<StoredGame | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [openPlay, setOpenPlay] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [variantId, setVariantId] = useState(PRIMARY_VARIANT_ID);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2000);
  };

  const reload = () => {
    findGame(id)
      .then((g) => {
        setGame(g);
        if (!g || (user && g.ownerId === user.id) || user?.role === "admin") {
          setPreviewGame(g);
          return;
        }
        setPreviewGame(undefined);
        void getGamePreview(id).then(setPreviewGame);
      })
      .catch((e) => setError(e?.message ?? "Не удалось загрузить"));
  };

  useEffect(reload, [id, user?.id, user?.role]);

  const isMine = !!user && !!game && game.ownerId === user.id;
  const isPrivileged = !!user && (isMine || user.role === "admin");
  const previewAllowed = !!game && allowsGamePreview(game, isPrivileged);
  const copyAllowed = !!game && allowsGameCopy(game, isPrivileged);
  const isPrivateOther =
    !!game && !isMine && game.ownerId && game.visibility !== "public";

  const doPrint = () => {
    if (!game) return;
    try {
      if (game.kind === "quiz") printQuiz(withSelectedQuizVariant(game.data as QuizData, variantId), { withAnswers: true, variantLabel: quizVariants(game.data as QuizData).length >= 2 ? quizVariants(game.data as QuizData).find((variant) => variant.id === variantId)?.name : undefined });
      else if (game.kind === "jeopardy")
        printJeopardy(game.data as JeopardyData, { withAnswers: true });
      else printMillionaire(game.data as MillionaireData, { withAnswers: true });
    } catch {
      showToast("Ошибка печати");
    }
  };

  const doDownloadPdf = async () => {
    if (!game) return;
    try {
      if (game.kind === "quiz")
        await downloadQuizPdf(withSelectedQuizVariant(game.data as QuizData, variantId), { withAnswers: true, variantLabel: quizVariants(game.data as QuizData).length >= 2 ? quizVariants(game.data as QuizData).find((variant) => variant.id === variantId)?.name : undefined });
      else if (game.kind === "jeopardy")
        await downloadJeopardyPdf(game.data as JeopardyData, { withAnswers: true });
      else await downloadMillionairePdf(game.data as MillionaireData, { withAnswers: true });
    } catch {
      showToast("Ошибка экспорта PDF");
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
    } else {
      showToast("Не удалось создать копию");
    }
  };

  const shareGame = async () => {
    if (!game) return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: titleOf(game), url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        showToast("Ссылка скопирована");
      }
    } catch {
      // Sharing can be cancelled by the user; keep the page state unchanged.
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
  const description = (game.data as { config?: { description?: string } }).config?.description;




  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Link
            to="/library"
            className="inline-flex min-h-9 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> В библиотеку
          </Link>
          <div className="flex items-center gap-1 md:hidden">
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              aria-label="Экспорт и поделиться"
              className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-surface-muted"
            >
              <Share2 className="h-4 w-4" />
            </button>
            {isMine && (
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-label="Дополнительные действия"
                className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-surface-muted"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

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
                    avatar={undefined}
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
          {description && <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground">{description}</p>}
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
            <div className="hidden flex-wrap gap-2 md:flex">
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
            </div>
            <div className="flex rounded-xl border border-border bg-background p-0.5 md:hidden" role="group" aria-label="Видимость игры">
              <button
                type="button"
                onClick={() => changeVis("private")}
                aria-pressed={game.visibility === "private"}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${game.visibility === "private" ? "bg-primary-soft text-primary" : "text-muted-foreground"}`}
              >
                <Lock className="h-3.5 w-3.5" /> Приватная
              </button>
              <button
                type="button"
                onClick={() => changeVis("public")}
                aria-pressed={game.visibility !== "private"}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${game.visibility !== "private" ? "bg-primary-soft text-primary" : "text-muted-foreground"}`}
              >
                <Globe className="h-3.5 w-3.5" /> Публичная
              </button>
            </div>
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
          <div className="surface-card mb-6 grid grid-cols-2 gap-2 p-3 sm:flex sm:p-4">
            <button onClick={() => setOpenPlay(true)} className="btn-accent min-h-10 justify-center">
              <Play className="h-4 w-4" /> Играть
            </button>
            <a href={`/builder/${game.kind}?id=${game.id}`} className="btn-ghost min-h-10 justify-center">
              <Pencil className="h-4 w-4" /> Редактировать
            </a>
            <button onClick={doExport} className="btn-ghost hidden md:inline-flex">
              <FileSpreadsheet className="h-4 w-4" /> Экспорт
            </button>
            <button onClick={() => void doDownloadPdf()} className="btn-ghost hidden md:inline-flex">
              <FileText className="h-4 w-4" /> Скачать PDF
            </button>
            <button onClick={doPrint} className="btn-ghost hidden md:inline-flex">
              <Printer className="h-4 w-4" /> Печать
            </button>
            <button onClick={doDelete} className="btn-ghost ml-auto hidden text-danger hover:bg-danger-soft md:inline-flex">
              <Trash2 className="h-4 w-4" /> Удалить
            </button>
          </div>
        ) : (
          <div className="surface-card mb-6 flex flex-wrap gap-2 p-3 sm:p-4">
            {user ? (
              copyAllowed ? <button onClick={doFork} className="btn-accent min-h-10">
                <UserPlus className="h-4 w-4" /> Добавить себе
              </button> : <span className="inline-flex min-h-10 items-center rounded-xl bg-surface-muted px-3 text-sm text-muted-foreground" title="Автор запретил копирование этой игры">
                Копирование запрещено автором
              </span>
            ) : (
              <Link to="/login" className="btn-ghost">
                Войдите, чтобы добавить
              </Link>
            )}
            <button onClick={() => setOpenPlay(true)} className="btn-ghost min-h-10">
              <Play className="h-4 w-4" /> Играть
            </button>
          </div>
        )}

        {exportOpen && (
          <GameActionSheet title="Экспорт и поделиться" onClose={() => setExportOpen(false)}>
            {isMine && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setExportOpen(false);
                    void doDownloadPdf();
                  }}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl bg-primary-soft px-3 text-left text-sm font-semibold text-primary hover:bg-primary/15"
                >
                  <FileText className="h-4 w-4" /> Скачать PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportOpen(false);
                    doExport();
                  }}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold hover:bg-surface-muted"
                >
                  <FileSpreadsheet className="h-4 w-4 text-primary" /> Скачать Excel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportOpen(false);
                    doPrint();
                  }}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold hover:bg-surface-muted"
                >
                  <Printer className="h-4 w-4 text-primary" /> Печать с ответами
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setExportOpen(false);
                void shareGame();
              }}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold hover:bg-surface-muted"
            >
              <Copy className="h-4 w-4 text-primary" /> Скопировать ссылку
            </button>
          </GameActionSheet>
        )}
        {moreOpen && isMine && (
          <GameActionSheet title="Действия" onClose={() => setMoreOpen(false)}>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                void doFork();
              }}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold hover:bg-surface-muted"
            >
              <Copy className="h-4 w-4 text-primary" /> Создать копию
            </button>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                void doDelete();
              }}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-danger hover:bg-danger-soft"
            >
              <Trash2 className="h-4 w-4" /> Удалить игру
            </button>
          </GameActionSheet>
        )}

        {/* Results (owner) vs Content (foreign) */}
        {!isPrivateOther && (
          isMine ? (
            <div className="surface-card p-4 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-base font-bold">Результаты прохождений</h2>
                  <p className="text-sm text-muted-foreground">
                    Вся статистика, ответы и таблицы лидеров.
                  </p>
                </div>
                {game.kind === "quiz" ? (
                  <Link
                    to="/quiz/$gameId/results"
                    params={{ gameId: game.id }}
                    className="btn-accent inline-flex min-h-10 items-center justify-center gap-2"
                  >
                    <Trophy className="h-4 w-4" /> Открыть результаты
                  </Link>
                ) : game.kind === "jeopardy" ? (
                  <Link
                    to="/jeopardy/$gameId/results"
                    params={{ gameId: game.id }}
                    className="btn-accent inline-flex min-h-10 items-center justify-center gap-2"
                  >
                    <Trophy className="h-4 w-4" /> Открыть результаты
                  </Link>
                ) : (
                  <Link
                    to="/millionaire/$gameId/results"
                    params={{ gameId: game.id }}
                    className="btn-accent inline-flex min-h-10 items-center justify-center gap-2"
                  >
                    <Trophy className="h-4 w-4" /> Открыть результаты
                  </Link>
                )}
              </div>
            </div>

          ) : (
            <div className="surface-card p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold">Содержание</h2>
                  <p className="text-sm text-muted-foreground">
                    {gameSummary(game)}
                    {!previewAllowed ? " · вопросы скрыты автором" : !game.showAnswers && " · ответы скрыты автором"}
                  </p>
                </div>
              </div>
              {game.kind === "quiz" && quizVariants(game.data as QuizData).length >= 2 && <label className="mb-4 block max-w-sm text-xs font-semibold text-muted-foreground">Вариант для просмотра<select className="input-base mt-1" value={variantId} onChange={(event) => setVariantId(event.target.value)}>{quizVariants(game.data as QuizData).map((variant) => <option key={variant.id} value={variant.id}>{variant.name} · {variant.questions.length} вопросов</option>)}</select></label>}
              {previewAllowed && previewGame ? <GameContent game={previewGame.kind === "quiz" ? { ...previewGame, data: withSelectedQuizVariant(previewGame.data as QuizData, variantId) } : previewGame} withAnswers={!!previewGame.showAnswers} /> : (
                <div className="rounded-2xl border border-dashed border-border-strong p-8 text-center text-sm text-muted-foreground">
                  Автор не разрешил просмотр вопросов до игры. Вы можете запустить игру без предварительного просмотра.
                </div>
              )}
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

function GameActionSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-foreground/30 md:hidden" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-border bg-surface px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 shadow-lift"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-strong" />
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
            Закрыть
          </button>
        </div>
        <div className="grid gap-1">{children}</div>
      </section>
    </div>
  );
}
