// Player-side online Jeopardy. Board (turn mode) or waiting (buzz mode until
// question opens). Buzz button, final-round bet & text answer, personal podium.
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Trophy,
  Volume2,
  VolumeX,
  Bell,
  Users,
  Hourglass,
  Mic,
  Lock,
  Target,
  RotateCw,
  Timer as TimerIcon,
} from "lucide-react";
import { PlayerShell } from "@/components/player-shell";
import { Avatar } from "@/components/avatar";
import { LaTeX } from "@/lib/latex";
import {
  loadGame,
  buzzJeopardy,
  submitJeopardyBuzzAnswer,
  submitJeopardyFinalBet,
  submitJeopardyFinalAnswer,
  type RoomState,
} from "@/lib/api";
import { sfx, isMuted, toggleMute } from "@/lib/sounds";
import { fitQuestionSize } from "@/lib/fit-text";
import type { JeopardyData } from "@/lib/types";

interface Me {
  playerId: string;
  nickname: string;
  avatar: string;
}

export function JeopardyRoomPlayer({
  state,
  code,
  me,
}: {
  state: RoomState;
  code: string;
  me: Me;
}) {
  const [game, setGame] = useState<JeopardyData | null>(null);
  const [muted, setMutedState] = useState(true);
  const [betLocal, setBetLocal] = useState<string>("");
  const [answerLocal, setAnswerLocal] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState(0);
  const navigate = useNavigate();

  useEffect(() => setMutedState(isMuted()), []);
  useEffect(() => {
    loadGame<JeopardyData>("jeopardy", state.gameId).then((r) => r && setGame(r.data));
  }, [state.gameId]);

  // Redirect kicked players
  useEffect(() => {
    if (!state.players.some((p) => p.id === me.playerId)) {
      navigate({ to: "/join", replace: true });
    }
  }, [state.players, me.playerId, navigate]);

  const j = state.jeopardy!;
  const theme = game?.config.theme ?? "amber";
  const myPlayer = state.players.find((p) => p.id === me.playerId);
  const currentRound = game?.rounds[j.round] ?? [];
  const currentPlayer = state.players[j.currentPlayerIdx] ?? null;
  const isMyTurn = j.mode === "turn" && currentPlayer?.id === me.playerId;
  const question =
    j.selectedCat != null && j.selectedQ != null
      ? currentRound[j.selectedCat]?.questions[j.selectedQ]
      : null;

  // Buzz-mode timer display
  useEffect(() => {
    if (j.mode !== "buzz") return;
    if (j.phase !== "question" && j.phase !== "answering") return;
    const tick = () => {
      const running =
        j.phase === "question" && state.questionStartAt
          ? Date.now() - state.questionStartAt
          : 0;
      const elapsed = j.questionElapsedMs + running;
      setTimeLeft(Math.max(0, j.questionTotalMs - elapsed));
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [j.mode, j.phase, j.questionElapsedMs, j.questionTotalMs, state.questionStartAt]);

  const MuteBtn = (
    <button
      onClick={() => setMutedState(toggleMute())}
      className="inline-flex items-center gap-1 rounded-full border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-3 py-1.5 text-xs font-semibold"
    >
      {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      Звук
    </button>
  );

  if (!game) {
    return (
      <PlayerShell theme={theme}>
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <p className="text-[color:var(--pt-text-muted)]">Загрузка…</p>
        </div>
      </PlayerShell>
    );
  }

  // LOBBY
  if (j.phase === "lobby") {
    return (
      <PlayerShell theme={theme}>
        <div className="mx-auto max-w-lg px-6 py-16 text-center">
          <div className="flex justify-center">{MuteBtn}</div>
          <Avatar name={me.nickname} size={80} className="mx-auto mt-6 iq-pop" />
          <h1 className="mt-3 font-display text-3xl font-black">Вы в комнате!</h1>
          <p className="mt-1 text-[color:var(--pt-text-muted)]">{me.nickname}</p>
          <p className="mt-6 inline-flex items-center gap-2 text-sm text-[color:var(--pt-text-muted)]">
            Режим:
            {j.mode === "buzz" ? (
              <>
                <Bell className="h-4 w-4" /> по нажатию
              </>
            ) : (
              <>
                <RotateCw className="h-4 w-4" /> по очереди
              </>
            )}
          </p>
          <p className="mt-2 text-sm text-[color:var(--pt-text-muted)]">Ждём начала игры...</p>
          <div className="mt-6 rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-4 text-left">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-[color:var(--pt-text-muted)]">
              <Users className="h-3.5 w-3.5" /> В комнате ({state.players.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {state.players.map((p) => (
                <div
                  key={p.id}
                  className={`iq-pop flex items-center gap-2 rounded-full px-3 py-1 text-sm ${
                    p.id === me.playerId
                      ? "bg-[color:var(--pt-accent)] font-bold text-black"
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

  // BOARD (view-only: teacher / current player picks; players never click)
  if (j.phase === "board") {
    const maxRows = currentRound.reduce((m, c) => Math.max(m, c.questions.length), 0);
    return (
      <PlayerShell theme={theme}>
        <div className="mx-auto max-w-2xl px-4 py-6">
          <PlayerTop me={me} myScore={myPlayer?.score ?? 0} MuteBtn={MuteBtn} />
          <div className="mb-3 text-center text-sm">
            {j.mode === "turn" ? (
              isMyTurn ? (
                <p className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--pt-accent)]/20 px-3 py-2 font-bold text-[color:var(--pt-accent)]">
                  <Target className="h-4 w-4" /> Ваш ход — выберите вопрос
                </p>
              ) : (
                <p className="inline-flex items-center gap-2 text-[color:var(--pt-text-muted)]">
                  Ход: <Avatar name={currentPlayer?.nickname ?? "?"} size={18} />{" "}
                  <b>{currentPlayer?.nickname}</b>
                </p>
              )
            ) : (
              <p className="text-[color:var(--pt-text-muted)]">Учитель выбирает вопрос…</p>
            )}
          </div>
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `repeat(${currentRound.length}, minmax(0, 1fr))`,
              gridTemplateRows: `auto repeat(${maxRows}, minmax(0, 1fr))`,
            }}
          >
            {currentRound.map((cat, ci) => (
              <div
                key={`h-${ci}`}
                className="rounded-lg border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] p-2 text-center text-[10px] font-bold uppercase leading-tight"
                style={{ gridColumn: ci + 1, gridRow: 1 }}
              >
                {cat.category || `К${ci + 1}`}
              </div>
            ))}
            {currentRound.flatMap((cat, ci) =>
              Array.from({ length: maxRows }).map((_, ri) => {
                const q = cat.questions[ri];
                if (!q)
                  return (
                    <div
                      key={`e-${ci}-${ri}`}
                      style={{ gridColumn: ci + 1, gridRow: ri + 2 }}
                      className="rounded-lg border border-dashed border-[color:var(--pt-border)]/40 opacity-30"
                    />
                  );
                const key = `${j.round}-${ci}-${ri}`;
                const used = j.usedKeys.includes(key);
                return (
                  <div
                    key={`q-${ci}-${ri}`}
                    style={{ gridColumn: ci + 1, gridRow: ri + 2 }}
                    className={`grid place-items-center rounded-lg border border-[color:var(--pt-border)] py-4 font-display text-lg font-black ${
                      used
                        ? "opacity-20"
                        : "bg-[color:var(--pt-surface)] text-[color:var(--pt-accent)]"
                    }`}
                  >
                    {q.points}
                  </div>
                );
              }),
            )}
          </div>
        </div>
      </PlayerShell>
    );
  }

  // QUESTION / ANSWERING / REVEAL
  if (
    (j.phase === "question" || j.phase === "answering" || j.phase === "reveal") &&
    question
  ) {
    const iAmBuzzed = j.buzzedPlayerId === me.playerId;
    const isTurnAnswerer = j.mode === "turn" && isMyTurn;
    const alreadyTried = j.buzzedPlayerIds?.includes(me.playerId);
    const canBuzz =
      j.mode === "buzz" &&
      j.phase === "question" &&
      !j.buzzedPlayerId &&
      !alreadyTried;
    return (
      <PlayerShell theme={theme}>
        <div className="mx-auto max-w-2xl px-4 py-6">
          <PlayerTop me={me} myScore={myPlayer?.score ?? 0} MuteBtn={MuteBtn} />
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-widest text-[color:var(--pt-text-muted)]">
            <span>
              {currentRound[j.selectedCat!]?.category ?? "—"} · {question.points}
            </span>
            {j.mode === "buzz" && (j.phase === "question" || j.phase === "answering") && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono ${
                  timeLeft <= 5000
                    ? "bg-danger/20 text-danger"
                    : "bg-[color:var(--pt-surface-strong)]"
                }`}
              >
                <TimerIcon className="h-3 w-3" />
                {Math.ceil(timeLeft / 1000)}с
              </span>
            )}
          </div>
          {question.image && (
            <img
              src={question.image}
              alt=""
              className="mx-auto mb-4 max-h-40 rounded-xl object-contain"
            />
          )}
          <div
            className={`rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-6 text-center font-semibold ${fitQuestionSize(question.q)}`}
          >
            <LaTeX>{question.q}</LaTeX>
          </div>

          {(j.phase === "reveal" || j.showAnswer) && (
            <p className="mt-4 text-center text-xl font-bold text-[color:var(--pt-accent)]">
              Ответ: <LaTeX>{question.a}</LaTeX>
            </p>
          )}

          {canBuzz && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => {
                  sfx.click();
                  buzzJeopardy(code, me.playerId);
                }}
                className="inline-flex h-24 w-24 items-center justify-center rounded-full bg-[color:var(--pt-accent)] text-4xl font-bold text-black shadow-lg transition-transform hover:scale-110 active:scale-95 iq-bounce"
              >
                <Bell className="h-10 w-10" />
              </button>
            </div>
          )}

          {j.mode === "buzz" && alreadyTried && j.phase === "question" && (
            <p className="mt-6 text-center text-sm text-[color:var(--pt-text-muted)]">
              Вы уже пробовали — ждём других команд.
            </p>
          )}

          {j.phase === "answering" && (
            <div className="mt-6 text-center">
              {iAmBuzzed ? (
                <BuzzAnswerBox
                  code={code}
                  me={me}
                  submittedAnswer={j.buzzedAnswer}
                  startAt={j.buzzStartAt}
                  totalMs={j.buzzTimeoutMs}
                />
              ) : (
                <p className="text-sm text-[color:var(--pt-text-muted)]">
                  Отвечает {state.players.find((p) => p.id === j.buzzedPlayerId)?.nickname}…
                </p>
              )}
            </div>
          )}

          {isTurnAnswerer && j.phase === "question" && (
            <div className="mt-6 text-center">
              <p className="inline-flex items-center gap-2 text-xl font-bold text-[color:var(--pt-accent)]">
                <Mic className="h-5 w-5" /> Ваш ход — отвечайте вслух!
              </p>
            </div>
          )}

          {j.mode === "buzz" && !canBuzz && !alreadyTried && j.phase === "question" && !iAmBuzzed && (
            <p className="mt-6 text-center text-sm text-[color:var(--pt-text-muted)]">
              Ждём вопрос…
            </p>
          )}
        </div>
      </PlayerShell>
    );
  }

  // FINAL BETS
  if (j.phase === "final-bets") {
    const cap = Math.max(0, myPlayer?.score ?? 0);
    const saved = j.finalBets[me.playerId];
    return (
      <PlayerShell theme={theme}>
        <div className="mx-auto max-w-md px-4 py-8">
          <PlayerTop me={me} myScore={myPlayer?.score ?? 0} MuteBtn={MuteBtn} />
          <h1 className="mt-4 font-display text-2xl font-black">Финал · ставка</h1>
          <p className="mt-2 text-sm text-[color:var(--pt-text-muted)]">
            Категория: <b>{game.final.category || "секретно"}</b>. Ставьте от 0 до {cap}.
          </p>
          <input
            type="number"
            min={0}
            max={cap}
            className="mt-4 w-full rounded-xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] px-4 py-3 text-right font-mono text-2xl font-bold"
            value={betLocal || (saved ?? "").toString()}
            onChange={(e) => setBetLocal(e.target.value)}
            disabled={saved != null}
          />
          {saved != null ? (
            <p className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-success/20 p-3 text-center text-sm font-bold text-success">
              <Lock className="h-4 w-4" /> Ставка {saved} заблокирована
            </p>
          ) : (
            <button
              onClick={() => {
                const v = Math.max(0, Math.min(cap, parseInt(betLocal) || 0));
                submitJeopardyFinalBet(code, me.playerId, v);
              }}
              className="mt-4 w-full rounded-xl bg-[color:var(--pt-accent)] py-3 font-bold text-black"
            >
              Подтвердить ставку
            </button>
          )}
        </div>
      </PlayerShell>
    );
  }

  // FINAL QUESTION
  if (j.phase === "final-question") {
    const given = j.finalGiven[me.playerId];
    return (
      <PlayerShell theme={theme}>
        <div className="mx-auto max-w-md px-4 py-8">
          <PlayerTop me={me} myScore={myPlayer?.score ?? 0} MuteBtn={MuteBtn} />
          <p className="mt-4 text-center text-xs uppercase tracking-widest text-[color:var(--pt-text-muted)]">
            Финал · ставка {j.finalBets[me.playerId] ?? 0}
          </p>
          <div
            className={`mt-2 rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-6 text-center font-semibold ${fitQuestionSize(game.final.q)}`}
          >
            <LaTeX>{game.final.q}</LaTeX>
          </div>
          <input
            type="text"
            className="mt-4 w-full rounded-xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] px-4 py-3 text-lg"
            placeholder="Ваш ответ…"
            value={answerLocal || given || ""}
            onChange={(e) => setAnswerLocal(e.target.value)}
            disabled={given != null}
          />
          {given != null ? (
            <p className="mt-4 rounded-xl bg-success/20 p-3 text-center text-sm font-bold text-success">
              <Hourglass className="mr-1 inline h-4 w-4" /> Ответ отправлен
            </p>
          ) : (
            <button
              onClick={() =>
                submitJeopardyFinalAnswer(code, me.playerId, answerLocal.trim())
              }
              disabled={!answerLocal.trim()}
              className="mt-4 w-full rounded-xl bg-[color:var(--pt-accent)] py-3 font-bold text-black disabled:opacity-40"
            >
              Отправить ответ
            </button>
          )}
        </div>
      </PlayerShell>
    );
  }

  // FINAL REVEAL
  if (j.phase === "final-reveal") {
    return (
      <PlayerShell theme={theme}>
        <div className="mx-auto max-w-md px-4 py-8 text-center">
          <PlayerTop me={me} myScore={myPlayer?.score ?? 0} MuteBtn={MuteBtn} />
          <p className="mt-6 text-sm uppercase tracking-widest text-[color:var(--pt-text-muted)]">
            Ответ был:
          </p>
          <p className="mt-1 font-display text-2xl font-black text-[color:var(--pt-accent)]">
            {game.final.a}
          </p>
          <p className="mt-4 font-mono text-3xl font-bold">
            {myPlayer?.score.toLocaleString("ru-RU") ?? 0}
          </p>
          <p className="mt-6 text-sm text-[color:var(--pt-text-muted)]">
            Ждём объявления победителей…
          </p>
        </div>
      </PlayerShell>
    );
  }

  // PODIUM
  if (j.phase === "podium" || state.status === "finished") {
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    const place = sorted.findIndex((p) => p.id === me.playerId) + 1;
    return (
      <PlayerShell theme={theme}>
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <div className="flex justify-center">{MuteBtn}</div>
          <Avatar name={me.nickname} size={96} className="mx-auto mt-6 iq-bounce" />
          <Trophy className="mx-auto mt-4 h-10 w-10 text-[color:var(--pt-accent)]" />
          <h1 className="mt-2 font-display text-3xl font-black">Финал</h1>
          <p className="mt-1 text-[color:var(--pt-text-muted)]">
            Ваше место: <b className="text-[color:var(--pt-text)]">{place || "—"}</b>
          </p>
          <p className="mt-1 font-mono text-3xl font-bold">
            {myPlayer?.score.toLocaleString("ru-RU") ?? 0}
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-5 py-3 font-bold"
          >
            На главную
          </Link>
        </div>
      </PlayerShell>
    );
  }

  return (
    <PlayerShell theme={theme}>
      <div className="mx-auto max-w-md px-6 py-16 text-center text-[color:var(--pt-text-muted)]">
        Ждём…
      </div>
    </PlayerShell>
  );
}

function PlayerTop({
  me,
  myScore,
  MuteBtn,
}: {
  me: Me;
  myScore: number;
  MuteBtn: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 font-semibold">
        <Avatar name={me.nickname} size={26} /> {me.nickname}
      </span>
      <div className="flex items-center gap-2">
        {MuteBtn}
        <span className="font-mono font-bold">{myScore.toLocaleString("ru-RU")}</span>
      </div>
    </div>
  );
}

function BuzzAnswerBox({
  code,
  me,
  submittedAnswer,
  startAt,
  totalMs,
}: {
  code: string;
  me: Me;
  submittedAnswer: string | null;
  startAt: number | null;
  totalMs: number;
}) {
  const [val, setVal] = useState("");
  const [left, setLeft] = useState(totalMs);
  useEffect(() => {
    if (!startAt) return;
    const tick = () => setLeft(Math.max(0, totalMs - (Date.now() - startAt)));
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [startAt, totalMs]);
  const sec = Math.ceil(left / 1000);
  const submitted = submittedAnswer != null;
  return (
    <div className="mx-auto max-w-md space-y-3">
      <div
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-sm font-bold ${
          sec <= 5 ? "bg-danger/20 text-danger" : "bg-[color:var(--pt-surface-strong)]"
        }`}
      >
        <TimerIcon className="h-4 w-4" /> {sec}с
      </div>
      {submitted ? (
        <p className="rounded-xl bg-success/20 p-3 text-center text-sm font-bold text-success">
          <Mic className="mr-1 inline h-4 w-4" /> Ответ отправлен: «{submittedAnswer || "—"}»
        </p>
      ) : (
        <>
          <input
            type="text"
            value={val}
            autoFocus
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && val.trim()) {
                submitJeopardyBuzzAnswer(code, me.playerId, val.trim());
              }
            }}
            placeholder="Ваш ответ…"
            className="w-full rounded-xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] px-4 py-3 text-lg"
          />
          <button
            onClick={() => val.trim() && submitJeopardyBuzzAnswer(code, me.playerId, val.trim())}
            disabled={!val.trim()}
            className="w-full rounded-xl bg-[color:var(--pt-accent)] py-3 font-bold text-black disabled:opacity-40"
          >
            Отправить
          </button>
        </>
      )}
    </div>
  );
}

