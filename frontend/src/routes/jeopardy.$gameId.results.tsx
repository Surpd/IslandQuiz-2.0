import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Trophy, ArrowLeft, ChevronDown, ChevronRight, Check, X } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { getJeopardyResults } from "@/lib/api";
import { loadGame } from "@/lib/storage";
import type { JeopardyData } from "@/lib/types";
import type { JeopardyResult } from "@/lib/jeopardy-results";

export const Route = createFileRoute("/jeopardy/$gameId/results")({
  head: () => ({
    meta: [{ title: "Результаты игры — IslandQuiz" }],
  }),
  component: JeopardyResultsPage,
});

function JeopardyResultsPage() {
  const { gameId } = Route.useParams();
  const [game, setGame] = useState<JeopardyData | null>(null);
  const [results, setResults] = useState<JeopardyResult[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    const g = loadGame<JeopardyData>("jeopardy", gameId);
    setGame(g?.data ?? null);
    setState("loading");
    getJeopardyResults(gameId)
      .then((rs) => {
        if (cancel) return;
        setResults(rs);
        setState("idle");
      })
      .catch(() => {
        if (!cancel) setState("error");
      });
    return () => {
      cancel = true;
    };
  }, [gameId]);

  const stats = useMemo(() => {
    if (!results.length) return null;
    const teamTotals = new Map<string, { name: string; total: number }>();
    let bestScore = -Infinity;
    for (const r of results) {
      for (const t of r.teams) {
        const prev = teamTotals.get(t.name) ?? { name: t.name, total: 0 };
        teamTotals.set(t.name, { name: t.name, total: prev.total + t.score });
        if (t.score > bestScore) bestScore = t.score;
      }
    }
    const top = [...teamTotals.values()].sort((a, b) => b.total - a.total)[0];
    return {
      count: results.length,
      topTeam: top?.name ?? "—",
      bestScore: Number.isFinite(bestScore) ? bestScore : 0,
    };
  }, [results]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link
          to="/library"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />В библиотеку
        </Link>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 font-display text-3xl font-black tracking-tight sm:text-4xl">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-soft text-primary">
                <Trophy className="h-5 w-5" />
              </span>
              Результаты
            </h1>
            {game && <p className="mt-2 text-sm text-muted-foreground">{game.config.title}</p>}
          </div>
        </div>

        {state === "loading" ? (
          <div className="surface-card p-12 text-center text-sm text-muted-foreground">
            Загружаем результаты…
          </div>
        ) : state === "error" ? (
          <div className="surface-card p-12 text-center text-sm text-danger">
            Не удалось загрузить результаты
          </div>
        ) : results.length === 0 ? (
          <div className="surface-card p-12 text-center text-muted-foreground">
            <Trophy className="mx-auto mb-4 h-12 w-12 opacity-40" />
            <p className="text-lg font-semibold text-foreground">Ещё не сыграно ни одной игры</p>
            <p className="mt-2 text-sm">
              Запустите онлайн-комнату или офлайн-плеер, чтобы результаты появились здесь.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <StatCard label="Сыграно игр" value={String(stats?.count ?? 0)} />
              <StatCard label="Топ-команда" value={stats?.topTeam ?? "—"} />
              <StatCard label="Лучший счёт за игру" value={String(stats?.bestScore ?? 0)} />
            </div>

            <div className="surface-card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-5 py-3">
                <Trophy className="h-4 w-4 text-amber" />
                <h2 className="font-display text-base font-bold">Сыгранные игры</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-soft text-left text-xs font-bold uppercase tracking-wider text-primary">
                      <th className="w-8 px-3 py-3" />
                      <th className="px-3 py-3">Дата</th>
                      <th className="px-3 py-3">Команды</th>
                      <th className="px-3 py-3">Победитель</th>
                      <th className="px-3 py-3">Счёт</th>
                      <th className="px-3 py-3">Ставка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.flatMap((r) => {
                      const winner = r.teams.find((t) => t.id === r.winnerId) ?? null;
                      const isOpen = expanded === r.id;
                      const rows = [
                        <tr
                          key={r.id}
                          onClick={() => setExpanded(isOpen ? null : r.id)}
                          className="cursor-pointer border-t border-border hover:bg-surface-muted/60"
                        >
                          <td className="px-3 py-3 text-muted-foreground">
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {new Date(r.playedAt).toLocaleString("ru-RU")}
                          </td>
                          <td className="px-3 py-3">{r.teams.map((t) => t.name).join(", ")}</td>
                          <td className="px-3 py-3 font-semibold">{winner?.name ?? "—"}</td>
                          <td className="px-3 py-3 font-mono">{winner?.score ?? 0}</td>
                          <td className="px-3 py-3 text-muted-foreground">
                            {r.hasFinal ? (winner?.finalBet ?? 0) : "—"}
                          </td>
                        </tr>,
                      ];
                      if (isOpen) {
                        rows.push(
                          <tr key={r.id + "-d"} className="bg-surface-muted/40">
                            <td colSpan={6} className="px-5 py-3">
                              <div className="overflow-hidden rounded-xl border border-border bg-background">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-surface-muted text-left uppercase tracking-wider text-muted-foreground">
                                      <th className="px-2 py-2">Команда</th>
                                      <th className="px-2 py-2">Итог</th>
                                      <th className="px-2 py-2">Верно</th>
                                      <th className="px-2 py-2">Неверно</th>
                                      {r.hasFinal && <th className="px-2 py-2">Ставка</th>}
                                      {r.hasFinal && <th className="px-2 py-2">Финал</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {[...r.teams]
                                      .sort((a, b) => b.score - a.score)
                                      .map((t) => (
                                        <tr key={t.id} className="border-t border-border">
                                          <td className="px-2 py-2 font-semibold">{t.name}</td>
                                          <td className="px-2 py-2 font-mono">{t.score}</td>
                                          <td className="px-2 py-2 text-success">{t.correct}</td>
                                          <td className="px-2 py-2 text-danger">{t.wrong}</td>
                                          {r.hasFinal && (
                                            <td className="px-2 py-2">{t.finalBet ?? 0}</td>
                                          )}
                                          {r.hasFinal && (
                                            <td className="px-2 py-2">
                                              {t.finalCorrect ? (
                                                <Check className="h-4 w-4 text-success" />
                                              ) : (
                                                <X className="h-4 w-4 text-danger" />
                                              )}

                                            </td>
                                          )}
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>,
                        );
                      }
                      return rows;
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-4 text-center">
      <div className="font-display text-3xl font-black text-primary">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
