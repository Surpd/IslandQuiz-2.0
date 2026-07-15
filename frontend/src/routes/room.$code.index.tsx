// Teacher's projector-side room UI for online quiz mode.
// Themed via PlayerShell, reuses QuizQuestionCard for consistent visuals with
// the offline experience. Adds animated leaderboard, kick + score controls,
// and podium finale.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  ChevronRight,
  Trophy,
  Radio,
  Users,
  Flag,
  Copy,
  X,
  Plus,
  Minus,
  ArrowUp,
  ArrowDown,
  Settings2,
  Volume2,
  VolumeX,
  RefreshCw,
  Flame,
  Target,
  Check,
  BarChart3,
} from "lucide-react";
import { PlayerShell, TimerBar } from "@/components/player-shell";
import { Avatar } from "@/components/avatar";
import { QuizQuestionCard } from "@/components/quiz-question-card";

import { JeopardyRoomTeacher } from "@/components/jeopardy-room-teacher";
import {
  subscribeRoom,
  loadGame,
  startRoom,
  nextQuestion,
  finishRoom,
  kickPlayer,
  adjustPlayerScore,
  restartRoom,
  type RoomState,
  type RoomPlayer,
} from "@/lib/api";
import { sfx, isMuted, toggleMute } from "@/lib/sounds";
import type { QuizData, QuizQuestion } from "@/lib/types";

export const Route = createFileRoute("/room/$code/")({
  head: () => ({
    meta: [
      { title: "Комната — IslandQuiz" },
      { name: "description", content: "Учительский экран онлайн-квиза." },
    ],
  }),
  component: TeacherRoom,
});

