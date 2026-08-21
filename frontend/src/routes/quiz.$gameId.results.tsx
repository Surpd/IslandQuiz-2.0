import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { RefreshCw, Trophy, ArrowLeft, User, Globe, ChevronRight, Check, X } from "lucide-react";
import { Avatar } from "@/components/avatar";

import { SiteHeader } from "@/components/site-header";
import {
  getResults,
  getOnlineResults,
  loadGame,
  type QuizResult,
  type OnlineQuizResult,
  type OnlineQuizPlayerResult,
} from "@/lib/api";
import type { QuizData } from "@/lib/types";
import { QuizAnswerDisplay } from "@/components/quiz-answer-display";

export const Route = createFileRoute("/quiz/$gameId/results")({
  head: () => ({
    meta: [{ title: "Результаты квиза — IslandQuiz" }],
  }),
  component: ResultsPage,
});

type UnifiedRow =
  | {
      kind: "offline";
      id: string;
      finishedAt: number;
      playerName: string;
      score: number;
      maxScore: number;
      correctCount: number;
      totalQuestions: number;
      timeSec: number;
      raw: QuizResult;
    }
  | {
      kind: "online";
      id: string;
      finishedAt: number;
      playerName: string;
      score: number;
      maxScore: number;
      correctCount: number;
      totalQuestions: number;
      timeSec: number;
      raw: OnlineQuizResult;
    };

