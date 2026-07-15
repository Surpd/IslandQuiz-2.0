import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Lock,
  RefreshCw,
  Trophy,
  X,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { SiteHeader } from "@/components/site-header";
import { loadMillionaireResults, type MillionaireResult } from "@/lib/results";
import { loadGame } from "@/lib/storage";
import type { MillionaireData } from "@/lib/types";

export const Route = createFileRoute("/millionaire/$gameId/results")({
  head: () => ({
    meta: [{ title: "Результаты «Миллионера» — IslandQuiz" }],
  }),
  component: MillionaireResultsPage,
});

function fmtMoney(n: number) {
  return `${n.toLocaleString("ru-RU")} ₽`;
}
function fmtTime(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function MillionaireResultsPage() {
  const { gameId } = Route.useParams();
  const [results, setResults] = useState<MillionaireResult[]>([]);
  const [game, setGame] = useState<MillionaireData | null>(null);
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setResults(loadMillionaireResults(gameId));
    const g = loadGame<MillionaireData>("millionaire", gameId);
    setGame(g?.data ?? null);
  }, [gameId, tick]);

  const stats = useMemo(() => {
    const n = results.length;
    if (n === 0)
      return { count: 0, best: 0, avg: 0, fullRuns: 0 };
    const wins = results.filter((r) => r.outcome === "won").length;
    const best = Math.max(...results.map((r) => r.wonAmount));
    const avg = Math.round(results.reduce((s, r) => s + r.wonAmount, 0) / n);
    return { count: n, best, avg, fullRuns: wins };
  }, [results]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link
          to="/game/$id"
          params={{ id: gameId }}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> К игре
        </Link>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 font-display text-3xl font-black tracking-tight sm:text-4xl">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-primary">
                <Trophy className="h-5 w-5" />
              </span>
              Результаты «Миллионера»
            </h1>
            {game && (
              <p className="mt-2 text-sm text-muted-foreground">
                {game.config.title || "Без названия"}
              </p>
            )}
          </div>
          <button className="btn-ghost" onClick={() => setTick((t) => t + 1)}>
            <RefreshCw className="h-4 w-4" /> Обновить
          </button>
        </div>

        {results.length > 0 ? (
          <>
            <div className="mb-6 grid gap-3 sm:grid-cols-4">
              <StatCard label="Всего игр" value={String(stats.count)} />
              <StatCard label="Лучший" value={fmtMoney(stats.best)} />
              <StatCard label="Средний" value={fmtMoney(stats.avg)} />
              <StatCard
                label="Дошли до конца"
                value={`${stats.fullRuns} / ${stats.count}`}
              />
            </div>

            <div className="surface-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-soft text-left text-xs font-bold uppercase tracking-wider text-primary">
                      <th className="px-4 py-3">Игрок</th>
                      <th className="px-4 py-3">Результат</th>
                      <th className="px-4 py-3">Уровень</th>
                      <th className="px-4 py-3">Несгораемая</th>
                      <th className="px-4 py-3">Время</th>
                      <th className="px-4 py-3">Дата</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => {
                      const isOpen = expanded === r.id;
                      const won = r.outcome === "won";
                      const rowTone = won
                        ? "bg-success-soft/40"
                        : r.reachedCount === 0
                          ? "bg-danger-soft/30"
                          : "";
                      return (
                        <Fragment key={r.id}>
                          <tr
                            className={`cursor-pointer border-t border-border hover:bg-surface-muted/60 ${rowTone}`}
                            onClick={() =>
                              setExpanded((p) => (p === r.id ? null : r.id))
                            }
                          >
                            <td className="px-4 py-3 font-semibold">
                              <div className="flex items-center gap-2">
                                <Avatar
                                  name={r.playerName}
                                  avatar={r.avatar}
                                  size={26}
                                />
                                {r.userId ? (
                                  <Link
                                    to="/profile/$userId"
                                    params={{ userId: r.userId }}
                                    className="text-primary hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {r.playerName}
                                  </Link>
                                ) : (
                                  <span>{r.playerName}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono font-bold">
                              <span
                                className={
                                  won
                                    ? "text-success"
                                    : r.wonAmount === 0
                                      ? "text-danger"
                                      : ""
                                }
                              >
                                {fmtMoney(r.wonAmount)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {r.reachedCount}/{r.totalQuestions}
                              {won && (
                                <span className="ml-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success">
                                  ФИНАЛ
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-muted-foreground">
                              {fmtMoney(r.guaranteedAmount)}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {fmtTime(r.timeSec)}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {new Date(r.finishedAt).toLocaleString("ru-RU")}
                            </td>
                            <td className="px-4 py-3">
                              <ChevronRight
                                className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                              />
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-surface-muted/40">
                              <td colSpan={7} className="px-4 py-4">
                                <AnswerDetails result={r} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="surface-card p-12 text-center text-muted-foreground">
            <Trophy className="mx-auto mb-4 h-12 w-12 opacity-40" />
            <p className="text-lg font-semibold text-foreground">
              Ещё не сыграно ни одной игры
            </p>
            <p className="mt-2 text-sm">
              Поделитесь ссылкой на плеер — результаты появятся здесь.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-black">{value}</p>
    </div>
  );
}

function AnswerDetails({ result }: { result: MillionaireResult }) {
  if (!result.answers.length) {
    return (
      <p className="text-sm text-muted-foreground">Детализация недоступна.</p>
    );
  }
  const lostIdx = result.answers.findIndex((a) => !a.isCorrect);
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-background">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 w-8">#</th>
            <th className="px-3 py-2">Сумма</th>
            <th className="px-3 py-2">Вопрос</th>
            <th className="px-3 py-2">Ответ игрока</th>
            <th className="px-3 py-2">Правильный</th>
            <th className="px-3 py-2 w-24">Результат</th>
          </tr>
        </thead>
        <tbody>
          {result.answers.map((a, i) => (
            <Fragment key={a.qIdx}>
              <tr className="border-t border-border">
                <td className="px-3 py-2 font-mono text-muted-foreground">
                  {a.qIdx + 1}
                </td>
                <td className="px-3 py-2 font-mono">{fmtMoney(a.money)}</td>
                <td className="px-3 py-2">{a.question}</td>
                <td className="px-3 py-2 font-mono text-xs">{a.given}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {a.correctAnswer}
                </td>
                <td className="px-3 py-2">
                  {a.isCorrect ? (
                    <span className="inline-flex items-center gap-1 text-success">
                      <Check className="h-4 w-4" /> {fmtMoney(a.money)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-danger">
                      <X className="h-4 w-4" /> потеря
                    </span>
                  )}
                </td>
              </tr>
              {i === lostIdx && lostIdx !== -1 && (
                <tr className="bg-amber-soft/50">
                  <td colSpan={6} className="px-3 py-2 text-xs font-semibold">
                    <span className="inline-flex items-center gap-1.5 text-amber">
                      <Lock className="h-3.5 w-3.5" /> Несгораемая сумма:{" "}
                      {fmtMoney(result.guaranteedAmount)}
                    </span>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {result.outcome === "won" && (
            <tr className="bg-success-soft/60">
              <td colSpan={6} className="px-3 py-2 text-center text-sm font-bold text-success">
                🎉 Пройдено! Итоговый выигрыш: {fmtMoney(result.wonAmount)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