function TeacherRoom() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<RoomState | null>(null);
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [copied, setCopied] = useState(false);
  const [muted, setMutedState] = useState<boolean>(true);
  const [manageOpen, setManageOpen] = useState(false);
  const prevStatus = useRef<RoomState["status"] | null>(null);

  useEffect(() => setMutedState(isMuted()), []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`islandquiz.me.${code}`);
      if (raw) navigate({ to: "/room/$code/play", params: { code }, replace: true });
    } catch {
      /* ignore */
    }
  }, [code, navigate]);

  useEffect(() => subscribeRoom(code, setState), [code]);

  useEffect(() => {
    if (!state || quiz || state.gameKind !== "quiz") return;
    loadGame<QuizData>("quiz", state.gameId).then((rec) => rec && setQuiz(rec.data));
  }, [state, quiz]);

  // Sound cues on status transitions
  useEffect(() => {
    if (!state) return;
    const prev = prevStatus.current;
    prevStatus.current = state.status;
    if (prev === state.status) return;
    if (state.status === "reveal") sfx.whoosh();
    if (state.status === "leaderboard") sfx.tick();
    if (state.status === "finished") sfx.fanfare();
  }, [state]);

  // Auto-advance when all players have answered
  const autoRef = useRef<{ q: number; done: boolean }>({ q: -1, done: false });
  useEffect(() => {
    if (!state || state.status !== "active") {
      if (state && state.status !== "active") {
        autoRef.current = { q: state.questionIdx, done: false };
      }
      return;
    }
    if (autoRef.current.q !== state.questionIdx) {
      autoRef.current = { q: state.questionIdx, done: false };
    }
    if (autoRef.current.done) return;
    const total = state.players.length;
    if (total === 0) return;
    const answered = state.players.filter(
      (p) => p.lastAnswer?.questionIdx === state.questionIdx,
    ).length;
    if (answered >= total) {
      autoRef.current.done = true;
      (async () => {
        const { revealAnswer, showLeaderboard } = await import("@/lib/api");
        await revealAnswer(code);
        setTimeout(() => {
          void showLeaderboard(code);
        }, 1600);
      })();
    }
  }, [state, code]);

  const theme = quiz?.config.theme ?? "amber";

  if (!state) {
    return (
      <PlayerShell theme={theme}>
        <div className="mx-auto max-w-md px-6 py-20 text-center">
          <h1 className="font-display text-2xl font-bold">Комната не найдена</h1>
          <p className="mt-2 text-[color:var(--pt-text-muted)]">
            Проверьте код или создайте новую комнату из библиотеки.
          </p>
          <Link
            to="/library"
            className="mt-4 inline-flex items-center rounded-xl bg-[color:var(--pt-accent)] px-5 py-3 font-bold text-black"
          >
            В библиотеку
          </Link>
        </div>
      </PlayerShell>
    );
  }

  if (state.gameKind === "jeopardy" && state.jeopardy) {
    return <JeopardyRoomTeacher state={state} code={code} />;
  }

  if (state.gameKind !== "quiz") {
    return (
      <PlayerShell theme={theme}>
        <div className="mx-auto max-w-md px-6 py-20 text-center">
          <h1 className="font-display text-2xl font-bold">Онлайн-режим</h1>
          <p className="mt-2 text-[color:var(--pt-text-muted)]">
            Пока поддерживается только квиз и «Своя игра». «Миллионер» — офлайн.
          </p>
        </div>
      </PlayerShell>
    );
  }

  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/join` : "/join";
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(joinUrl)}`;
  const question: QuizQuestion | undefined = quiz?.questions[state.questionIdx];
  const total = quiz?.questions.length ?? 0;
  const answered = state.players.filter(
    (p) => p.lastAnswer?.questionIdx === state.questionIdx,
  ).length;
  const isLast = state.questionIdx + 1 >= total;

  const copyCode = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  const onToggleMute = () => setMutedState(toggleMute());

  const goNext = async () => {
    if (state.status === "active") {
      // Skip: reveal briefly, then advance
      const { revealAnswer } = await import("@/lib/api");
      await revealAnswer(code);
      setTimeout(async () => {
        const { showLeaderboard } = await import("@/lib/api");
        await showLeaderboard(code);
      }, 1400);
      return;
    }
    if (state.status === "reveal") {
      const { showLeaderboard } = await import("@/lib/api");
      await showLeaderboard(code);
      return;
    }
    if (state.status === "leaderboard") {
      if (isLast) await finishRoom(code);
      else await nextQuestion(code);
    }
  };

  const sortedFinal = [...state.players].sort((a, b) => b.score - a.score);

  return (
    <PlayerShell theme={theme}>
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        <TopBar code={code} muted={muted} onToggleMute={onToggleMute} title={quiz?.config.title} />

        {state.status === "waiting" && (
          <Lobby
            code={code}
            state={state}
            qrUrl={qrUrl}
            copied={copied}
            onCopy={copyCode}
            onKick={(id) => kickPlayer(code, id)}
            onStart={() => {
              sfx.whoosh();
              startRoom(code);
            }}
          />
        )}

        {(state.status === "active" || state.status === "reveal") && question && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div className="animate-fade-up">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-[color:var(--pt-text-muted)]">
                  Вопрос {state.questionIdx + 1} / {total}
                </span>
                <span className="rounded-full bg-[color:var(--pt-surface-strong)] px-3 py-1 text-xs font-bold text-[color:var(--pt-accent)]">
                  Ответили: {answered} / {state.players.length}
                </span>
              </div>
              <TimerBar pct={(answered / Math.max(1, state.players.length)) * 100} />
              <div className="mt-4">
                <QuizQuestionCard
                  question={question}
                  value=""
                  onChange={() => {}}
                  reveal={state.status === "reveal"}
                  projector
                />
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  onClick={() => setManageOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-4 py-2 text-sm font-semibold hover:bg-[color:var(--pt-surface)]"
                >
                  <Settings2 className="h-4 w-4" /> Игроки
                </button>
                <button
                  onClick={goNext}
                  className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--pt-accent)] px-6 py-3 font-bold text-black hover:scale-[1.02]"
                >
                  <ChevronRight className="h-4 w-4" />
                  {state.status === "active" ? "Далее (показать ответ)" : "К таблице"}
                </button>
              </div>
            </div>
            <div className="space-y-4">
              <LiveLeaderboard state={state} />
              {manageOpen && (
                <ManagePanel
                  state={state}
                  onKick={(id) => kickPlayer(code, id)}
                  onAdjust={(id, delta) => adjustPlayerScore(code, id, delta)}
                />
              )}
            </div>
          </div>
        )}

        {state.status === "leaderboard" && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[3fr_2fr]">
            <AnimatedLeaderboard state={state} />
            <div className="rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-6 text-center backdrop-blur-md">
              <p className="text-sm text-[color:var(--pt-text-muted)]">Готовы к следующему?</p>
              {!isLast ? (
                <button
                  onClick={() => nextQuestion(code)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[color:var(--pt-accent)] px-6 py-3 font-bold text-black hover:scale-[1.02]"
                >
                  <ChevronRight className="h-4 w-4" /> Следующий вопрос
                </button>
              ) : (
                <button
                  onClick={() => finishRoom(code)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[color:var(--pt-accent)] px-6 py-3 font-bold text-black hover:scale-[1.02]"
                >
                  <Flag className="h-4 w-4" /> Финальный подиум
                </button>
              )}
              <div className="mt-4">
                <button
                  onClick={() => setManageOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-4 py-2 text-sm font-semibold"
                >
                  <Settings2 className="h-4 w-4" /> Игроки
                </button>
              </div>
              {manageOpen && (
                <div className="mt-4 text-left">
                  <ManagePanel
                    state={state}
                    onKick={(id) => kickPlayer(code, id)}
                    onAdjust={(id, delta) => adjustPlayerScore(code, id, delta)}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {state.status === "finished" && (
          <Finale players={sortedFinal} onRestart={() => restartRoom(code)} gameId={state.gameId} />
        )}
      </div>
    </PlayerShell>
  );
}

function TopBar({
  code,
  muted,
  onToggleMute,
  title,
}: {
  code: string;
  muted: boolean;
  onToggleMute: () => void;
  title?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pl-14">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-widest text-[color:var(--pt-text-muted)]">
          Онлайн-комната
        </p>
        <h1 className="truncate font-display text-lg font-bold md:text-2xl">
          {title ?? "IslandQuiz"}{" "}
          <span className="text-[color:var(--pt-text-muted)]">· {code}</span>
        </h1>
      </div>
      <button
        onClick={onToggleMute}
        className="inline-flex items-center gap-2 rounded-full border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-3 py-2 text-xs font-semibold"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        {muted ? "Звук выкл" : "Звук вкл"}
      </button>
    </div>
  );
}

function Lobby({
  code,
  state,
  qrUrl,
  copied,
  onCopy,
  onKick,
  onStart,
}: {
  code: string;
  state: RoomState;
  qrUrl: string;
  copied: boolean;
  onCopy: () => void;
  onKick: (id: string) => void;
  onStart: () => void;
}) {
  return (
    <div className="mt-6 grid gap-6 md:grid-cols-[1fr_auto]">
      <div className="animate-fade-up rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-8 backdrop-blur-md">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[color:var(--pt-surface-strong)] px-3 py-1 text-xs font-semibold text-[color:var(--pt-accent)]">
          <Radio className="h-3.5 w-3.5" /> Зал ожидания
        </div>
        <p className="text-sm text-[color:var(--pt-text-muted)]">Код комнаты</p>
        <div className="my-3 flex flex-wrap items-center gap-3">
          <div className="font-display text-6xl font-black tracking-[0.25em] md:text-7xl">
            {code}
          </div>
          <button
            onClick={onCopy}
            className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-4 py-2 text-sm font-semibold"
          >
            <Copy className="h-4 w-4" /> {copied ? "Скопировано" : "Копировать"}
          </button>
        </div>
        <p className="text-sm text-[color:var(--pt-text-muted)]">
          Ученики заходят на{" "}
          <span className="font-mono font-semibold text-[color:var(--pt-text)]">/join</span> и
          вводят код.
        </p>
        <button
          onClick={onStart}
          disabled={state.players.length === 0}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[color:var(--pt-accent)] px-6 py-3 font-bold text-black transition-transform hover:scale-[1.02] disabled:opacity-40"
        >
          <Play className="h-4 w-4" /> Начать игру ({state.players.length})
        </button>
      </div>
      <div className="grid place-items-center rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-6 backdrop-blur-md">
        <img src={qrUrl} alt="QR-код" className="rounded-xl" />
        <p className="mt-2 text-xs text-[color:var(--pt-text-muted)]">QR ведёт на /join</p>
      </div>
      <div className="rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-6 backdrop-blur-md md:col-span-2">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[color:var(--pt-text-muted)]">
          <Users className="h-4 w-4" /> Игроки ({state.players.length})
        </div>
        {state.players.length === 0 ? (
          <p className="text-sm text-[color:var(--pt-text-muted)]">Ждём подключения...</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {state.players.map((p) => (
              <div
                key={p.id}
                className="iq-pop group flex items-center gap-2 rounded-full bg-[color:var(--pt-surface-strong)] px-3 py-1.5 text-sm font-semibold"
              >
                <Avatar name={p.nickname} size={22} />
                {p.nickname}
                <button
                  onClick={() => onKick(p.id)}
                  aria-label={`Удалить ${p.nickname}`}
                  className="ml-1 grid h-5 w-5 place-items-center rounded-full text-[color:var(--pt-text-muted)] hover:bg-danger/20 hover:text-danger"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

function LiveLeaderboard({ state }: { state: RoomState }) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  return (
    <div className="rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-5 backdrop-blur-md">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[color:var(--pt-text-muted)]">
        <Trophy className="h-4 w-4" /> Рейтинг
      </div>
      <div className="space-y-2">
        {sorted.map((p, i) => {
          const isFastest = p.id === state.fastestPlayerId;
          const answeredHere = p.lastAnswer?.questionIdx === state.questionIdx;
          return (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-xl px-3 py-2 transition-all ${
                i === 0 ? "bg-[color:var(--pt-accent)]/15" : "bg-[color:var(--pt-surface-strong)]"
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="w-5 font-mono text-xs text-[color:var(--pt-text-muted)]">
                  {i + 1}
                </span>
                <Avatar name={p.nickname} size={22} />
                <span className="truncate font-semibold">{p.nickname}</span>
                {p.streak >= 2 && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-[color:var(--pt-accent)]/20 px-1.5 text-[10px] font-bold text-[color:var(--pt-accent)]">
                    <Flame className="h-3 w-3" />
                    {p.streak}
                  </span>
                )}
                {isFastest && (
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-success/20 text-success">
                    <Target className="h-3 w-3" />
                  </span>
                )}
                {answeredHere && state.status === "active" && (
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-success/20 text-success">
                    <Check className="h-3 w-3" />
                  </span>
                )}

              </div>
              <span className="font-mono text-sm font-bold">{p.score.toLocaleString("ru-RU")}</span>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p className="text-sm text-[color:var(--pt-text-muted)]">Пока никого.</p>
        )}
      </div>
    </div>
  );
}

function AnimatedLeaderboard({ state }: { state: RoomState }) {
  const currentSorted = useMemo(
    () => [...state.players].sort((a, b) => b.score - a.score),
    [state.players],
  );

  // Compute "old" ordering (before this question's delta) and old scores
  const oldSorted = useMemo(() => {
    const shadow = state.players.map((p) => {
      const gained = p.lastAnswer?.questionIdx === state.questionIdx ? p.lastAnswer.delta : 0;
      return { ...p, oldScore: p.score - gained };
    });
    return [...shadow].sort((a, b) => b.oldScore - a.oldScore);
  }, [state.players, state.questionIdx]);

  const [phase, setPhase] = useState<"old" | "points" | "new">("old");
  useEffect(() => {
    setPhase("old");
    const t1 = setTimeout(() => setPhase("points"), 250);
    const t2 = setTimeout(() => setPhase("new"), 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [state.questionIdx]);

  const oldRank = useMemo(() => {
    const map: Record<string, number> = {};
    oldSorted.forEach((p, i) => {
      map[p.id] = i;
    });
    return map;
  }, [oldSorted]);
  const newRank = useMemo(() => {
    const map: Record<string, number> = {};
    currentSorted.forEach((p, i) => {
      map[p.id] = i;
    });
    return map;
  }, [currentSorted]);

  const display = phase === "new" ? currentSorted : oldSorted;

  return (
    <div className="rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-6 backdrop-blur-md">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[color:var(--pt-text-muted)]">
        <Trophy className="h-4 w-4" /> Таблица результатов
      </div>
      <div className="relative">
        {display.map((p, i) => {
          const oldPos = oldRank[p.id] ?? i;
          const newPos = newRank[p.id] ?? i;
          const delta = oldPos - newPos; // >0 up
          const gained = p.lastAnswer?.questionIdx === state.questionIdx ? p.lastAnswer.delta : 0;
          const scoreShown = phase === "new" ? p.score : p.score - gained;
          return (
            <div
              key={p.id}
              className={`mb-3 flex items-center justify-between rounded-2xl px-4 py-3 text-lg transition-all duration-500 ease-out ${
                (phase === "new" ? newPos : oldPos) === 0
                  ? "bg-[color:var(--pt-accent)]/20"
                  : "bg-[color:var(--pt-surface-strong)]"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[color:var(--pt-surface)] font-display text-sm font-black">
                  {(phase === "new" ? newPos : oldPos) + 1}
                </span>
                {phase === "new" && delta > 0 && (
                  <ArrowUp className="h-4 w-4 text-success iq-pop" />
                )}
                {phase === "new" && delta < 0 && (
                  <ArrowDown className="h-4 w-4 text-danger iq-pop" />
                )}
                <Avatar name={p.nickname} size={32} />
                <span className="font-semibold">{p.nickname}</span>
              </div>
              <div className="relative flex items-center gap-3">
                {phase === "points" && gained > 0 && (
                  <span className="iq-points-fly absolute -top-2 right-16 rounded-full bg-success/20 px-2 py-0.5 text-xs font-bold text-success">
                    +{gained}
                  </span>
                )}
                <span className="font-mono text-xl font-bold tabular-nums">
                  {scoreShown.toLocaleString("ru-RU")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ManagePanel({
  state,
  onKick,
  onAdjust,
}: {
  state: RoomState;
  onKick: (id: string) => void;
  onAdjust: (id: string, delta: number) => void;
}) {
  return (
    <div className="rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-4 backdrop-blur-md">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[color:var(--pt-text-muted)]">
        <Settings2 className="h-4 w-4" /> Управление игроками
      </div>
      <div className="space-y-2">
        {state.players.map((p) => (
          <PlayerAdmin key={p.id} p={p} onKick={onKick} onAdjust={onAdjust} />
        ))}
      </div>
    </div>
  );
}

function PlayerAdmin({
  p,
  onKick,
  onAdjust,
}: {
  p: RoomPlayer;
  onKick: (id: string) => void;
  onAdjust: (id: string, delta: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-[color:var(--pt-surface-strong)] px-3 py-2 text-sm">
      <div className="flex items-center gap-2 truncate">
        <Avatar name={p.nickname} size={22} />

        <span className="truncate font-semibold">{p.nickname}</span>
        <span className="ml-2 font-mono text-xs text-[color:var(--pt-text-muted)]">
          {p.score.toLocaleString("ru-RU")}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onAdjust(p.id, -100)}
          className="grid h-7 w-7 place-items-center rounded-lg bg-[color:var(--pt-surface)] hover:bg-danger/20 hover:text-danger"
          aria-label="Отнять 100"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onAdjust(p.id, 100)}
          className="grid h-7 w-7 place-items-center rounded-lg bg-[color:var(--pt-surface)] hover:bg-success/20 hover:text-success"
          aria-label="Добавить 100"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onKick(p.id)}
          className="grid h-7 w-7 place-items-center rounded-lg bg-[color:var(--pt-surface)] hover:bg-danger/20 hover:text-danger"
          aria-label="Удалить"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function Finale({
  players,
  onRestart,
  gameId,
}: {
  players: RoomPlayer[];
  onRestart: () => void;
  gameId: string;
}) {
  const podium = players.slice(0, 3);
  const rest = players.slice(3);
  return (
    <div className="mt-6 rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-6 text-center backdrop-blur-md md:p-10">
      <Trophy className="mx-auto mb-2 h-12 w-12 text-[color:var(--pt-accent)]" />
      <h1 className="font-display text-3xl font-black md:text-4xl">Игра окончена!</h1>

      <div className="mx-auto mt-8 grid max-w-3xl grid-cols-3 items-end gap-3">
        {[1, 0, 2].map((mapIdx, col) => {
          const p = podium[mapIdx];
          if (!p) return <div key={col} />;
          const heights = ["h-32", "h-44", "h-24"];
          const colors = ["bg-slate-300", "bg-[color:var(--pt-accent)]", "bg-amber-700"];
          return (
            <div key={p.id} className="flex flex-col items-center">
              <Avatar
                name={p.nickname}
                size={64}
                className={`${mapIdx === 0 ? "iq-bounce" : "iq-wiggle"}`}
              />

              <span className="mt-2 font-semibold">{p.nickname}</span>
              <span className="font-mono text-lg font-bold">{p.score.toLocaleString("ru-RU")}</span>
              <div
                className={`mt-2 w-full rounded-t-2xl ${heights[col]} ${colors[col]} grid place-items-end pb-2 text-3xl font-black text-black/70`}
              >
                {mapIdx + 1}
              </div>
            </div>
          );
        })}
      </div>

      {rest.length > 0 && (
        <div className="mx-auto mt-6 max-w-md space-y-2 text-left">
          {rest.map((p, i) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-xl bg-[color:var(--pt-surface-strong)] px-4 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-xs text-[color:var(--pt-text-muted)]">{i + 4}</span>
                <Avatar name={p.nickname} size={22} />
                <span className="font-semibold">{p.nickname}</span>
              </span>
              <span className="font-mono font-bold">{p.score.toLocaleString("ru-RU")}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <button
          onClick={onRestart}
          className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--pt-accent)] px-5 py-3 font-bold text-black hover:scale-[1.02]"
        >
          <RefreshCw className="h-4 w-4" /> Начать заново
        </button>
        <Link
          to="/quiz/$gameId/results"
          params={{ gameId }}
          className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-5 py-3 font-bold hover:bg-[color:var(--pt-surface)]"
        >
          <BarChart3 className="h-4 w-4" /> Подробности
        </Link>
        <Link
          to="/library"
          className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-5 py-3 font-bold hover:bg-[color:var(--pt-surface)]"
        >
          <X className="h-4 w-4" /> Библиотека
        </Link>

      </div>
    </div>
  );
}