function ResultsPage() {
  const { gameId } = Route.useParams();
  const [offline, setOffline] = useState<QuizResult[]>([]);
  const [online, setOnline] = useState<OnlineQuizResult[]>([]);
  const [game, setGame] = useState<QuizData | null>(null);
  const [tick, setTick] = useState(0);
  const [expandedRoom, setExpandedRoom] = useState<string | null>(null);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [expandedOffline, setExpandedOffline] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [off, on, g] = await Promise.all([
        getResults(gameId),
        getOnlineResults(gameId),
        loadGame<QuizData>("quiz", gameId),
      ]);
      if (cancel) return;
      setOffline(off);
      setOnline(on);
      setGame(g?.data ?? null);
    })();
    return () => {
      cancel = true;
    };
  }, [gameId, tick]);

  const rows: UnifiedRow[] = useMemo(() => {
    const off: UnifiedRow[] = offline.map((r) => ({
      kind: "offline",
      id: r.id,
      finishedAt: r.finishedAt,
      playerName: r.playerName || "Аноним",
      score: r.score,
      maxScore: r.maxScore,
      correctCount: r.correctCount,
      totalQuestions: r.totalQuestions,
      timeSec: r.timeSec,
      raw: r,
    }));
    const on: UnifiedRow[] = online.map((r) => {
      const sorted = [...r.players].sort((a, b) => b.score - a.score);
      const winner = sorted[0];
      const extra = Math.max(0, sorted.length - 1);
      const name = winner
        ? `${winner.nickname}${extra > 0 ? ` и ещё ${extra}` : ""}`
        : `Комната ${r.roomCode}`;
      return {
        kind: "online",
        id: r.id,
        finishedAt: r.playedAt,
        playerName: name,
        score: winner?.score ?? 0,
        maxScore: winner?.maxScore ?? 0,
        correctCount: winner?.correctCount ?? 0,
        totalQuestions: winner?.totalQuestions ?? 0,
        timeSec: r.durationSec,
        raw: r,
      };
    });
    return [...off, ...on].sort((a, b) => b.finishedAt - a.finishedAt);
  }, [offline, online]);

  const stats = useMemo(() => {
    // Aggregate individual attempts (offline + each online player)
    const attempts: { score: number; correct: number; total: number }[] = [];
    offline.forEach((r) =>
      attempts.push({ score: r.score, correct: r.correctCount, total: r.totalQuestions }),
    );
    online.forEach((r) =>
      r.players.forEach((p) =>
        attempts.push({ score: p.score, correct: p.correctCount, total: p.totalQuestions }),
      ),
    );
    const n = attempts.length;
    if (n === 0) return { count: 0, avgScore: 0, bestScore: 0, avgPct: 0 };
    return {
      count: n,
      avgScore: Math.round(attempts.reduce((s, a) => s + a.score, 0) / n),
      bestScore: Math.max(...attempts.map((a) => a.score)),
      avgPct: Math.round(
        attempts.reduce((s, a) => s + (a.total ? (a.correct / a.total) * 100 : 0), 0) / n,
      ),
    };
  }, [offline, online]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link
          to="/game/$id"
          params={{ id: gameId }}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          К игре
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
          <button className="btn-ghost" onClick={() => setTick((t) => t + 1)}>
            <RefreshCw className="h-4 w-4" /> Обновить
          </button>
        </div>

        {rows.length > 0 ? (
          <>
            <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              <StatCard label="Прошли" value={String(stats.count)} />
              <StatCard label="Средний балл" value={String(stats.avgScore)} />
              <StatCard label="Лучший" value={String(stats.bestScore)} />
              <StatCard label="Средняя точность" value={`${stats.avgPct}%`} />
            </div>

            <div className="surface-card hidden overflow-hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-soft text-left text-xs font-bold uppercase tracking-wider text-primary">
                      <th className="px-4 py-3">Тип</th>
                      <th className="px-4 py-3">Игрок</th>
                      <th className="px-4 py-3">Баллы</th>
                      <th className="px-4 py-3">% верно</th>
                      <th className="px-4 py-3">Время</th>
                      <th className="px-4 py-3">Дата</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const pct = r.totalQuestions
                        ? Math.round((r.correctCount / r.totalQuestions) * 100)
                        : 0;
                      const tone = pct >= 80 ? "success" : pct >= 50 ? "amber" : "danger";
                      const isOffline = r.kind === "offline";
                      const expanded = isOffline ? expandedOffline === r.id : expandedRoom === r.id;
                      const toggle = () => {
                        if (isOffline) {
                          setExpandedOffline((p) => (p === r.id ? null : r.id));
                        } else {
                          setExpandedRoom((p) => (p === r.id ? null : r.id));
                          setExpandedPlayer(null);
                        }
                      };
                      return (
                        <Fragment key={r.id}>
                          <tr
                            className="cursor-pointer border-t border-border hover:bg-surface-muted/60"
                            onClick={toggle}
                          >
                            <td className="px-4 py-3">
                              {isOffline ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                                  <User className="h-3 w-3" /> Офлайн
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
                                  <Globe className="h-3 w-3" />
                                  Онлайн · {r.raw.roomCode} ({r.raw.players.length})
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-semibold">
                              <PlayerCell
                                name={r.playerName}
                                avatar={isOffline ? r.raw.avatar : undefined}
                                userId={isOffline ? r.raw.userId : undefined}
                              />
                            </td>
                            <td className="px-4 py-3 font-mono">
                              {r.score}
                              {isOffline && (
                                <span className="text-muted-foreground">/{r.maxScore}</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-bold ${
                                  tone === "success"
                                    ? "bg-success-soft text-success"
                                    : tone === "amber"
                                      ? "bg-amber-soft text-amber"
                                      : "bg-danger-soft text-danger"
                                }`}
                              >
                                {pct}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {fmtTime(r.timeSec)}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {new Date(r.finishedAt).toLocaleString("ru-RU")}
                            </td>
                            <td className="px-4 py-3">
                              <ChevronRight
                                className={`h-4 w-4 text-muted-foreground transition-transform ${
                                  expanded ? "rotate-90" : ""
                                }`}
                              />
                            </td>
                          </tr>
                          {expanded && isOffline && r.raw.answers && (
                            <tr className="bg-surface-muted/40">
                              <td colSpan={7} className="px-4 py-4">
                                <OfflineAnswers result={r.raw} questions={game?.questions ?? []} />
                              </td>
                            </tr>
                          )}
                          {expanded && !isOffline && (
                            <tr className="bg-surface-muted/40">
                              <td colSpan={7} className="px-4 py-4">
                                <OnlineRoomPlayers
                                  room={r.raw}
                                  questions={game?.questions ?? []}
                                  expandedPlayer={expandedPlayer}
                                  onTogglePlayer={(id) =>
                                    setExpandedPlayer((p) => (p === id ? null : id))
                                  }
                                />
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
            <div className="grid gap-2 md:hidden">
              {rows.map((r) => {
                const pct = r.totalQuestions
                  ? Math.round((r.correctCount / r.totalQuestions) * 100)
                  : 0;
                const isOffline = r.kind === "offline";
                const expanded = isOffline ? expandedOffline === r.id : expandedRoom === r.id;
                return (
                  <article key={`mobile-${r.id}`} className="surface-card overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        if (isOffline) setExpandedOffline((p) => (p === r.id ? null : r.id));
                        else {
                          setExpandedRoom((p) => (p === r.id ? null : r.id));
                          setExpandedPlayer(null);
                        }
                      }}
                      className="w-full p-3 text-left hover:bg-surface-muted/50"
                    >
                      <div className="flex items-start gap-2">
                        <PlayerCell
                          name={r.playerName}
                          avatar={isOffline ? r.raw.avatar : undefined}
                          userId={isOffline ? r.raw.userId : undefined}
                        />
                        <ChevronRight className={`ml-auto mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {isOffline ? "Офлайн" : `Онлайн · ${r.raw.roomCode}`}
                        </span>
                        <span className="font-mono text-sm font-bold">
                          {r.score}{isOffline && <span className="text-muted-foreground">/{r.maxScore}</span>}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${pct >= 80 ? "bg-success-soft text-success" : pct >= 50 ? "bg-amber-soft text-amber" : "bg-danger-soft text-danger"}`}>
                          {pct}%
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{new Date(r.finishedAt).toLocaleString("ru-RU")} · {fmtTime(r.timeSec)}</p>
                    </button>
                    {expanded && isOffline && r.raw.answers && (
                      <div className="border-t border-border bg-surface-muted/40 p-3"><OfflineAnswers result={r.raw} questions={game?.questions ?? []} /></div>
                    )}
                    {expanded && !isOffline && (
                      <div className="border-t border-border bg-surface-muted/40 p-3">
                        <OnlineRoomPlayers room={r.raw} questions={game?.questions ?? []} expandedPlayer={expandedPlayer} onTogglePlayer={(id) => setExpandedPlayer((p) => (p === id ? null : id))} />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <div className="surface-card p-12 text-center text-muted-foreground">
            <Trophy className="mx-auto mb-4 h-12 w-12 opacity-40" />
            <p className="text-lg font-semibold text-foreground">Пока никто не прошёл квиз</p>
            <p className="mt-2 text-sm">
              Поделитесь ссылкой на плеер или запустите онлайн-комнату — результаты появятся здесь.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function OfflineAnswers({ result, questions }: { result: QuizResult; questions: QuizData["questions"] }) {
  if (!result.answers?.length) {
    return <p className="text-sm text-muted-foreground">Детализация недоступна.</p>;
  }
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-background">
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="bg-surface-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 w-8"></th>
            <th className="px-3 py-2">Вопрос</th>
            <th className="px-3 py-2">Ответ игрока</th>
            <th className="px-3 py-2">Правильный</th>
            <th className="px-3 py-2">Баллы</th>
          </tr>
        </thead>
        <tbody>
          {result.answers.map((a, i) => {
            const question = questions.find((item) => item.id === a.qId);
            return (
            <tr key={a.qId + i} className="border-t border-border">
              <td className="px-3 py-2">
                {a.isCorrect ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <X className="h-4 w-4 text-danger" />
                )}
              </td>
              <td className="break-words px-3 py-2 align-top">{a.question}</td>
              <td className="break-words px-3 py-2 align-top text-xs"><QuizAnswerDisplay question={question} value={a.given} kind="given" /></td>
              <td className="break-words px-3 py-2 align-top text-xs"><QuizAnswerDisplay question={question} fallback={a.correctAnswer} /></td>
              <td className="px-3 py-2 font-mono">
                {a.earned}/{a.points}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div className="grid gap-2 p-2 md:hidden">
        {result.answers.map((a, i) => (
          <ResultAnswerCard
            key={`mobile-${a.qId}-${i}`}
            index={i}
            questionText={a.question}
            question={questions.find((item) => item.id === a.qId)}
            given={a.given}
            correctAnswer={a.correctAnswer}
            correct={a.isCorrect}
            earned={a.earned}
            points={a.points}
          />
        ))}
      </div>
    </div>
  );
}

function OnlineRoomPlayers({
  room,
  questions,
  expandedPlayer,
  onTogglePlayer,
}: {
  room: OnlineQuizResult;
  questions: QuizData["questions"];
  expandedPlayer: string | null;
  onTogglePlayer: (id: string) => void;
}) {
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  const medalColor = (i: number) =>
    i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-700" : "";
  return (
    <div className="space-y-2">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Комната {room.roomCode} · {new Date(room.playedAt).toLocaleString("ru-RU")} ·{" "}
        {room.players.length} игроков
      </div>
      {sorted.map((p, i) => {
        const pct = p.totalQuestions ? Math.round((p.correctCount / p.totalQuestions) * 100) : 0;
        const expanded = expandedPlayer === p.id;
        return (
          <div key={p.id} className="rounded-xl border border-border bg-background">
            <button
              type="button"
              onClick={() => onTogglePlayer(p.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-muted/50"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid w-6 place-items-center">
                  {i < 3 ? (
                    <Trophy className={`h-4 w-4 ${medalColor(i)}`} />
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
                  )}
                </span>
                <Avatar name={p.nickname} size={28} />

                <span className="truncate font-semibold">{p.nickname}</span>
              </span>
              <span className="flex items-center gap-3 text-sm">
                <span className="font-mono">{p.score}</span>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {pct}%
                </span>
                <ChevronRight
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    expanded ? "rotate-90" : ""
                  }`}
                />
              </span>
            </button>
            {expanded && <PlayerAnswers player={p} questions={questions} />}
          </div>
        );
      })}
    </div>
  );
}

