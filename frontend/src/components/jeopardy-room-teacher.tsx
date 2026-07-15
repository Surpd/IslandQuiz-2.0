// Teacher-side online Jeopardy room. Grid selection (both modes),
// buzz timer with pause/resume, judgement buttons, score adjustment
// (± with custom amount), final round, podium.
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Play,
  Radio,
  Trophy,
  Users,
  X,
  Volume2,
  VolumeX,
  Check,
  Flag,
  SkipForward,
  ArrowLeft,
  Plus,
  Minus,
  Bell,
  RotateCw,
  Mic,
  Lock,
  Timer as TimerIcon,
  StopCircle,
  FileText,
} from "lucide-react";
import { PlayerShell } from "@/components/player-shell";
import { Avatar } from "@/components/avatar";
import { LaTeX } from "@/lib/latex";
import { loadGame } from "@/lib/api";
import {
  setJeopardyMode,
  startJeopardyGame,
  selectJeopardyQuestion,
  acceptJeopardyAnswer,
  skipJeopardyQuestion,
  closeJeopardyQuestion,
  endJeopardyRound,
  backToBoard,
  startJeopardyFinalQuestion,
  markJeopardyFinal,
  revealJeopardyFinal,
  advanceJeopardyFinalReveal,
  finalizeJeopardyTurnWrong,
  finishJeopardyGame,
  adjustJeopardyScore,
  kickPlayer,
  type RoomState,
  type RoomPlayer,
} from "@/lib/api";
import { sfx, isMuted, toggleMute } from "@/lib/sounds";
import { fitQuestionSize } from "@/lib/fit-text";
import type { JeopardyData } from "@/lib/types";

