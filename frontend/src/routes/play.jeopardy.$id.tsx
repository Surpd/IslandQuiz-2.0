import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Minus, X, Trophy } from "lucide-react";
import { PlayerShell, TimerBar } from "@/components/player-shell";
import { LaTeX } from "@/lib/latex";
import { loadGame } from "@/lib/storage";
import { submitJeopardyResult } from "@/lib/api";
import { fitQuestionSize } from "@/lib/fit-text";
import type { JeopardyData } from "@/lib/types";

export const Route = createFileRoute("/play/jeopardy/$id")({
  component: PlayJeopardy,
});

interface Team {
  id: string;
  name: string;
  score: number;
}

interface ModalState {
  roundIdx: number;
  catIdx: number;
  qIdx: number;
}

interface Bets {
  [teamId: string]: number;
}

function PlayJeopardy() {
  const { id } = Route.useParams();
  const [data, setData] = useState<JeopardyData | null>(null);
  const [stage, setStage] = useState<"round" | "final-bets" | "final-question" | "results">("round");
  const [roundIdx, setRoundIdx] = useState(0);
  const [used, setUsed] = useState<Set<string>>(new Set());
  const [teams, setTeams] = useState<Team[]>([
    { id: "t1", name: "Команда 1", score: 0 },
    { id: "t2", name: "Команда 2", score: 0 },
  ]);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [bets, setBets] = useState<Bets>({});
  const [finalAnswers, setFinalAnswers] = useState<Record<string, boolean>>({});
  const [correctCounts, setCorrectCounts] = useState<Record<string, number>>({});
  const [wrongCounts, setWrongCounts] = useState<Record<string, number>>({});
  const savedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const g = loadGame<JeopardyData>("jeopardy", id);
    if (g) setData(g.data);
  }, [id]);

  const config = data?.config;

  // Question timer (starts when modal opens, stops when answer is shown)
  useEffect(() => {
    if (!modal || !config || !data) return;
    const q = data.rounds[modal.roundIdx][modal.catIdx].questions[modal.qIdx];
    const rowIdx = Math.floor(q.points / 100) - 1;
    const time = config.timeBase + config.timeStep * Math.max(0, rowIdx);
    setTimeLeft(time);
    setShowAnswer(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1 && timerRef.current) {
          clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [modal, config, data]);

  // Final timer
  useEffect(() => {
    if (stage !== "final-question" || !config) return;
    setTimeLeft(config.timeFinal);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1 && timerRef.current) {
          clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stage, config]);

  // Persist game result when reaching results stage.
  useEffect(() => {
    if (stage !== "results" || savedRef.current) return;
    savedRef.current = true;
    const sorted = [...teams].sort((a, b) => b.score - a.score);
    const winner = sorted[0] ?? null;
    const hasFinal = Object.keys(bets).length > 0;
    submitJeopardyResult({
      gameId: id,
      hasFinal,
      winnerId: winner?.id ?? null,
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        score: t.score,
        correct: correctCounts[t.id] ?? 0,
        wrong: wrongCounts[t.id] ?? 0,
        finalBet: hasFinal ? (bets[t.id] ?? 0) : undefined,
        finalCorrect: hasFinal ? (finalAnswers[t.id] ?? false) : undefined,
      })),
    })
      .then(() => console.log("[jeopardy] результат сохранён"))
      .catch((err) => {
        console.error("[jeopardy] ошибка сохранения результата", err);
        savedRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  if (!data || !config) {
    return (
      <PlayerShell theme="amber">
        <div className="flex min-h-screen items-center justify-center text-center">
          <p>Игра не найдена</p>
        </div>
      </PlayerShell>
    );
  }

  const currentRound = data.rounds[roundIdx];
  const totalRounds = data.rounds.length;

  const addTeam = () => {
    const id = `t${Date.now()}`;
    setTeams([...teams, { id, name: `Команда ${teams.length + 1}`, score: 0 }]);
  };
  const removeTeam = (id: string) => setTeams(teams.filter((t) => t.id !== id));
  const patchTeam = (id: string, patch: Partial<Team>) =>
    setTeams((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const openQuestion = (catIdx: number, qIdx: number) => {
    const key = `${roundIdx}-${catIdx}-${qIdx}`;
    if (used.has(key)) return;
    setModal({ roundIdx, catIdx, qIdx });
  };

  const closeModal = () => {
    if (modal) {
      const key = `${modal.roundIdx}-${modal.catIdx}-${modal.qIdx}`;
      setUsed(new Set([...used, key]));
    }
    setModal(null);
  };

  const nextRound = () => {
    if (roundIdx + 1 < totalRounds) {
      setRoundIdx(roundIdx + 1);
      setUsed(new Set());
    } else {
      const initialBets: Bets = {};
      teams.forEach((t) => (initialBets[t.id] = 0));
      setBets(initialBets);
      setStage("final-bets");
    }
  };

  const startFinal = () => setStage("final-question");
  const showResults = () => {
    setTeams((prev) =>
      prev.map((t) => {
        const bet = bets[t.id] ?? 0;
        return { ...t, score: t.score + (finalAnswers[t.id] ? bet : -bet) };
      }),
    );
    setStage("results");
  };

  // --------- rendering ---------

  if (stage === "results") {
    const sorted = [...teams].sort((a, b) => b.score - a.score);
    return (
      <PlayerShell theme={config.theme}>
        <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-4 py-16">
          <Trophy className="mb-4 h-16 w-16 text-[color:var(--pt-accent)]" />
          <h1 className="font-display text-4xl font-black">Итоги</h1>
          <div className="mt-8 w-full space-y-3">
            {sorted.map((t, i) => (
              <div
                key={t.id}
                className={`flex items-center justify-between rounded-2xl border border-[color:var(--pt-border)] p-5 ${
                  i === 0 ? "bg-[color:var(--pt-accent)]/20" : "bg-[color:var(--pt-surface)]"
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--pt-accent)] font-bold text-black">
                    {i + 1}
                  </span>
                  <span className="text-lg font-semibold">{t.name}</span>
                </div>
                <span className="font-display text-3xl font-black text-[color:var(--pt-accent)]">
                  {t.score}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-8 rounded-xl bg-[color:var(--pt-accent)] px-8 py-3 font-bold text-black"
          >
            Играть снова
          </button>
        </div>
      </PlayerShell>
    );
  }

  return (
    <PlayerShell theme={config.theme}>
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-16">
        {stage === "round" && (
          <>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-[color:var(--pt-text-muted)]">
                  Раунд {roundIdx + 1} / {totalRounds}
                </p>
                <h1 className="mt-1 font-display text-3xl font-black">Игровое поле</h1>
              </div>
              <button
                onClick={nextRound}
                className="rounded-xl bg-[color:var(--pt-accent)] px-5 py-2.5 font-bold text-black hover:scale-105"
              >
                {roundIdx + 1 < totalRounds ? "Следующий раунд →" : "К финалу →"}
              </button>
            </div>

            {(() => {
              const maxRows = currentRound.reduce((m, c) => Math.max(m, c.questions.length), 0);
              return (
                <div
                  className="grid flex-1 gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${currentRound.length}, minmax(0, 1fr))`,
                    gridTemplateRows: `auto repeat(${maxRows}, minmax(0, 1fr))`,
                  }}
                >
                  {currentRound.map((cat, ci) => (
                    <div
                      key={`h-${ci}`}
                      className="rounded-xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] p-3 text-center text-sm font-bold uppercase"
                      style={{ gridColumn: ci + 1, gridRow: 1 }}
                    >
                      {cat.category || `Категория ${ci + 1}`}
                    </div>
                  ))}
                  {currentRound.flatMap((cat, ci) =>
                    Array.from({ length: maxRows }).map((_, ri) => {
                      const q = cat.questions[ri];
                      if (!q) {
                        return (
                          <div
                            key={`e-${ci}-${ri}`}
                            style={{ gridColumn: ci + 1, gridRow: ri + 2 }}
                            className="rounded-xl border border-dashed border-[color:var(--pt-border)]/40 opacity-30"
                          />
                        );
                      }
                      const key = `${roundIdx}-${ci}-${ri}`;
                      const disabled = used.has(key);
                      return (
                        <button
                          key={`q-${ci}-${ri}`}
                          disabled={disabled}
                          onClick={() => openQuestion(ci, ri)}
                          style={{ gridColumn: ci + 1, gridRow: ri + 2 }}
                          className={`rounded-xl border border-[color:var(--pt-border)] p-6 font-display text-2xl font-black transition-all ${
                            disabled
                              ? "opacity-20"
                              : "bg-[color:var(--pt-surface)] text-[color:var(--pt-accent)] hover:scale-105 hover:bg-[color:var(--pt-surface-strong)]"
                          }`}
                        >
                          {q.points}
                        </button>
                      );
                    }),
                  )}
                </div>
              );
            })()}

          </>
        )}

        {stage === "final-bets" && (
          <div className="mx-auto w-full max-w-2xl">
            <p className="text-xs uppercase tracking-widest text-[color:var(--pt-text-muted)]">
              Финал · {data.final.category || "Секретная тема"}
            </p>
            <h1 className="mt-1 font-display text-3xl font-black">Ставки команд</h1>
            <p className="mt-2 text-sm text-[color:var(--pt-text-muted)]">
              Каждая команда ставит от 0 до своих текущих очков.
            </p>
            <div className="mt-6 space-y-3">
              {teams.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-4">
                  <span className="flex-1 font-semibold">{t.name}</span>
                  <span className="text-sm text-[color:var(--pt-text-muted)]">Счёт: {t.score}</span>
                  <input
                    type="number"
                    min={0}
                    max={Math.max(0, t.score)}
                    className="w-32 rounded-lg border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-3 py-2 text-right"
                    value={bets[t.id] ?? 0}
                    onChange={(e) =>
                      setBets({ ...bets, [t.id]: Math.max(0, parseInt(e.target.value) || 0) })
                    }
                  />
                </div>
              ))}
            </div>
            <button
              onClick={startFinal}
              className="mt-6 w-full rounded-xl bg-[color:var(--pt-accent)] py-3 font-bold text-black"
            >
              Играть финальный вопрос
            </button>
          </div>
        )}

        {stage === "final-question" && (
          <div className="mx-auto w-full max-w-2xl">
            <TimerBar pct={(timeLeft / config.timeFinal) * 100} urgent={timeLeft <= 10} />
            <p className="mt-4 text-center text-xs uppercase tracking-widest text-[color:var(--pt-text-muted)]">
              Финальный вопрос · {timeLeft}с
            </p>
            {data.final.image && (
              <img
                src={data.final.image}
                alt=""
                className="mx-auto mt-4 max-h-60 rounded-xl object-contain"
              />
            )}
            <div className={`mt-6 rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-8 text-center font-semibold ${fitQuestionSize(data.final.q)}`}>
              <LaTeX>{data.final.q}</LaTeX>
            </div>
            {showAnswer && (
              <p className="mt-4 text-center text-xl font-bold text-[color:var(--pt-accent)]">
                Ответ: {data.final.a}
              </p>
            )}
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => setShowAnswer(true)}
                className="rounded-xl border border-[color:var(--pt-border)] px-6 py-2.5 font-semibold"
              >
                Показать ответ
              </button>
            </div>
            <div className="mt-6 space-y-2">
              <p className="text-sm text-[color:var(--pt-text-muted)]">Кто ответил верно?</p>
              {teams.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center justify-between rounded-xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-4"
                >
                  <span>{t.name}</span>
                  <span className="text-xs text-[color:var(--pt-text-muted)]">
                    Ставка: {bets[t.id] ?? 0}
                  </span>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[color:var(--pt-accent)]"
                    checked={finalAnswers[t.id] ?? false}
                    onChange={(e) =>
                      setFinalAnswers({ ...finalAnswers, [t.id]: e.target.checked })
                    }
                  />
                </label>
              ))}
            </div>
            <button
              onClick={showResults}
              className="mt-6 w-full rounded-xl bg-[color:var(--pt-accent)] py-3 font-bold text-black"
            >
              Показать итоги
            </button>
          </div>
        )}

        {/* Team scoreboard */}
        {stage === "round" && (
          <div className="mt-8 flex flex-wrap justify-center gap-3 border-t border-[color:var(--pt-border)] pt-6">
            {teams.map((t) => (
              <TeamCard
                key={t.id}
                team={t}
                onChange={(patch) => patchTeam(t.id, patch)}
                onRemove={() => removeTeam(t.id)}
              />
            ))}
            <button
              onClick={addTeam}
              className="grid place-items-center rounded-xl border-2 border-dashed border-[color:var(--pt-border)] px-4 py-2 text-[color:var(--pt-text-muted)] hover:text-[color:var(--pt-text)]"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {modal && (() => {
        const q = data.rounds[modal.roundIdx][modal.catIdx].questions[modal.qIdx];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
            <div className="w-full max-w-2xl animate-fade-up rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] p-8 backdrop-blur-lg">
              <TimerBar pct={(timeLeft / (config.timeBase + config.timeStep * (Math.floor(q.points / 100) - 1))) * 100} urgent={timeLeft <= 5} />
              <p className="mt-3 text-center text-xs uppercase tracking-widest text-[color:var(--pt-text-muted)]">
                {timeLeft}с
              </p>
              {q.image && (
                <img
                  src={q.image}
                  alt=""
                  className="mx-auto mt-4 max-h-56 rounded-xl object-contain"
                />
              )}
              <div className={`mt-6 text-center font-semibold ${fitQuestionSize(q.q)}`}>
                <LaTeX>{q.q}</LaTeX>
              </div>
              {showAnswer && (
                <p className="mt-6 text-center text-3xl font-bold text-[color:var(--pt-accent)]">
                  <LaTeX>{q.a}</LaTeX>
                </p>
              )}

              {showAnswer && (
                <div className="mt-6 space-y-2">
                  <p className="text-sm text-[color:var(--pt-text-muted)]">Начислить баллы:</p>
                  {teams.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 rounded-xl border border-[color:var(--pt-border)] p-3"
                    >
                      <span className="flex-1 truncate font-semibold">{t.name}</span>
                      <button
                        onClick={() => {
                          patchTeam(t.id, { score: t.score - q.points });
                          setWrongCounts((prev) => ({ ...prev, [t.id]: (prev[t.id] ?? 0) + 1 }));
                        }}
                        className="rounded-lg bg-danger/20 px-3 py-1.5 font-bold text-danger"
                      >
                        −{q.points}
                      </button>
                      <button
                        onClick={() => {
                          patchTeam(t.id, { score: t.score + q.points });
                          setCorrectCounts((prev) => ({ ...prev, [t.id]: (prev[t.id] ?? 0) + 1 }));
                        }}
                        className="rounded-lg bg-success/20 px-3 py-1.5 font-bold text-success"
                      >
                        +{q.points}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setShowAnswer(true)}
                  className="rounded-xl border border-[color:var(--pt-border)] px-4 py-2 font-semibold"
                >
                  Показать ответ
                </button>
                <button
                  onClick={closeModal}
                  className="rounded-xl bg-[color:var(--pt-accent)] px-4 py-2 font-bold text-black"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </PlayerShell>
  );
}

function TeamCard({
  team,
  onChange,
  onRemove,
}: {
  team: Team;
  onChange: (p: Partial<Team>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] px-4 py-2 backdrop-blur-md">
      <input
        value={team.name}
        onChange={(e) => onChange({ name: e.target.value })}
        className="w-28 bg-transparent text-sm font-semibold outline-none"
      />
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange({ score: team.score - 100 })}
          className="grid h-6 w-6 place-items-center rounded bg-danger/20 text-danger"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="w-12 text-center font-display font-black text-[color:var(--pt-accent)]">
          {team.score}
        </span>
        <button
          onClick={() => onChange({ score: team.score + 100 })}
          className="grid h-6 w-6 place-items-center rounded bg-success/20 text-success"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <button
        onClick={onRemove}
        className="text-[color:var(--pt-text-muted)] hover:text-danger"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