function PlayerAnswers({ player, questions }: { player: OnlineQuizPlayerResult; questions: QuizData["questions"] }) {
  if (!player.answers.length) {
    return (
      <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
        Игрок не отвечал на вопросы.
      </p>
    );
  }
  return (
    <div className="min-w-0 max-w-full overflow-hidden border-t border-border">
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="bg-surface-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2 w-8"></th>
            <th className="px-3 py-2">Вопрос</th>
            <th className="px-3 py-2">Ответ игрока</th>
            <th className="px-3 py-2">Правильный</th>
            <th className="px-3 py-2">Баллы</th>
          </tr>
        </thead>
        <tbody>
          {player.answers.map((a) => {
            const question = questions[a.questionIdx];
            return (
            <tr key={a.questionIdx} className="border-t border-border">
              <td className="px-3 py-2">
                {a.correct ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <X className="h-4 w-4 text-danger" />
                )}
              </td>
              <td className="break-words px-3 py-2 align-top">{a.question}</td>
              <td className="break-words px-3 py-2 align-top text-xs"><QuizAnswerDisplay question={question} value={a.given} kind="given" /></td>
              <td className="break-words px-3 py-2 align-top text-xs"><QuizAnswerDisplay question={question} fallback={a.correctAnswer} /></td>
              <td className="px-3 py-2 font-mono">+{a.earned}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div className="grid gap-2 p-2 md:hidden">
        {player.answers.map((a, i) => (
          <ResultAnswerCard
            key={`mobile-${a.questionIdx}-${i}`}
            index={i}
            questionText={a.question}
            question={questions[a.questionIdx]}
            given={a.given}
            correctAnswer={a.correctAnswer}
            correct={a.correct}
            earned={a.earned}
            points={a.points}
          />
        ))}
      </div>
    </div>
  );
}

function ResultAnswerCard({
  index,
  questionText,
  question,
  given,
  correctAnswer,
  correct,
  earned,
  points,
}: {
  index: number;
  questionText: string;
  question?: QuizData["questions"][number];
  given: string;
  correctAnswer: string;
  correct: boolean;
  earned: number;
  points: number;
}) {
  return (
    <article
      data-testid="result-question-card"
      className="min-w-0 rounded-xl border border-border bg-surface p-3 text-sm"
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className={`mt-0.5 shrink-0 ${correct ? "text-success" : "text-danger"}`} aria-label={correct ? "Верно" : "Неверно"}>
          {correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </span>
        <p className="min-w-0 flex-1 break-words font-semibold [overflow-wrap:anywhere]">
          {index + 1}. {questionText || "Вопрос"}
        </p>
      </div>
      <div className="mt-3 grid min-w-0 gap-2 border-t border-border pt-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">Ваш ответ:</p>
          <QuizAnswerDisplay question={question} value={given} kind="given" className="block text-sm" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">Правильный ответ:</p>
          <QuizAnswerDisplay question={question} fallback={correctAnswer} className="block text-sm" />
        </div>
        <p className={`pt-1 font-mono font-bold ${correct ? "text-success" : "text-danger"}`}>
          {earned} / {points}
        </p>
      </div>
    </article>
  );
}

function PlayerCell({
  name,
  avatar,
  userId,
}: {
  name: string;
  avatar?: string;
  userId?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar name={name} avatar={avatar} size={28} />
      {userId ? (
        <Link
          to="/profile/$userId"
          params={{ userId }}
          className="hover:text-primary hover:underline"
        >
          {name}
        </Link>
      ) : (
        <span>{name}</span>
      )}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-3 text-center sm:p-4">
      <div className="font-display text-2xl font-black text-primary sm:text-3xl">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
