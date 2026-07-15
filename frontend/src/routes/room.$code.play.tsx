// Student-side online player. Themed via PlayerShell, uses QuizQuestionCard
// so all four question types (choice/bool/text/matching) work identically to
// the offline experience. Sends the computed correctness up to the shared
// room state so the teacher's projector can drive the flow.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Hourglass, Trophy, Timer, Volume2, VolumeX, Users, Flame, Check, X } from "lucide-react";
import { PlayerShell, TimerBar } from "@/components/player-shell";
import { Avatar } from "@/components/avatar";
import { QuizQuestionCard, checkQuizAnswer } from "@/components/quiz-question-card";
import { JeopardyRoomPlayer } from "@/components/jeopardy-room-player";
import { subscribeRoom, loadGame, submitAnswer, type RoomState } from "@/lib/api";
import { sfx, isMuted, toggleMute } from "@/lib/sounds";
import type { QuizData, QuizQuestion } from "@/lib/types";


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
  const [value, setValue] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);
  const [lastEarned, setLastEarned] = useState<number>(0);
  const [muted, setMutedState] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [showStreak, setShowStreak] = useState(false);
  const [streakFading, setStreakFading] = useState(false);
  const prevStatus = useRef<RoomState["status"] | null>(null);
  const navigate = useNavigate();

  useEffect(() => setMutedState(isMuted()), []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`islandquiz.me.${code}`);
      if (raw) setMe(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [code]);

  useEffect(() => subscribeRoom(code, setState), [code]);

  useEffect(() => {
    if (!state || quiz) return;
    loadGame<QuizData>("quiz", state.gameId).then((rec) => rec && setQuiz(rec.data));
  }, [state, quiz]);

  const theme = quiz?.config.theme ?? "amber";
  const question: QuizQuestion | undefined =
    quiz && state ? quiz.questions[state.questionIdx] : undefined;
  const myPlayer = useMemo(() => state?.players.find((p) => p.id === me?.playerId), [state, me]);

  // Reset per-question state
  useEffect(() => {
    if (state?.status === "active") {
      setValue("");
      setSubmitted(false);
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
    if (!state || !question || !me || submitted) return;
    setSubmitted(true);
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
    if (timeout && (question.type === "close" || question.type === "ordering")) {
      effectiveValue = "[]";
    }
    const correct = timeout || !effectiveValue ? false : checkQuizAnswer(question, effectiveValue);
    const total = (question.time || 30) * 1000;
    const timeMs = state.questionStartAt
      ? Math.min(total, Date.now() - state.questionStartAt)
      : total;
    await submitAnswer(code, me.playerId, {
      correct,
      timeMs,
      totalMs: total,
      given: effectiveValue,
    });
  };

  const onToggleMute = () => setMutedState(toggleMute());

  if (!me) {
    return (
      <PlayerShell theme={theme}>
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
    return <JeopardyRoomPlayer state={state} code={code} me={me} />;
  }


  const MuteBtn = (
    <button
      onClick={onToggleMute}
      className="inline-flex items-center gap-1 rounded-full border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-3 py-1.5 text-xs font-semibold"
    >
      {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      {muted ? "Звук" : "Звук"}
    </button>
  );

  // ---- WAITING ----
  if (state.status === "waiting") {
    return (
      <PlayerShell theme={theme}>
        <div className="mx-auto max-w-lg px-6 py-16 text-center">
          <div className="flex justify-center pt-6">{MuteBtn}</div>
          <Avatar name={me.nickname} size={80} className="mx-auto mt-6 iq-pop" />
          <h1 className="mt-3 font-display text-3xl font-black">Вы в комнате!</h1>
          <p className="mt-1 text-[color:var(--pt-text-muted)]">{me.nickname}</p>
          <p className="mt-6 text-sm text-[color:var(--pt-text-muted)]">Ждём начала игры...</p>
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
                  <Avatar name={p.nickname} size={22} />
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
    const isPodium = place > 0 && place <= 3;
    return (
      <PlayerShell theme={theme}>
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <div className="flex justify-center">{MuteBtn}</div>
          <Avatar name={me.nickname} size={96} className={`mx-auto mt-6 ${isPodium ? "iq-bounce" : "iq-pop"}`} />
          <Trophy className="mx-auto mt-4 h-10 w-10 text-[color:var(--pt-accent)]" />
          <h1 className="mt-2 font-display text-3xl font-black">Финал</h1>
          <p className="mt-1 text-[color:var(--pt-text-muted)]">
            Ваше место: <b className="text-[color:var(--pt-text)]">{place || "—"}</b>
          </p>
          <p className="mt-1 font-mono text-3xl font-bold">
            {myPlayer?.score.toLocaleString("ru-RU") ?? 0}
          </p>
          <p className="mt-6 text-sm text-[color:var(--pt-text-muted)]">Спасибо за игру!</p>
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
      <PlayerShell theme={theme}>
        <div className="mx-auto max-w-md px-6 py-20 text-center">
          <div className="flex justify-center">{MuteBtn}</div>
          <Avatar name={me.nickname} size={80} className="mx-auto mt-8 iq-bounce" />
          <p className="mt-4 text-sm uppercase tracking-widest text-[color:var(--pt-text-muted)]">
            Ваше место
          </p>
          <div className="my-2 font-display text-7xl font-black text-[color:var(--pt-accent)]">
            {place || "—"}
          </div>
          <p className="font-mono text-2xl font-bold">
            {myPlayer?.score.toLocaleString("ru-RU") ?? 0}
          </p>
          {showStreak && (
            <div
              className={`fixed left-1/2 bottom-8 z-50 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[color:var(--pt-accent)] px-4 py-2 font-bold text-black shadow-lg transition-opacity duration-300 ${streakFading ? "opacity-0" : "opacity-100"} animate-slide-up`}
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
  const totalMs = (question.time || 30) * 1000;
  const timeSec = Math.ceil(timeLeft / 1000);
  const urgent = state.status === "active" && timeSec <= 5;
  const myAnswer =
    myPlayer?.lastAnswer?.questionIdx === state.questionIdx ? myPlayer.lastAnswer : undefined;

  return (
    <PlayerShell theme={theme}>
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 font-semibold">
            <Avatar name={me.nickname} size={24} /> {me.nickname}
          </span>
          <div className="flex items-center gap-2">
            {MuteBtn}
            <span className="font-mono font-bold">
              {myPlayer?.score.toLocaleString("ru-RU") ?? 0}
            </span>
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-widest text-[color:var(--pt-text-muted)]">
          <span>Вопрос {state.questionIdx + 1}</span>
          <span className="inline-flex items-center gap-1">
            <Timer className="h-3.5 w-3.5" />
            {state.status === "active" ? `${timeSec}с` : "—"}
          </span>
        </div>
        <TimerBar
          pct={state.status === "active" ? (timeLeft / totalMs) * 100 : 100}
          urgent={urgent}
        />

        <div className="mt-4">
          <QuizQuestionCard
            question={question}
            value={value}
            onChange={(v) => setValue(v)}
            onClickSound={sfx.click}
            reveal={isReveal}
            locked={submitted || isReveal}
          />
        </div>

        {state.status === "active" && !submitted && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                sfx.click();
                doSubmit(false);
              }}
              disabled={!value}
              className="rounded-xl bg-[color:var(--pt-accent)] px-8 py-3 font-bold text-black transition-transform hover:scale-[1.02] disabled:opacity-40"
            >
              Ответить
            </button>
          </div>
        )}

        {submitted && !isReveal && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-4 backdrop-blur-md">
            <Hourglass className="h-4 w-4 text-[color:var(--pt-accent)]" />
            <span>Ответ отправлен ⌛ ждём остальных...</span>
          </div>
        )}

        {isReveal && myAnswer && (
          <div className="relative mt-4 text-center">
            {myAnswer.correct ? (
              <p className="inline-flex items-center justify-center gap-2 text-2xl font-bold text-success">
                <Check className="h-6 w-6" /> Верно!
              </p>
            ) : (
              <p className="inline-flex items-center justify-center gap-2 text-2xl font-bold text-danger">
                <X className="h-6 w-6" /> Неверно
              </p>
            )}
            {lastEarned > 0 && (
              <span className="iq-points-fly pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-success/20 px-3 py-1 font-bold text-success">
                +{lastEarned}
              </span>
            )}
          </div>
        )}

        {isReveal && !myAnswer && (
          <p className="mt-4 text-center text-sm text-[color:var(--pt-text-muted)]">
            Вы не успели ответить
          </p>
        )}

        {showStreak && (
          <div
            className={`fixed left-1/2 bottom-8 z-50 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[color:var(--pt-accent)] px-4 py-2 font-bold text-black shadow-lg transition-opacity duration-300 ${streakFading ? "opacity-0" : "opacity-100"} animate-slide-up`}
          >
            <Flame className="h-4 w-4" /> Стрик {myPlayer?.streak}!
          </div>
        )}

      </div>
    </PlayerShell>
  );
}

function FullScreen({ theme, msg }: { theme: QuizData["config"]["theme"]; msg: string }) {
  return (
    <PlayerShell theme={theme}>
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <div className="h-10 w-10 mx-auto animate-spin rounded-full border-2 border-[color:var(--pt-border)] border-t-[color:var(--pt-accent)]" />
        <p className="mt-4 text-[color:var(--pt-text-muted)]">{msg}</p>
      </div>
    </PlayerShell>
  );
}