export function JeopardyRoomTeacher({ state, code }: { state: RoomState; code: string }) {
  const [game, setGame] = useState<JeopardyData | null>(null);
  const [muted, setMutedState] = useState(true);
  const [copied, setCopied] = useState(false);
  const prevPhase = useRef<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => setMutedState(isMuted()), []);
  useEffect(() => {
    loadGame<JeopardyData>("jeopardy", state.gameId).then((r) => r && setGame(r.data));
  }, [state.gameId]);

  const j = state.jeopardy!;
  const theme = game?.config.theme ?? "amber";

  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = j.phase;
    if (prev === j.phase) return;
    if (j.phase === "question") sfx.whoosh();
    if (j.phase === "answering") sfx.tick();
    if (j.phase === "reveal") sfx.click();
    if (j.phase === "podium") sfx.fanfare();
  }, [j.phase]);

  // Buzz-mode timer
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

  // Auto-close on timeout (only teacher triggers this)
  useEffect(() => {
    if (j.mode !== "buzz" || j.phase !== "question") return;
    if (timeLeft > 0) return;
    if (!state.questionStartAt) return;
    void closeJeopardyQuestion(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, j.phase, j.mode]);

  if (!game) {
    return (
      <PlayerShell theme={theme}>
        <div className="mx-auto max-w-md px-6 py-20 text-center">
          <p>Загрузка игры…</p>
        </div>
      </PlayerShell>
    );
  }

  const joinUrl = typeof window !== "undefined" ? `${window.location.origin}/join` : "/join";
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(joinUrl)}`;
  const currentRound = game.rounds[j.round] ?? [];
  const currentPlayer = state.players[j.currentPlayerIdx] ?? null;
  const buzzed = state.players.find((p) => p.id === j.buzzedPlayerId) ?? null;
  const question =
    j.selectedCat != null && j.selectedQ != null
      ? currentRound[j.selectedCat]?.questions[j.selectedQ]
      : null;
  const totalAnswered = j.usedKeys.length;
  const totalQuestions = currentRound.reduce((s, c) => s + c.questions.length, 0);
  const roundTitle = game.config.roundTitles?.[j.round] ?? `Раунд ${j.round + 1}`;
  const isLastRound = j.round + 1 >= game.rounds.length;

  const onToggleMute = () => setMutedState(toggleMute());
  const copyCode = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  const TopBar = (
    <div className="flex items-center justify-between gap-3 pl-14">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-widest text-[color:var(--pt-text-muted)]">
          Онлайн-комната · Своя игра
        </p>
        <h1 className="truncate font-display text-lg font-bold md:text-2xl">
          {game.config.title || "Своя игра"}{" "}
          <span className="text-[color:var(--pt-text-muted)]">· {code}</span>
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={`/room/${code}/answers`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-3 py-2 text-xs font-semibold hover:bg-[color:var(--pt-surface)]"
        >
          <FileText className="h-4 w-4" /> Ответы
        </a>
        <button
          onClick={onToggleMute}
          className="inline-flex items-center gap-2 rounded-full border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-3 py-2 text-xs font-semibold"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          {muted ? "Звук выкл" : "Звук вкл"}
        </button>
      </div>
    </div>
  );

  const highlightId =
    j.mode === "turn" && currentPlayer
      ? currentPlayer.id
      : j.mode === "buzz"
        ? j.buzzedPlayerId
        : null;

  return (
    <PlayerShell theme={theme}>
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        {TopBar}

        {/* LOBBY */}
        {j.phase === "lobby" && (
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
                  onClick={copyCode}
                  className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-4 py-2 text-sm font-semibold"
                >
                  <Copy className="h-4 w-4" /> {copied ? "Скопировано" : "Копировать"}
                </button>
              </div>

              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold">Режим игры</p>
                <div className="inline-flex overflow-hidden rounded-xl border border-[color:var(--pt-border)]">
                  <button
                    onClick={() => setJeopardyMode(code, "buzz")}
                    className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-bold ${j.mode === "buzz" ? "bg-[color:var(--pt-accent)] text-black" : "bg-[color:var(--pt-surface-strong)]"}`}
                  >
                    <Bell className="h-4 w-4" /> По нажатию
                  </button>
                  <button
                    onClick={() => setJeopardyMode(code, "turn")}
                    className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-bold ${j.mode === "turn" ? "bg-[color:var(--pt-accent)] text-black" : "bg-[color:var(--pt-surface-strong)]"}`}
                  >
                    <RotateCw className="h-4 w-4" /> По очереди
                  </button>
                </div>
                <p className="mt-2 text-xs text-[color:var(--pt-text-muted)]">
                  {j.mode === "buzz"
                    ? "Учитель открывает вопрос — команды жмут кнопку. Первый отвечает; при ошибке таймер продолжается и другие могут жать."
                    : "Команды выбирают вопросы по очереди. Ход всегда переходит следующей команде."}
                </p>
              </div>

              <button
                onClick={() => {
                  sfx.whoosh();
                  startJeopardyGame(code);
                }}
                disabled={state.players.length === 0}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[color:var(--pt-accent)] px-6 py-3 font-bold text-black transition-transform hover:scale-[1.02] disabled:opacity-40"
              >
                <Play className="h-4 w-4" /> Начать игру ({state.players.length})
              </button>
            </div>
            <div className="grid place-items-center rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-6 backdrop-blur-md">
              <img src={qrUrl} alt="QR" className="rounded-xl" />
              <p className="mt-2 text-xs text-[color:var(--pt-text-muted)]">QR ведёт на /join</p>
            </div>
            <div className="rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-6 backdrop-blur-md md:col-span-2">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[color:var(--pt-text-muted)]">
                <Users className="h-4 w-4" /> Команды ({state.players.length})
              </div>
              {state.players.length === 0 ? (
                <p className="text-sm text-[color:var(--pt-text-muted)]">Ждём подключения...</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {state.players.map((p) => (
                    <div
                      key={p.id}
                      className="iq-pop flex items-center gap-2 rounded-full bg-[color:var(--pt-surface-strong)] px-3 py-1.5 text-sm font-semibold"
                    >
                      <Avatar name={p.nickname} size={24} />
                      {p.nickname}
                      <button
                        onClick={() => kickPlayer(code, p.id)}
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
        )}

        {/* BOARD */}
        {j.phase === "board" && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[3fr_1fr]">
            <div className="animate-fade-up">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold">
                  {roundTitle} · {totalAnswered}/{totalQuestions}
                </span>
                <div className="flex items-center gap-2 text-xs">
                  {j.mode === "turn" && currentPlayer && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--pt-accent)]/20 px-3 py-1 font-bold text-[color:var(--pt-accent)]">
                      <Avatar name={currentPlayer.nickname} size={18} /> Ход:{" "}
                      {currentPlayer.nickname}
                    </span>
                  )}
                  <button
                    onClick={() => endJeopardyRound(code)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-3 py-1.5 font-semibold hover:bg-[color:var(--pt-surface)]"
                  >
                    <Flag className="h-3 w-3" /> {isLastRound ? "К финалу" : "Досрочно завершить"}
                  </button>
                </div>
              </div>
              <JBoard
                round={currentRound}
                usedKeys={j.usedKeys}
                roundIdx={j.round}
                onSelect={(ci, ri) => {
                  sfx.click();
                  selectJeopardyQuestion(code, null, ci, ri);
                }}
              />
            </div>
            <div className="space-y-4">
              <JLeaderboard
                state={state}
                highlightId={highlightId}
                onAdjust={(id, d) => adjustJeopardyScore(code, id, d)}
              />
            </div>
          </div>
        )}

        {/* QUESTION or ANSWERING or REVEAL */}
        {(j.phase === "question" || j.phase === "answering" || j.phase === "reveal") &&
          question && (
            <div className="mt-6 grid gap-6 lg:grid-cols-[3fr_1fr]">
              <div className="animate-fade-up">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="font-semibold">
                    {currentRound[j.selectedCat!]?.category ?? `Категория ${j.selectedCat! + 1}`} ·{" "}
                    <span className="text-[color:var(--pt-accent)]">{question.points}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {j.mode === "buzz" &&
                      (j.phase === "question" || j.phase === "answering") && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-mono text-sm font-bold ${
                            timeLeft <= 5000
                              ? "bg-danger/20 text-danger"
                              : "bg-[color:var(--pt-surface-strong)]"
                          }`}
                        >
                          <TimerIcon className="h-3.5 w-3.5" />
                          {Math.ceil(timeLeft / 1000)}с
                        </span>
                      )}
                    {(j.phase === "question" || j.phase === "answering") && (
                      <button
                        onClick={() => closeJeopardyQuestion(code)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-3 py-1.5 text-xs font-semibold"
                      >
                        <StopCircle className="h-3 w-3" /> Закрыть
                      </button>
                    )}
                    <button
                      onClick={() => skipJeopardyQuestion(code)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-3 py-1.5 text-xs font-semibold"
                    >
                      <SkipForward className="h-3 w-3" /> Пропустить
                    </button>
                  </div>
                </div>
                {question.image && (
                  <img
                    src={question.image}
                    alt=""
                    className="mx-auto mb-4 max-h-56 rounded-xl object-contain"
                  />
                )}
                <div
                  className={`rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-8 text-center font-semibold ${fitQuestionSize(question.q)}`}
                >
                  <LaTeX>{question.q}</LaTeX>
                </div>
                {(j.phase === "reveal" || j.showAnswer) && (
                  <p className="mt-4 text-center text-2xl font-bold text-[color:var(--pt-accent)]">
                    Ответ: <LaTeX>{question.a}</LaTeX>
                  </p>
                )}

                {j.phase === "answering" && buzzed && (
                  <div className="mt-6 rounded-2xl bg-[color:var(--pt-accent)]/15 p-4 text-center">
                    <p className="text-sm text-[color:var(--pt-text-muted)]">Отвечает:</p>
                    <p className="mt-1 flex items-center justify-center gap-2 font-display text-2xl font-black">
                      <Avatar name={buzzed.nickname} size={32} /> {buzzed.nickname}
                    </p>
                    {j.buzzedAnswer != null ? (
                      <p className="mt-3 rounded-xl bg-[color:var(--pt-surface)] px-4 py-3 text-lg font-semibold">
                        «{j.buzzedAnswer || "—"}»
                      </p>
                    ) : (
                      <p className="mt-3 text-sm text-[color:var(--pt-text-muted)]">
                        Ждём ответ игрока…
                      </p>
                    )}
                  </div>
                )}

                {j.mode === "turn" && j.phase === "question" && currentPlayer && (
                  <div className="mt-6 rounded-2xl bg-[color:var(--pt-accent)]/15 p-4 text-center">
                    <p className="text-sm text-[color:var(--pt-text-muted)]">Отвечает по очереди:</p>
                    <p className="mt-1 flex items-center justify-center gap-2 font-display text-2xl font-black">
                      <Avatar name={currentPlayer.nickname} size={32} /> {currentPlayer.nickname}
                    </p>
                  </div>
                )}

                {/* Judgement buttons */}
                {!j.awaitingBonus &&
                  (j.phase === "answering" ||
                    (j.mode === "turn" && j.phase === "question")) && (
                    <div className="mt-6 flex justify-center gap-3">
                      <button
                        onClick={() => acceptJeopardyAnswer(code, true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-success px-6 py-3 font-bold text-white hover:scale-[1.02]"
                      >
                        <Check className="h-5 w-5" /> Верно (+{question.points})
                      </button>
                      <button
                        onClick={() => acceptJeopardyAnswer(code, false)}
                        className="inline-flex items-center gap-2 rounded-xl bg-danger px-6 py-3 font-bold text-white hover:scale-[1.02]"
                      >
                        <X className="h-5 w-5" /> Неверно (−{question.points})
                      </button>
                    </div>
                  )}

                {/* Turn-wrong bonus panel */}
                {j.awaitingBonus && j.mode === "turn" && (
                  <div className="mt-6 rounded-2xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-4">
                    <p className="mb-2 text-sm font-semibold text-[color:var(--pt-text-muted)]">
                      Ответ неверный. Начислите/снимите очки другим командам, если нужно:
                    </p>
                    <div className="space-y-2">
                      {state.players
                        .filter((p) => p.id !== currentPlayer?.id)
                        .map((p) => (
                          <ScoreAdjustRow
                            key={p.id}
                            player={p}
                            onAdjust={(id, d) => adjustJeopardyScore(code, id, d)}
                          />
                        ))}
                    </div>
                    <div className="mt-4 flex justify-center">
                      <button
                        onClick={() => finalizeJeopardyTurnWrong(code)}
                        className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--pt-accent)] px-6 py-3 font-bold text-black hover:scale-[1.02]"
                      >
                        Продолжить <ArrowLeft className="h-4 w-4 rotate-180" />
                      </button>
                    </div>
                  </div>
                )}

                {j.phase === "reveal" && (
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={() => backToBoard(code)}
                      className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--pt-accent)] px-6 py-3 font-bold text-black hover:scale-[1.02]"
                    >
                      <ArrowLeft className="h-5 w-5" /> К полю
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <JLeaderboard
                  state={state}
                  highlightId={highlightId}
                  onAdjust={(id, d) => adjustJeopardyScore(code, id, d)}
                />
              </div>
            </div>
          )}

        {/* FINAL BETS */}
        {j.phase === "final-bets" && (
          <div className="mt-6 animate-fade-up rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-8">
            <h2 className="font-display text-3xl font-black">Финал · Ставки</h2>
            <p className="mt-2 text-sm text-[color:var(--pt-text-muted)]">
              Категория финала: <b>{game.final.category || "секретно"}</b>. Игроки делают ставки
              на своих устройствах.
            </p>
            <div className="mt-4 space-y-2">
              {state.players.map((p) => {
                const bet = j.finalBets[p.id];
                const ready = bet != null;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl bg-[color:var(--pt-surface-strong)] px-4 py-3"
                  >
                    <span className="flex items-center gap-2">
                      <Avatar name={p.nickname} size={28} /> <b>{p.nickname}</b>
                      <span className="text-xs text-[color:var(--pt-text-muted)]">
                        · счёт: {p.score}
                      </span>
                    </span>
                    <span className="font-mono">
                      {ready ? (
                        <span className="inline-flex items-center gap-1 font-bold text-[color:var(--pt-accent)]">
                          <Lock className="h-3.5 w-3.5" /> Готов
                        </span>
                      ) : (
                        <span className="text-[color:var(--pt-text-muted)]">Ожидаем…</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => startJeopardyFinalQuestion(code)}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[color:var(--pt-accent)] px-6 py-3 font-bold text-black"
            >
              <Play className="h-4 w-4" /> Открыть вопрос
            </button>
          </div>
        )}


        {/* FINAL QUESTION */}
        {j.phase === "final-question" && (
          <div className="mt-6 animate-fade-up">
            <p className="mb-2 text-center text-sm uppercase tracking-widest text-[color:var(--pt-text-muted)]">
              Финал · {game.final.category}
            </p>
            {game.final.image && (
              <img
                src={game.final.image}
                alt=""
                className="mx-auto mb-4 max-h-60 rounded-xl object-contain"
              />
            )}
            <div
              className={`rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-8 text-center font-semibold ${fitQuestionSize(game.final.q)}`}
            >
              <LaTeX>{game.final.q}</LaTeX>
            </div>
            <p className="mt-4 text-center text-2xl font-bold text-[color:var(--pt-accent)]">
              Ответ: {game.final.a}
            </p>
            {(() => {
              const answeredCount = state.players.filter(
                (p) => (j.finalGiven[p.id] ?? "").trim() !== "",
              ).length;
              const allAnswered =
                state.players.length > 0 && answeredCount >= state.players.length;
              return (
                <>
                  <div className="mt-6 space-y-2">
                    <p className="text-sm text-[color:var(--pt-text-muted)]">
                      {allAnswered
                        ? "Все ответили. Оцените ответы."
                        : `Ждём ответы (${answeredCount}/${state.players.length})…`}
                    </p>
                    {state.players.map((p) => {
                      const given = j.finalGiven[p.id] ?? "";
                      const ok = j.finalAnswers[p.id] ?? false;
                      const bet = j.finalBets[p.id] ?? 0;
                      return (
                        <div
                          key={p.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[color:var(--pt-surface-strong)] px-4 py-3"
                        >
                          <span className="flex items-center gap-2">
                            <Avatar name={p.nickname} size={26} />
                            <b>{p.nickname}</b>
                            <span className="text-xs text-[color:var(--pt-text-muted)]">
                              · ставка{" "}
                              <span
                                className={
                                  allAnswered
                                    ? ""
                                    : "select-none blur-sm text-[color:var(--pt-text-muted)]"
                                }
                              >
                                {allAnswered ? bet : "•••"}
                              </span>
                            </span>
                          </span>
                          <span
                            className={`max-w-xs truncate text-sm italic text-[color:var(--pt-text-muted)] transition ${
                              allAnswered ? "" : "select-none blur-sm"
                            }`}
                          >
                            {allAnswered ? given || "—" : "Ответ скрыт"}
                          </span>
                          <label
                            className={`inline-flex items-center gap-2 text-sm font-semibold ${
                              allAnswered ? "" : "pointer-events-none opacity-40"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="h-5 w-5 accent-[color:var(--pt-accent)]"
                              checked={ok}
                              disabled={!allAnswered}
                              onChange={(e) => markJeopardyFinal(code, p.id, e.target.checked)}
                            />
                            Верно
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={() => revealJeopardyFinal(code)}
                      disabled={!allAnswered}
                      className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--pt-accent)] px-6 py-3 font-bold text-black disabled:opacity-40"
                    >
                      Применить итоги
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        )}


        {/* FINAL REVEAL — auto-anim */}
        {j.phase === "final-reveal" && (
          <FinalRevealAnim state={state} code={code} game={game} />
        )}

        {/* PODIUM */}
        {j.phase === "podium" && <JPodium players={state.players} gameId={state.gameId} />}
      </div>
    </PlayerShell>
  );
}

function JBoard({
  round,
  usedKeys,
  roundIdx,
  onSelect,
}: {
  round: JeopardyData["rounds"][number];
  usedKeys: string[];
  roundIdx: number;
  onSelect: (catIdx: number, qIdx: number) => void;
}) {
  const maxRows = round.reduce((m, c) => Math.max(m, c.questions.length), 0);
  return (
    <div
      className="grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${round.length}, minmax(0, 1fr))`,
        gridTemplateRows: `auto repeat(${maxRows}, minmax(0, 1fr))`,
      }}
    >
      {round.map((cat, ci) => (
        <div
          key={`h-${ci}`}
          className="rounded-xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] p-3 text-center text-sm font-bold uppercase"
          style={{ gridColumn: ci + 1, gridRow: 1 }}
        >
          {cat.category || `Категория ${ci + 1}`}
        </div>
      ))}
      {round.flatMap((cat, ci) =>
        Array.from({ length: maxRows }).map((_, ri) => {
          const q = cat.questions[ri];
          if (!q)
            return (
              <div
                key={`e-${ci}-${ri}`}
                style={{ gridColumn: ci + 1, gridRow: ri + 2 }}
                className="rounded-xl border border-dashed border-[color:var(--pt-border)]/40 opacity-30"
              />
            );
          const key = `${roundIdx}-${ci}-${ri}`;
          const used = usedKeys.includes(key);
          return (
            <button
              type="button"
              key={`q-${ci}-${ri}`}
              onClick={() => !used && onSelect(ci, ri)}
              disabled={used}
              style={{ gridColumn: ci + 1, gridRow: ri + 2 }}
              className={`grid place-items-center rounded-xl border border-[color:var(--pt-border)] p-6 font-display text-2xl font-black transition-all ${
                used
                  ? "cursor-not-allowed opacity-20"
                  : "bg-[color:var(--pt-surface)] text-[color:var(--pt-accent)] hover:scale-105 hover:bg-[color:var(--pt-accent)]/10"
              }`}
            >
              {q.points}
            </button>
          );
        }),
      )}
    </div>
  );
}

function JLeaderboard({
  state,
  highlightId,
  onAdjust,
}: {
  state: RoomState;
  highlightId: string | null;
  onAdjust?: (id: string, d: number) => void;
}) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const lastId = state.jeopardy?.lastDelta?.playerId;
  const lastDelta = state.jeopardy?.lastDelta?.delta ?? 0;
  return (
    <div className="rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-5 backdrop-blur-md">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[color:var(--pt-text-muted)]">
        <Trophy className="h-4 w-4" /> Рейтинг
      </div>
      <div className="space-y-2">
        {sorted.map((p, i) => (
          <div
            key={p.id}
            className={`relative rounded-xl px-3 py-2 transition-all ${
              p.id === highlightId
                ? "bg-[color:var(--pt-accent)]/25 ring-2 ring-[color:var(--pt-accent)]"
                : i === 0
                  ? "bg-[color:var(--pt-accent)]/15"
                  : "bg-[color:var(--pt-surface-strong)]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 truncate">
                <span className="w-5 font-mono text-xs text-[color:var(--pt-text-muted)]">
                  {i + 1}
                </span>
                <Avatar name={p.nickname} size={22} />
                <span className="truncate font-semibold">{p.nickname}</span>
              </div>
              <div className="flex items-center gap-2">
                <EditableScore player={p} onAdjust={onAdjust} />
                {onAdjust && <InlineAdjustButtons player={p} onAdjust={onAdjust} />}
              </div>
            </div>
            {p.id === lastId && lastDelta !== 0 && (
              <span
                className={`iq-points-fly absolute -top-2 right-2 rounded-full px-2 py-0.5 text-xs font-bold ${
                  lastDelta > 0 ? "bg-success/20 text-success" : "bg-danger/20 text-danger"
                }`}
              >
                {lastDelta > 0 ? "+" : ""}
                {lastDelta}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EditableScore({
  player,
  onAdjust,
}: {
  player: RoomPlayer;
  onAdjust?: (id: string, d: number) => void;
}) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(String(player.score));
  useEffect(() => {
    if (!edit) setVal(String(player.score));
  }, [player.score, edit]);
  const apply = () => {
    const n = Math.floor(Number(val));
    if (!Number.isNaN(n) && n !== player.score && onAdjust) {
      onAdjust(player.id, n - player.score);
    }
    setEdit(false);
  };
  if (!onAdjust) return <span className="font-mono text-sm font-bold">{player.score.toLocaleString("ru-RU")}</span>;
  return edit ? (
    <input
      type="number"
      value={val}
      autoFocus
      onChange={(e) => setVal(e.target.value)}
      onBlur={apply}
      onKeyDown={(e) => {
        if (e.key === "Enter") apply();
        if (e.key === "Escape") setEdit(false);
      }}
      className="w-20 rounded bg-[color:var(--pt-surface)] px-2 py-0.5 text-right font-mono text-sm font-bold"
    />
  ) : (
    <button
      onClick={() => setEdit(true)}
      className="rounded px-1 font-mono text-sm font-bold hover:bg-[color:var(--pt-surface)]"
      title="Изменить очки"
    >
      {player.score.toLocaleString("ru-RU")}
    </button>
  );
}

function InlineAdjustButtons({
  player,
  onAdjust,
}: {
  player: RoomPlayer;
  onAdjust: (id: string, d: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onAdjust(player.id, -100)}
        className="grid h-6 w-6 place-items-center rounded bg-[color:var(--pt-surface)] hover:bg-danger/20 hover:text-danger"
        aria-label="−100"
        title="−100"
      >
        <Minus className="h-3 w-3" />
      </button>
      <button
        onClick={() => onAdjust(player.id, 100)}
        className="grid h-6 w-6 place-items-center rounded bg-[color:var(--pt-surface)] hover:bg-success/20 hover:text-success"
        aria-label="+100"
        title="+100"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

function ScoreAdjustRow({
  player,
  onAdjust,
}: {
  player: RoomPlayer;
  onAdjust: (id: string, d: number) => void;
}) {
  const [open, setOpen] = useState<null | "plus" | "minus">(null);
  const [val, setVal] = useState("100");
  const apply = () => {
    const n = Math.max(0, Math.floor(Number(val) || 0));
    if (n === 0) return setOpen(null);
    onAdjust(player.id, open === "minus" ? -n : n);
    setOpen(null);
  };
  return (
    <div className="rounded-xl bg-[color:var(--pt-surface-strong)] px-2 py-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <Avatar name={player.nickname} size={18} />
          <span className="truncate font-semibold">{player.nickname}</span>
          <span className="ml-1 font-mono text-[color:var(--pt-text-muted)]">
            {player.score}
          </span>
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setOpen(open === "minus" ? null : "minus");
              setVal("100");
            }}
            className="grid h-6 w-6 place-items-center rounded bg-[color:var(--pt-surface)] hover:bg-danger/20 hover:text-danger"
            aria-label="Отнять"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            onClick={() => {
              setOpen(open === "plus" ? null : "plus");
              setVal("100");
            }}
            className="grid h-6 w-6 place-items-center rounded bg-[color:var(--pt-surface)] hover:bg-success/20 hover:text-success"
            aria-label="Добавить"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            type="number"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            className="w-full rounded bg-[color:var(--pt-surface)] px-2 py-1 text-right font-mono text-xs"
            autoFocus
          />
          <button
            onClick={apply}
            className={`rounded px-2 py-1 text-xs font-bold text-white ${open === "plus" ? "bg-success" : "bg-danger"}`}
          >
            {open === "plus" ? "+" : "−"}
            {val || 0}
          </button>
        </div>
      )}
    </div>
  );
}

function JPodium({ players, gameId }: { players: RoomPlayer[]; gameId: string }) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const podium = sorted.slice(0, 3);
  const rest = sorted.slice(3);
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
          const trophyColors = ["text-slate-300", "text-[color:var(--pt-accent)]", "text-amber-700"];
          return (
            <div key={p.id} className="flex flex-col items-center">
              <Trophy
                className={`h-10 w-10 md:h-12 md:w-12 ${trophyColors[col]} ${mapIdx === 0 ? "iq-bounce" : "iq-wiggle"}`}
                style={{ animationDelay: `${col * 0.15}s` }}
              />
              <Avatar name={p.nickname} size={48} className="mt-2" />
              <span className="mt-2 font-semibold">{p.nickname}</span>
              <span className="font-mono text-lg font-bold">
                {p.score.toLocaleString("ru-RU")}
              </span>
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
                <span className="font-mono text-xs text-[color:var(--pt-text-muted)]">
                  {i + 4}
                </span>
                <Avatar name={p.nickname} size={24} />
                <span className="font-semibold">{p.nickname}</span>
              </span>
              <span className="font-mono font-bold">{p.score.toLocaleString("ru-RU")}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <Link
          to="/jeopardy/$gameId/results"
          params={{ gameId }}
          className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--pt-accent)] px-5 py-3 font-bold text-black"
        >
          <Trophy className="h-4 w-4" /> Результаты
        </Link>
        <Link
          to="/library"
          className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface-strong)] px-5 py-3 font-bold"
        >
          <FileText className="h-4 w-4" /> Библиотека
        </Link>

      </div>
    </div>
  );
}

function FinalRevealAnim({
  state,
  code,
  game,
}: {
  state: RoomState;
  code: string;
  game: JeopardyData;
}) {
  const j = state.jeopardy!;
  // auto-advance every 5s while phase is final-reveal
  useEffect(() => {
    const t = window.setInterval(() => {
      if (j.finalRevealStep === "done" && j.finalRevealIdx >= 0) return;
      void advanceJeopardyFinalReveal(code);
    }, 5000);
    // kick off immediately if not started
    if (j.finalRevealIdx < 0) {
      void advanceJeopardyFinalReveal(code);
    }
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, j.finalRevealStep, j.finalRevealIdx]);

  const done =
    j.finalRevealStep === "done" && j.finalRevealIdx >= 0;
  const currentId = j.finalRevealOrder[Math.max(0, j.finalRevealIdx)];
  const cur = state.players.find((p) => p.id === currentId);
  const curBet = cur ? (j.finalBets[cur.id] ?? 0) : 0;
  const curOk = cur ? (j.finalAnswers[cur.id] ?? false) : false;
  const curGiven = cur ? (j.finalGiven[cur.id] ?? "") : "";

  return (
    <div className="mt-6 animate-fade-up rounded-3xl border border-[color:var(--pt-border)] bg-[color:var(--pt-surface)] p-8 text-center">
      <Trophy className="mx-auto mb-2 h-10 w-10 text-[color:var(--pt-accent)]" />
      <h2 className="font-display text-3xl font-black">Финал · Раскрытие</h2>
      <p className="mt-1 text-sm text-[color:var(--pt-text-muted)]">
        Категория: <b>{game.final.category}</b> · Ответ:{" "}
        <b className="text-[color:var(--pt-accent)]">{game.final.a}</b>
      </p>

      {!done && cur && (
        <div className="mt-6 rounded-2xl bg-[color:var(--pt-surface-strong)] p-6">
          <div className="flex items-center justify-center gap-3 font-display text-2xl font-black">
            <Avatar name={cur.nickname} size={40} /> {cur.nickname}
          </div>
          <div className="mt-4 min-h-[80px] text-lg">
            {j.finalRevealStep === "bet" && (
              <p className="animate-fade-in">Ставит…</p>
            )}
            {j.finalRevealStep !== "bet" && (
              <p className="animate-fade-in">
                Ставка: <b className="text-[color:var(--pt-accent)]">{curBet}</b>
              </p>
            )}
            {j.finalRevealStep === "answer" && (
              <p className="mt-2 animate-fade-in italic">
                Ответ: «{curGiven || "—"}»
              </p>
            )}
            {j.finalRevealStep === "answer" || j.finalRevealStep === "score" ? (
              <p className="mt-2 animate-fade-in">
                {curOk ? (
                  <span className="inline-flex items-center gap-1 font-bold text-success">
                    <Check className="h-5 w-5" /> Верно
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-bold text-danger">
                    <X className="h-5 w-5" /> Неверно
                  </span>
                )}
              </p>
            ) : null}
            {j.finalRevealStep === "score" && (
              <p className="mt-2 animate-fade-in font-mono text-2xl font-black">
                {curOk ? "+" : "−"}
                {curBet}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-2">
        {[...state.players]
          .sort((a, b) => b.score - a.score)
          .map((p, i) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-xl bg-[color:var(--pt-surface-strong)] px-4 py-3 transition-all"
            >
              <span className="flex items-center gap-2">
                <span className="font-mono">{i + 1}</span>
                <Avatar name={p.nickname} size={26} />
                <b>{p.nickname}</b>
              </span>
              <span className="font-mono font-bold">{p.score.toLocaleString("ru-RU")}</span>
            </div>
          ))}
      </div>

      {done && (
        <button
          onClick={() => finishJeopardyGame(code)}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[color:var(--pt-accent)] px-6 py-3 font-bold text-black"
        >
          <Trophy className="h-4 w-4" /> Показать подиум
        </button>
      )}
    </div>
  );
}

