// Student-side online player. Themed via PlayerShell, uses QuizQuestionCard
// so all six question types work identically to
// the offline experience. Sends the computed correctness up to the shared
// room state so the teacher's projector can drive the flow.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Hourglass, Trophy, Timer, Volume2, VolumeX, Users, Flame, Check, X } from "lucide-react";
import { PlayerShell, TimerBar } from "@/components/player-shell";
import { Avatar } from "@/components/avatar";
import { PlayerScore } from "@/components/player-motion";
import { QuizQuestionCard } from "@/components/quiz-question-card";
import { JeopardyRoomPlayer } from "@/components/jeopardy-room-player";
import { getStoredRoomPlayer, saveAnswerDraft, subscribeRoom, subscribeRoomSnapshot, submitAnswer, type RoomState } from "@/lib/api";
import { sfx, isMuted, toggleMute } from "@/lib/sounds";
import type { PlayerTheme, QuizData, QuizQuestion } from "@/lib/types";


export const Route = createFileRoute("/room/$code/play")({
  head: () => ({
    meta: [{ title: "Игра — IslandQuiz" }, { name: "robots", content: "noindex" }],
  }),
  component: StudentPlay,
});

interface Me {
  playerId: string;
  nickname: string;
  avatar: string;
}

function StudentPlay() {
  const { code } = Route.useParams();
  const [state, setState] = useState<RoomState | null>(null);
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [identityReady, setIdentityReady] = useState(false);
  const [value, setValue] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [lastEarned, setLastEarned] = useState<number>(0);
  const [muted, setMutedState] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [showStreak, setShowStreak] = useState(false);
  const [streakFading, setStreakFading] = useState(false);
  const prevStatus = useRef<RoomState["status"] | null>(null);
  const submitStartedRef = useRef(false);
  const draftSequenceRef = useRef(0);
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const rankSnapshot = useRef<Record<string, number>>({});
  const [rankChange, setRankChange] = useState(0);
  useEffect(() => {
    if (!state || !me) return;
    if (state.status === "active") {
      rankSnapshot.current = Object.fromEntries([...state.players].sort((a, b) => b.score - a.score).map((p, i) => [p.id, i + 1]));
    } else if (state.status === "leaderboard" || state.status === "finished") {
      const place = [...state.players].sort((a, b) => b.score - a.score).findIndex((p) => p.id === me.playerId) + 1;
      setRankChange(rankSnapshot.current[me.playerId] ? rankSnapshot.current[me.playerId] - place : 0);
    }
  }, [state?.status, state?.questionIdx, me?.playerId]);

  useEffect(() => setMutedState(isMuted()), []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`islandquiz.me.${code}`);
      if (raw) setMe(JSON.parse(raw));
      else {
        const stored = getStoredRoomPlayer(code);
        if (stored) setMe(stored);
      }
    } catch {
      const stored = getStoredRoomPlayer(code);
      if (stored) setMe(stored);
    } finally {
      setIdentityReady(true);
    }
  }, [code]);

  useEffect(() => {
    const unsubscribeState = subscribeRoom(code, setState);
    const unsubscribeSnapshot = subscribeRoomSnapshot(code, (snapshot) => {
      if (snapshot.kind === "quiz") setQuiz(snapshot.data as QuizData);
    });
    return () => {
      unsubscribeState();
      unsubscribeSnapshot();
    };
  }, [code]);

  const theme = state?.theme ?? "classic";
  const question: QuizQuestion | undefined =
    quiz && state ? quiz.questions[state.questionIdx] : undefined;
  const myPlayer = useMemo(() => state?.players.find((p) => p.id === me?.playerId), [state, me]);

  // Reset per-question state
  useEffect(() => {
    if (state?.status === "active") {
      setValue(state.playerAnswerDraft ?? "");
      setSubmitted(state.playerAnswerSubmitted === true);
      setSending(false);
      setDraftStatus(state.playerAnswerDraft ? "saved" : "idle");
      submitStartedRef.current = false;
      draftSequenceRef.current += 1;
      setLastEarned(0);
    }
  }, [state?.questionIdx, state?.status]);

  // Local timer counting down from question.time
  useEffect(() => {
    if (state?.status !== "active" || !question || !state.questionStartAt) return;
    const total = (question.time || 30) * 1000;
    const tick = () => {
      const left = Math.max(0, total - (Date.now() - state.questionStartAt!));
      setTimeLeft(left);
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [state?.status, state?.questionStartAt, question]);

  // Auto-submit on timeout
  useEffect(() => {
    if (
      state?.status === "active" &&
      !submitted &&
      timeLeft === 0 &&
      question &&
      state.questionStartAt
    ) {
      // only after start
      const elapsed = Date.now() - state.questionStartAt;
      if (elapsed >= (question.time || 30) * 1000) {
        void doSubmit(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, submitted, state?.status]);

  useEffect(() => {
    if (state?.status === "timeout") setTimeLeft(0);
  }, [state?.status, state?.questionIdx]);

  // Sound cues on reveal
  useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = state?.status ?? null;
    if (!state || prev === state.status) return;
    if (state.status === "reveal") {
      // Announce personal result
      const my = state.players.find((p) => p.id === me?.playerId);
      const answered = my?.lastAnswer?.questionIdx === state.questionIdx;
      if (answered && my!.lastAnswer!.correct) {
        setLastEarned(my!.lastAnswer!.delta);
        sfx.correct();
      } else {
        setLastEarned(0);
        sfx.wrong();
      }
    }
    if (state.status === "leaderboard") sfx.tick();
    if (state.status === "finished") {
      const sorted = [...state.players].sort((a, b) => b.score - a.score);
      const place = sorted.findIndex((p) => p.id === me?.playerId) + 1;
      if (place > 0 && place <= 3) sfx.fanfare();
    }
  }, [state, me]);

  // Animate streak toast when it reaches 2+
  useEffect(() => {
    if (myPlayer?.streak && myPlayer.streak >= 2) {
      setShowStreak(true);
      setStreakFading(false);
      const fade = setTimeout(() => setStreakFading(true), 4700);
      const hide = setTimeout(() => setShowStreak(false), 5000);
      return () => {
        clearTimeout(fade);
        clearTimeout(hide);
      };
    }
    setShowStreak(false);
    setStreakFading(false);
  }, [myPlayer?.streak]);

  // Redirect kicked players to /join
  useEffect(() => {
    if (!state || !me) return;
    const stillHere = state.players.some((p) => p.id === me.playerId);
    if (!stillHere) {
      navigate({ to: "/join", replace: true });
    }
  }, [state, me, navigate]);

  const doSubmit = async (timeout = false) => {
    if (!state || !question || !me || submitted || submitStartedRef.current) return;
    submitStartedRef.current = true;
    setSubmitted(true);
    setSending(true);
    // Пустое значение для сложных типов — считаем неответом.
    let effectiveValue = value;
    if (question.type === "matching") {
      try {
        const map = JSON.parse(value || "{}") as Record<string, string>;
        if (Object.keys(map).length === 0) effectiveValue = "";
      } catch {
        effectiveValue = "";
      }
    }
    if (timeout) {
      if (question.type === "text") {
        effectiveValue = value.trim();
      } else if (question.type === "close" || question.type === "ordering") {
        try {
          const parsed = JSON.parse(value || "null");
          effectiveValue = Array.isArray(parsed) && parsed.some((item) => String(item ?? "").trim()) ? value : "";
        } catch {
          effectiveValue = "";
        }
      }
    }
    try {
      await submitAnswer(code, me.playerId, { given: effectiveValue, timedOut: timeout });
    } finally {
      // Presentation only; never unlock a potentially accepted answer on a network delay.
      setSending(false);
    }
  };

  const handleValueChange = (nextValue: string) => {
    setValue(nextValue);
    if (state?.status === "active" && me && question) {
      const sequence = ++draftSequenceRef.current;
      setDraftStatus("saving");
      void saveAnswerDraft(code, me.playerId, nextValue).then((saved) => {
        if (sequence === draftSequenceRef.current) setDraftStatus(saved ? "saved" : "idle");
      });
    }
  };

  const onToggleMute = () => setMutedState(toggleMute());

  if (!identityReady) return <FullScreen theme={theme} msg="Подключаемся к комнате…" />;
  if (!me) {
    return (
      <PlayerShell theme={theme} stageKey="waiting">
        <div className="mx-auto max-w-md px-6 py-20 text-center">
          <h1 className="font-display text-2xl font-bold">Сначала присоединитесь</h1>
          <Link
            to="/join"
            className="mt-4 inline-flex rounded-xl bg-[color:var(--pt-accent)] px-5 py-3 font-bold text-black"
          >
            На /join
          </Link>
        </div>
      </PlayerShell>
    );
  }

  if (!state) return <FullScreen theme={theme} msg="Загружаем комнату..." />;

  // Dispatch to Jeopardy player when the game is a Jeopardy room
  if (state.gameKind === "jeopardy" && state.jeopardy) {
    return <JeopardyRoomPlayer state={state} code={code} me={me} theme={theme} />;
  }


  const MuteBtn = (
    <button
      type="button"
      onClick={onToggleMute}
      aria-label={muted ? "Включить звук" : "Выключить звук"}
      aria-pressed={!muted}
      className="player-utility-button inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-3 text-xs font-semibold"
    >
      {muted ? <VolumeX aria-hidden="true" className="h-4 w-4" /> : <Volume2 aria-hidden="true" className="h-4 w-4" />}
      <span className="hidden min-[370px]:inline">Звук</span>
    </button>
  );

  // ---- WAITING ----
  if (state.status === "waiting") {
    return (
      <PlayerShell theme={theme} stageKey="waiting">
        <div className="mx-auto max-w-lg px-6 py-16 text-center">
          <div className="flex items-center justify-center gap-2 pt-6">
            <RoomCodeBadge code={code} />
            {MuteBtn}
          </div>
          <Avatar name={me.nickname} avatar={me.avatar} size={80} className="mx-auto mt-6 iq-pop" />
          <h1 className="mt-3 font-display text-3xl font-black">Вы в комнате!</h1>
          <p className="mt-1 text-[color:var(--pt-text-muted)]">{me.nickname}</p>
          <p role="status" className="player-waiting-label mt-6 text-sm text-[color:var(--pt-text-muted)]">Ждём начала игры…</p>
          {quiz?.config.title && <p className="mt-2 break-words font-semibold">{quiz.config.title}</p>}
          <div className="mt-6 rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-4 text-left backdrop-blur-md">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[color:var(--pt-text-muted)]">
              <Users className="h-3.5 w-3.5" /> В комнате ({state.players.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {state.players.map((p) => (
                <div
                  key={p.id}
                  className={`iq-pop flex items-center gap-2 rounded-full px-3 py-1 text-sm ${
                    p.id === me.playerId
                      ? "bg-[color:var(--pt-accent)] text-black font-bold"
                      : "bg-[color:var(--pt-surface-strong)]"
                  }`}
                >
                  <Avatar name={p.nickname} avatar={p.avatar} size={22} />
                  {p.nickname}
                </div>
              ))}
            </div>
          </div>
        </div>
      </PlayerShell>
    );
  }

  // ---- FINISHED ----
  if (state.status === "finished") {
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    const place = sorted.findIndex((p) => p.id === me.playerId) + 1;
    return (
      <PlayerShell theme={theme} stageKey="finished">
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <div className="flex items-center justify-center gap-2">
            <RoomCodeBadge code={code} />
            {MuteBtn}
          </div>
          <Avatar name={me.nickname} avatar={me.avatar} size={96} className="mx-auto mt-6 iq-pop" />
          <Trophy className="mx-auto mt-4 h-10 w-10 text-[color:var(--pt-accent)]" />
          <h1 className="mt-2 font-display text-3xl font-black">{place === 1 ? "Победа!" : place <= 3 && place > 0 ? "Вы в тройке лучших!" : "Финал"}</h1>
          <p className="mt-1 text-[color:var(--pt-text-muted)]">
            Ваше место: <b className="text-[color:var(--pt-text)]">{place || "—"}</b>
          </p>
          <p className="mt-1 font-mono text-3xl font-bold">
            <PlayerScore value={myPlayer?.score ?? 0} />
          </p>
          <p className="mt-6 text-sm text-[color:var(--pt-text-muted)]">Спасибо за игру!</p>
          {!!myPlayer?.answerHistory?.length && <p className="mt-2 text-sm text-[color:var(--pt-text-muted)]">Верных ответов: {myPlayer.answerHistory.filter((answer) => answer.correct).length} из {myPlayer.answerHistory.length}</p>}
          <PlayerStandings players={sorted} playerId={me.playerId} />
          <Link
            to="/join"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[color:var(--pt-accent)] px-6 py-3 font-bold text-black transition-transform hover:scale-[1.02]"
          >
            Присоединиться к другой игре
          </Link>

        </div>
      </PlayerShell>
    );
  }

  // ---- LEADERBOARD (between questions) ----
  if (state.status === "leaderboard") {
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    const place = sorted.findIndex((p) => p.id === me.playerId) + 1;
    return (
      <PlayerShell theme={theme} stageKey="leaderboard">
        <div className="mx-auto max-w-md px-6 py-20 text-center">
          <div className="flex items-center justify-center gap-2">
            <RoomCodeBadge code={code} />
            {MuteBtn}
          </div>
          <Avatar name={me.nickname} avatar={me.avatar} size={72} className="mx-auto mt-8 iq-pop" />
          <p className="mt-4 text-sm uppercase tracking-widest text-[color:var(--pt-text-muted)]">
            Ваше место
          </p>
          <div className="my-2 font-display text-6xl font-black text-[color:var(--pt-accent)] tabular-nums">
            {place || "—"}
          </div>
          <p className="font-mono text-2xl font-bold">
            <PlayerScore value={myPlayer?.score ?? 0} />
          </p>
          <p className="mt-2 text-sm font-semibold text-[color:var(--pt-accent)]">{rankChange > 0 ? `↑ На ${rankChange} ${rankChange === 1 ? "место" : "места"} выше` : rankChange < 0 ? `↓ ${Math.abs(rankChange)} · Новый вопрос — новый шанс` : "Держим темп"}</p>
          <PlayerStandings players={sorted} playerId={me.playerId} />
          {showStreak && (
            <div
              role="status"
              className={`player-streak fixed left-1/2 z-50 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-lg bg-[color:var(--pt-accent)] px-4 py-2 font-bold text-black shadow-lg transition-opacity duration-300 ${streakFading ? "opacity-0" : "opacity-100"} animate-slide-up`}
            >
              <Flame className="h-4 w-4" /> Стрик {myPlayer?.streak}!
            </div>
          )}

          <p className="mt-6 text-sm text-[color:var(--pt-text-muted)]">Ждём следующий вопрос...</p>
        </div>
      </PlayerShell>
    );
  }

  if (!question) return <FullScreen theme={theme} msg="Ждём вопрос..." />;

  const isReveal = state.status === "reveal";
  const isTimeout = state.status === "timeout" || (state.status === "active" && timeLeft === 0 && !!state.questionStartAt && Date.now() >= state.questionStartAt + (question.time || 30) * 1000);
  const totalMs = (question.time || 30) * 1000;
  const timeSec = Math.ceil(timeLeft / 1000);
  const urgent = state.status === "active" && timeSec <= 5;
  const myAnswer =
    myPlayer?.lastAnswer?.questionIdx === state.questionIdx ? myPlayer.lastAnswer : undefined;
  const answerWasAccepted = state.playerAnswerSubmitted === true || !!myAnswer;

  return (
    <PlayerShell theme={theme} stageKey={`question-${state.questionIdx}`}>
      <div className="player-game mx-auto max-w-3xl px-3 pb-6 pt-2 min-[370px]:px-4 sm:pt-4">
        <header className="mb-4 flex min-w-0 items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2 font-semibold">
            <Avatar name={me.nickname} avatar={me.avatar} size={24} /> <span className="truncate">{me.nickname}</span>
          </span>
          <div className="flex flex-shrink-0 items-center gap-1.5 min-[370px]:gap-2">
            <RoomCodeBadge code={code} />
            {MuteBtn}
            <span aria-label="Счёт" className="min-w-8 text-right font-mono font-bold tabular-nums">
              <PlayerScore value={myPlayer?.score ?? 0} />
            </span>
          </div>
        </header>

        <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-widest text-[color:var(--pt-text-muted)]">
          <span>Вопрос {state.questionIdx + 1}{quiz ? ` / ${quiz.questions.length}` : ""}</span>
          <span role="timer" aria-live="off" className={`inline-flex items-center gap-1 tabular-nums ${urgent ? "font-bold text-danger" : ""}`}>
            <Timer aria-hidden="true" className="h-3.5 w-3.5" />
            {state.status === "active" ? `${timeSec}с` : state.status === "timeout" ? "Время вышло" : "—"}
          </span>
        </div>
        <TimerBar
          pct={state.status === "active" ? (timeLeft / totalMs) * 100 : 0}
          urgent={urgent}
        />

        <motion.div
          key={question.id ?? state.questionIdx}
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.22, ease: "easeOut" }}
          className="mt-4"
        >
          <QuizQuestionCard
            question={question}
            value={value}
            onChange={handleValueChange}
            onClickSound={sfx.click}
            reveal={isReveal}
            locked={submitted || isTimeout || isReveal || state.status !== "active"}
          />
        </motion.div>

        <div className="player-action-area" data-phase={isReveal ? "reveal" : isTimeout ? "timeout" : submitted ? "accepted" : "active"}>
        {state.status === "active" && !submitted && !isTimeout && (
          <div className="player-submit-bar z-20 flex items-center justify-between gap-3 py-3">
            <span role="status" className="text-xs text-[color:var(--pt-text-muted)]">
              {draftStatus === "saving" ? "Сохраняем…" : draftStatus === "saved" ? "Текущее состояние сохранено" : question.type === "ordering" ? "Расставьте по порядку" : question.type === "text" || question.type === "close" ? "Введите ответ" : "Выберите ответ"}
            </span>
            <button
              type="button"
              onClick={() => {
                sfx.click();
                doSubmit(false);
              }}
              disabled={!value}
              className="min-h-12 flex-shrink-0 rounded-lg bg-[color:var(--pt-accent)] px-7 font-bold text-black transition-[filter,transform,opacity] hover:brightness-105 active:scale-[0.98] disabled:opacity-40"
            >
              Ответить
            </button>
          </div>
        )}

          <AnimatePresence mode="sync" initial={false}>
            {(submitted || isTimeout || isReveal) && (
              <motion.div
                key={isReveal ? `reveal-${myAnswer?.correct ?? "missed"}` : isTimeout ? "timeout" : "submitted"}
                role="status"
                aria-live="polite"
                initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, position: "absolute" }}
                transition={{ duration: reducedMotion ? 0 : 0.18 }}
                className={`player-feedback mt-3 ${isReveal && myAnswer?.correct ? "player-feedback--correct" : isReveal && myAnswer ? "player-feedback--incorrect" : isTimeout ? "player-feedback--timeout" : ""}`}
              >
                {isReveal ? (
                  myAnswer ? (
                    <>
                      {myAnswer.correct ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
                      <div><strong>{myAnswer.correct ? "Верно!" : "Неверно"}</strong><span className={lastEarned > 0 ? "player-reward" : ""}>{lastEarned > 0 ? `+${lastEarned} очков` : "Следующий вопрос скоро"}</span></div>
                    </>
                  ) : (
                    <><X aria-hidden="true" /><div><strong>Не ответили</strong><span>Следующий вопрос скоро</span></div></>
                  )
                ) : isTimeout ? (
                  <><Timer aria-hidden="true" /><div><strong>Время вышло</strong><span>{answerWasAccepted ? "Ответ принят" : "Ответ не отправлен"}</span></div></>
                ) : (
                  <>{answerWasAccepted ? <Check aria-hidden="true" /> : <Hourglass aria-hidden="true" />}<div><strong>{answerWasAccepted ? "Ответ принят" : sending ? "Отправляем…" : "Ждём подтверждения…"}</strong><span>{answerWasAccepted ? "Ждём остальных…" : "Ваш выбор зафиксирован на устройстве"}</span></div></>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {showStreak && (
          <div
            role="status"
            className={`player-streak fixed left-1/2 z-50 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-lg bg-[color:var(--pt-accent)] px-4 py-2 font-bold text-black shadow-lg transition-opacity duration-300 ${streakFading ? "opacity-0" : "opacity-100"} animate-slide-up`}
          >
            <Flame className="h-4 w-4" /> Стрик {myPlayer?.streak}!
          </div>
        )}

      </div>
    </PlayerShell>
  );
}

function FullScreen({ theme, msg }: { theme: PlayerTheme; msg: string }) {
  return (
    <PlayerShell theme={theme}>
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <div aria-hidden="true" className="h-10 w-10 mx-auto animate-spin rounded-full border-2 border-[color:var(--pt-border)] border-t-[color:var(--pt-accent)]" />
        <p className="mt-4 text-[color:var(--pt-text-muted)]">{msg}</p>
      </div>
    </PlayerShell>
  );
}

function PlayerStandings({ players, playerId }: { players: RoomState["players"]; playerId: string }) {
  const reduced = useReducedMotion();
  const own = players.findIndex((p) => p.id === playerId);
  const visible = players.filter((_, i) => i < 3 || Math.abs(i - own) <= 1);
  return <ol aria-label="Таблица игроков" className="player-standings mt-6 space-y-2 text-left">
    {visible.map((player) => <motion.li layout={!reduced} key={player.id} className={`player-standing ${player.id === playerId ? "player-standing--me" : ""}`}>
      <span className="font-mono font-bold">{players.indexOf(player) + 1}</span>
      <Avatar name={player.nickname} avatar={player.avatar} size={28} />
      <span className="min-w-0 flex-1 truncate font-semibold">{player.nickname}{player.id === playerId ? " · вы" : ""}</span>
      <PlayerScore value={player.score} className="font-mono font-bold" />
    </motion.li>)}
  </ol>;
}

function RoomCodeBadge({ code }: { code: string }) {
  return (
    <span
      aria-label={`Код комнаты ${code}`}
      className="player-room-code inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-2.5 text-xs font-semibold"
    >
      <span className="text-[color:var(--pt-text-muted)]">Код</span>
      <span className="font-mono tracking-wider">{code}</span>
    </span>
  );
}
