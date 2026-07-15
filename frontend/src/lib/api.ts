// src/lib/api.ts — единая точка входа для всех данных (TZ v2.0 §10, §11).
// Сейчас работает поверх localStorage + BroadcastChannel (кросс-вкладочная
// синхронизация комнат). Легко заменяется на FastAPI + WebSocket без правок
// в UI: сохраняется контракт функций и форма возвращаемых Promise.

import {
  saveGame as _saveGame,
  loadGame as _loadGame,
  listGames as _listGames,
  deleteGame as _deleteGame,
  newId,
} from "./storage";
import {
  saveQuizResult,
  loadQuizResults,
  saveOnlineQuizResult,
  loadOnlineQuizResults,
  type OnlineQuizResult,
  type OnlineQuizPlayerAnswer,
} from "./results";
import { saveJeopardyResult, loadJeopardyResults, type JeopardyResult } from "./jeopardy-results";
import type {
  GameKind,
  GameVisibility,
  JeopardyData,
  MillionaireData,
  QuizData,
  QuizQuestion,
  StoredGame,
} from "./types";
import {
  type User,
  createUser,
  findUserByEmail,
  findUserById,
  getCurrentUser,
  getSessionUserId,
  setSessionUserId,
  updateUserRecord,
  verifyUserCredentials,
} from "./auth";
import { formatQuizAnswer, formatGivenAnswer } from "./format-answer";

// Re-export types consumed by other modules so the facade stays the single entry point.
export type { User } from "./auth";
export type { GameKind, GameVisibility, StoredGame } from "./types";

// ---------- Fake latency helper ----------
const fake = <T,>(value: T, ms = 120): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), ms));

// ---------- Auth (stub) ----------
// TODO(server): POST /api/auth/register
export async function register(input: { email: string; password: string; name: string }) {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password || !input.name.trim()) {
    return fake({ ok: false as const, error: "Заполните все поля" });
  }
  if (findUserByEmail(email)) {
    return fake({ ok: false as const, error: "Пользователь с таким email уже существует" });
  }
  const user = createUser({ email, name: input.name, password: input.password });
  setSessionUserId(user.id);
  await bindOrphanGames();

  return fake({ ok: true as const, user });
}

// TODO(server): POST /api/auth/login
export async function login(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) {
    return fake({ ok: false as const, error: "Заполните все поля" });
  }
  const user = verifyUserCredentials(email, input.password);
  if (!user) {
    return fake({ ok: false as const, error: "Неверный email или пароль" });
  }
  setSessionUserId(user.id);
  await bindOrphanGames();
  return fake({ ok: true as const, user });
}

// TODO(server): POST /api/auth/logout
export async function logout() {
  setSessionUserId(null);
  return fake({ ok: true });
}

// TODO(server): POST /api/auth/forgot-password
export async function forgotPassword(_email: string) {
  return fake({ ok: true as const, message: "Инструкция отправлена на email" }, 300);
}

// TODO(server): POST /api/auth/reset-password
export async function resetPassword(_token: string, _newPassword: string) {
  return fake({ ok: true as const, message: "Пароль изменён" }, 300);
}

// TODO(server): GET /api/users/me
export async function getMe(): Promise<User | null> {
  return fake(getCurrentUser());
}

// TODO(server): PATCH /api/users/me
export async function updateProfile(patch: { name?: string; avatar?: string; bio?: string; subject?: string }): Promise<User | null> {
  const id = getSessionUserId();
  if (!id) return fake(null);
  return fake(updateUserRecord(id, patch));
}


// ---------- Games ----------
export type AnyGameData = QuizData | JeopardyData | MillionaireData;

export interface SaveGameInput<T = AnyGameData> {
  id?: string;
  kind: GameKind;
  data: T;
  title?: string;
  tags?: string[];
}

export async function saveGame<T = AnyGameData>(input: SaveGameInput<T>) {
  const id = input.id ?? newId();
  const existing = _loadGame<T>(input.kind, id);
  const me = getCurrentUser();
  const meta: Partial<StoredGame> = {};
  if (me && (!existing || !existing.ownerId || existing.ownerId === me.id)) {
    meta.ownerId = me.id;
    meta.ownerName = me.name;
    if (!existing) meta.visibility = "private";
  } else if (!existing && !me) {
    meta.visibility = "link";
  }
  if (input.tags) meta.tags = input.tags;
  _saveGame<T>(input.kind, id, input.data, meta);
  return fake({ id, play_url: `/play/${input.kind}/${id}` });
}


// TODO(server): POST /api/games/:id/fork
export async function forkGame(gameId: string): Promise<{ id: string } | null> {
  const me = getCurrentUser();
  if (!me) return fake(null);
  const all = _listGames();
  const src = all.find((g) => g.id === gameId);
  if (!src) return fake(null);
  const originalOwner = src.ownerName ?? (src.ownerId ? findUserById(src.ownerId)?.name : undefined);
  const newIdVal = newId();
  _saveGame(src.kind, newIdVal, src.data, {
    ownerId: me.id,
    ownerName: me.name,
    visibility: "private",
    forkedFrom: src.id,
    forkedOwnerName: originalOwner ?? "неизвестный автор",
  });
  return fake({ id: newIdVal });
}

// TODO(server): PATCH /api/games/:id/visibility
export async function setGameVisibility(gameId: string, visibility: GameVisibility) {
  const all = _listGames();
  const g = all.find((x) => x.id === gameId);
  if (!g) return fake({ ok: false as const });
  _saveGame(g.kind, g.id, g.data, {
    ownerId: g.ownerId,
    ownerName: g.ownerName,
    visibility,
    forkedFrom: g.forkedFrom,
    forkedOwnerName: g.forkedOwnerName,
    tags: g.tags,
    ratings: g.ratings,
    playCount: g.playCount,
    showAnswers: g.showAnswers,
  });
  return fake({ ok: true as const });
}

// TODO(server): PATCH /api/games/:id/show-answers
export async function setGameShowAnswers(gameId: string, showAnswers: boolean) {
  const all = _listGames();
  const g = all.find((x) => x.id === gameId);
  if (!g) return fake({ ok: false as const });
  _saveGame(g.kind, g.id, g.data, {
    ownerId: g.ownerId,
    ownerName: g.ownerName,
    visibility: g.visibility,
    forkedFrom: g.forkedFrom,
    forkedOwnerName: g.forkedOwnerName,
    tags: g.tags,
    ratings: g.ratings,
    playCount: g.playCount,
    showAnswers,
  });
  return fake({ ok: true as const });
}

// Bind games with no ownerId to current user (first-login flow).
export async function bindOrphanGames(): Promise<number> {
  const me = getCurrentUser();
  if (!me) return fake(0);
  const all = _listGames();
  let bound = 0;
  for (const g of all) {
    if (!g.ownerId) {
      _saveGame(g.kind, g.id, g.data, {
        ownerId: me.id,
        ownerName: me.name,
        visibility: g.visibility ?? "private",
        forkedFrom: g.forkedFrom,
        forkedOwnerName: g.forkedOwnerName,
      });
      bound++;
    }
  }
  return fake(bound);
}

export function countOrphanGames(): number {
  return _listGames().filter((g) => !g.ownerId).length;
}

export async function loadGame<T = AnyGameData>(kind: GameKind, id: string) {
  const rec = _loadGame<T>(kind, id);
  return fake(rec);
}

export async function listGames(kind?: GameKind): Promise<StoredGame[]> {
  return fake(_listGames(kind));
}

export async function findGame(id: string): Promise<StoredGame | null> {
  const all = _listGames();
  const g = all.find((x) => x.id === id) ?? null;
  if (!g) return fake(null);
  const d = g.data as { config?: unknown; rounds?: unknown; questions?: unknown } | undefined;
  if (!d || !d.config) return fake(null);
  if (g.kind === "jeopardy" && !Array.isArray(d.rounds)) {
    (d as { rounds: unknown[] }).rounds = [];
  }
  if ((g.kind === "quiz" || g.kind === "millionaire") && !Array.isArray(d.questions)) {
    (d as { questions: unknown[] }).questions = [];
  }
  return fake(g);
}

export async function deleteGame(kind: GameKind, id: string) {
  _deleteGame(kind, id);
  return fake({ ok: true });
}

// ---------- Results (per-quiz dashboard) ----------
export async function getResults(gameId: string) {
  return fake(loadQuizResults(gameId));
}

export async function submitResult(payload: Parameters<typeof saveQuizResult>[0]) {
  saveQuizResult(payload);
  return fake({ ok: true });
}

// ---------- Jeopardy results ----------
// TODO(server): GET /api/jeopardy/:gameId/results
export async function getJeopardyResults(gameId: string): Promise<JeopardyResult[]> {
  return fake(loadJeopardyResults(gameId));
}

// TODO(server): GET /api/jeopardy/:gameId/results/:resultId
export async function getJeopardyGameDetail(gameId: string, resultId: string): Promise<JeopardyResult | null> {
  const all = loadJeopardyResults(gameId);
  return fake(all.find((r) => r.id === resultId) ?? null);
}

// TODO(server): POST /api/jeopardy/:gameId/results
export async function submitJeopardyResult(payload: Parameters<typeof saveJeopardyResult>[0]) {
  const rec = saveJeopardyResult(payload);
  return fake({ ok: true, id: rec.id });
}

// ---------- Online rooms (Sync Mode, TZ §3) ----------
// Хранение: localStorage + BroadcastChannel("islandquiz.room.<code>").
// Заменяется на WebSocket без изменения UI.

export interface RoomAnswerRecord {
  questionIdx: number;
  correct: boolean;
  delta: number;
  timeMs: number;
  given: string;
}

export interface RoomPlayer {
  id: string;
  nickname: string;
  avatar: string;
  score: number;
  streak: number;
  connected: boolean;
  lastAnswer?: RoomAnswerRecord;
  answerHistory?: RoomAnswerRecord[];
  jCorrect?: number;
  jWrong?: number;
}

export type RoomStatus = "waiting" | "active" | "reveal" | "leaderboard" | "finished";

export type JeopardyPhase =
  | "lobby"
  | "board"
  | "question"
  | "answering"
  | "reveal"
  | "final-bets"
  | "final-question"
  | "final-reveal"
  | "podium";

export interface JeopardyRoomState {
  phase: JeopardyPhase;
  mode: "buzz" | "turn";
  round: number;
  currentPlayerIdx: number;
  usedKeys: string[];
  selectedCat: number | null;
  selectedQ: number | null;
  buzzedPlayerId: string | null;
  buzzedPlayerIds: string[]; // buzz mode: players who already got a wrong attempt
  buzzedAnswer: string | null; // text the buzzed player submitted
  buzzStartAt: number | null; // ms — start of personal 30s answer timer
  buzzTimeoutMs: number; // ms — personal answer window
  questionTotalMs: number; // buzz mode: full timer for the current question
  questionElapsedMs: number; // buzz mode: accumulated elapsed time (frozen while answering)
  showAnswer: boolean;
  awaitingBonus: boolean; // turn-wrong: teacher can distribute bonus before advancing
  finalBets: Record<string, number>;
  finalAnswers: Record<string, boolean>;
  finalGiven: Record<string, string>;
  finalRevealOrder: string[];
  finalRevealIdx: number; // -1 not started
  finalRevealStep: "bet" | "answer" | "score" | "done";
  finalRevealAt: number | null;
  lastDelta?: { playerId: string; delta: number } | null;
}

export interface RoomState {
  code: string;
  gameKind: GameKind;
  gameId: string;
  hostId: string;
  status: RoomStatus;
  questionIdx: number;
  questionStartAt: number | null;
  players: RoomPlayer[];
  fastestPlayerId?: string;
  createdAt: number;
  jeopardy?: JeopardyRoomState;
}

const ROOM_PREFIX = "islandquiz.room.v1.";
const roomKey = (code: string) => ROOM_PREFIX + code;

function readRoom(code: string): RoomState | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(roomKey(code));
  return raw ? (JSON.parse(raw) as RoomState) : null;
}

function writeRoom(state: RoomState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(roomKey(state.code), JSON.stringify(state));
  try {
    new BroadcastChannel("islandquiz.rooms").postMessage({ code: state.code });
  } catch {
    /* ignore */
  }
}

export function subscribeRoom(code: string, handler: (s: RoomState) => void) {
  if (typeof window === "undefined") return () => {};
  const push = () => {
    const s = readRoom(code);
    if (s) handler(s);
  };
  push();
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel("islandquiz.rooms");
    bc.onmessage = (e) => {
      if (e.data?.code === code) push();
    };
  } catch {
    /* ignore */
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === roomKey(code)) push();
  };
  window.addEventListener("storage", onStorage);
  const interval = window.setInterval(push, 1000);
  return () => {
    bc?.close();
    window.removeEventListener("storage", onStorage);
    window.clearInterval(interval);
  };
}

export async function createRoom(gameKind: GameKind, gameId: string) {
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const state: RoomState = {
    code,
    gameKind,
    gameId,
    hostId: newId(),
    status: "waiting",
    questionIdx: 0,
    questionStartAt: null,
    players: [],
    createdAt: Date.now(),
    ...(gameKind === "jeopardy"
      ? {
          jeopardy: {
            phase: "lobby" as const,
            mode: "buzz" as const,
            round: 0,
            currentPlayerIdx: 0,
            usedKeys: [],
            selectedCat: null,
            selectedQ: null,
            buzzedPlayerId: null,
            buzzedPlayerIds: [],
            buzzedAnswer: null,
            buzzStartAt: null,
            buzzTimeoutMs: 30000,
            questionTotalMs: 30000,
            questionElapsedMs: 0,
            showAnswer: false,
            awaitingBonus: false,
            finalBets: {},
            finalAnswers: {},
            finalGiven: {},
            finalRevealOrder: [],
            finalRevealIdx: -1,
            finalRevealStep: "done" as const,
            finalRevealAt: null,
            lastDelta: null,
          },
        }
      : {}),
  };
  writeRoom(state);
  return fake({ code, room_url: `/room/${code}` });
}

export async function joinRoom(code: string, nickname: string, avatar: string) {
  const state = readRoom(code);
  if (!state) return fake({ success: false as const, error: "Комната не найдена" });
  // Reconnect: match by nickname (TZ §3 reconnection)
  let player = state.players.find((p) => p.nickname === nickname);
  if (player) {
    player.connected = true;
    player.avatar = avatar || player.avatar;
  } else {
    player = {
      id: newId(),
      nickname,
      avatar,
      score: 0,
      streak: 0,
      connected: true,
    };
    state.players.push(player);
  }
  writeRoom(state);
  return fake({ success: true as const, player_id: player.id });
}

export async function getRoomState(code: string) {
  return fake(readRoom(code));
}

// Teacher controls
export async function startRoom(code: string) {
  const s = readRoom(code);
  if (!s) return fake(null);
  s.status = "active";
  s.questionIdx = 0;
  s.questionStartAt = Date.now();
  s.players.forEach((p) => {
    p.lastAnswer = undefined;
    p.answerHistory = [];
  });
  writeRoom(s);
  return fake(s);
}
export async function revealAnswer(code: string) {
  const s = readRoom(code);
  if (!s) return fake(null);
  s.status = "reveal";
  const answered = s.players.filter((p) => p.lastAnswer?.questionIdx === s.questionIdx && p.lastAnswer.correct);
  const fastest = answered.sort((a, b) => a.lastAnswer!.timeMs - b.lastAnswer!.timeMs)[0];
  s.fastestPlayerId = fastest?.id;
  writeRoom(s);
  return fake(s);
}
export async function showLeaderboard(code: string) {
  const s = readRoom(code);
  if (!s) return fake(null);
  s.status = "leaderboard";
  writeRoom(s);
  return fake(s);
}
export async function nextQuestion(code: string) {
  const s = readRoom(code);
  if (!s) return fake(null);
  s.questionIdx += 1;
  s.status = "active";
  s.questionStartAt = Date.now();
  s.fastestPlayerId = undefined;
  writeRoom(s);
  return fake(s);
}
export async function finishRoom(code: string) {
  const s = readRoom(code);
  if (!s) return fake(null);
  s.status = "finished";
  writeRoom(s);
  // Save online results for dashboard (quiz only)
  if (s.gameKind === "quiz") {
    try {
      const rec = _loadGame<QuizData>("quiz", s.gameId);
      if (rec) {
        const questions = rec.data.questions;
        const maxScore = questions.reduce((sum, q) => sum + (q.points || 0), 0);
        const durationSec = Math.max(0, Math.round((Date.now() - s.createdAt) / 1000));
        const players = s.players.map((p) => {
          const hist = p.answerHistory ?? [];
          const answers: OnlineQuizPlayerAnswer[] = hist.map((a) => {
            const q: QuizQuestion | undefined = questions[a.questionIdx];
            const correctAnswer = q ? formatQuizAnswer(q) : "";
            return {
              questionIdx: a.questionIdx,
              question: q?.q ?? `Вопрос ${a.questionIdx + 1}`,
              given: q ? formatGivenAnswer(q, a.given) : a.given,
              correctAnswer,
              correct: a.correct,
              earned: a.delta,
              points: q?.points ?? 0,
              timeMs: a.timeMs,
            };
          });
          const correctCount = answers.filter((a) => a.correct).length;
          return {
            id: p.id,
            nickname: p.nickname,
            avatar: p.avatar,
            score: p.score,
            maxScore,
            correctCount,
            totalQuestions: questions.length,
            answers,
          };
        });
        saveOnlineQuizResult({
          roomCode: s.code,
          gameId: s.gameId,
          durationSec,
          players,
        });
      }
    } catch (err) {
      console.error("Failed to save online room result", err);
    }
  }
  return fake(s);
}
export async function kickPlayer(code: string, playerId: string) {
  const s = readRoom(code);
  if (!s) return fake(null);
  s.players = s.players.filter((p) => p.id !== playerId);
  writeRoom(s);
  return fake(s);
}
export async function adjustPlayerScore(code: string, playerId: string, delta: number) {
  const s = readRoom(code);
  if (!s) return fake(null);
  const p = s.players.find((pl) => pl.id === playerId);
  if (p) {
    p.score = Math.max(0, p.score + delta);
  }
  writeRoom(s);
  return fake(s);
}
export async function restartRoom(code: string) {
  const s = readRoom(code);
  if (!s) return fake(null);
  s.status = "waiting";
  s.questionIdx = 0;
  s.questionStartAt = null;
  s.fastestPlayerId = undefined;
  s.players.forEach((p) => {
    p.score = 0;
    p.streak = 0;
    p.lastAnswer = undefined;
    p.answerHistory = [];
  });
  writeRoom(s);
  return fake(s);
}

// Kahoot-style scoring (TZ §0)
export function computeKahootScore(opts: { correct: boolean; timeMs: number; totalMs: number; streakBefore: number }) {
  if (!opts.correct) return { delta: 0, streakAfter: 0 };
  const ratio = Math.max(0, 1 - opts.timeMs / Math.max(1, opts.totalMs));
  const base = 1000;
  const speed = Math.round(500 * ratio);
  const streakAfter = opts.streakBefore + 1;
  const streakBonus = streakAfter <= 1 ? 0 : Math.min(400, (streakAfter - 1) * 100);
  return { delta: base + speed + streakBonus, streakAfter };
}

export async function submitAnswer(
  code: string,
  playerId: string,
  payload: { correct: boolean; timeMs: number; totalMs: number; given?: string },
) {
  const s = readRoom(code);
  if (!s) return fake({ correct: false, score: 0 });
  const p = s.players.find((pl) => pl.id === playerId);
  if (!p) return fake({ correct: false, score: 0 });
  if (p.lastAnswer?.questionIdx === s.questionIdx) {
    return fake({ correct: p.lastAnswer.correct, score: p.score });
  }
  const { delta, streakAfter } = computeKahootScore({
    correct: payload.correct,
    timeMs: payload.timeMs,
    totalMs: payload.totalMs,
    streakBefore: p.streak,
  });
  p.score += delta;
  p.streak = streakAfter;
  const rec: RoomAnswerRecord = {
    questionIdx: s.questionIdx,
    correct: payload.correct,
    delta,
    timeMs: payload.timeMs,
    given: payload.given ?? "",
  };
  p.lastAnswer = rec;
  if (!p.answerHistory) p.answerHistory = [];
  // Replace any earlier record for this question (in case of edge cases)
  p.answerHistory = p.answerHistory.filter((a) => a.questionIdx !== s.questionIdx);
  p.answerHistory.push(rec);
  writeRoom(s);
  return fake({ correct: payload.correct, score: p.score, delta });
}

// TODO(server): GET /api/quiz/:gameId/online-results
export async function getOnlineResults(gameId: string): Promise<OnlineQuizResult[]> {
  return fake(loadOnlineQuizResults(gameId));
}

export async function listRooms() {
  if (typeof window === "undefined") return fake([] as RoomState[]);
  const out: RoomState[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(ROOM_PREFIX)) {
      try {
        out.push(JSON.parse(localStorage.getItem(k)!));
      } catch {
        /* skip */
      }
    }
  }
  return fake(out.sort((a, b) => b.createdAt - a.createdAt));
}

// =========================================================================
//                        ONLINE JEOPARDY (rooms)
// =========================================================================

function mutJeopardy(code: string, fn: (j: JeopardyRoomState, s: RoomState) => void) {
  const s = readRoom(code);
  if (!s || !s.jeopardy) return null;
  fn(s.jeopardy, s);
  writeRoom(s);
  return s;
}

export async function setJeopardyMode(code: string, mode: "buzz" | "turn") {
  return fake(
    mutJeopardy(code, (j) => {
      j.mode = mode;
    }),
  );
}

export async function startJeopardyGame(code: string) {
  return fake(
    mutJeopardy(code, (j, s) => {
      j.phase = "board";
      j.round = 0;
      j.usedKeys = [];
      j.currentPlayerIdx = 0;
      j.selectedCat = null;
      j.selectedQ = null;
      j.buzzedPlayerId = null;
      j.buzzedPlayerIds = [];
      j.showAnswer = false;
      j.lastDelta = null;
      s.status = "active";
      s.players.forEach((p) => {
        p.score = 0;
        p.jCorrect = 0;
        p.jWrong = 0;
      });
    }),
  );
}

export async function selectJeopardyQuestion(code: string, playerId: string | null, catIdx: number, qIdx: number) {
  return fake(
    mutJeopardy(code, (j, s) => {
      // In turn mode, only current player (or teacher: playerId=null) can select
      if (j.mode === "turn" && playerId) {
        const cur = s.players[j.currentPlayerIdx]?.id;
        if (cur && cur !== playerId) return;
      }
      // In buzz mode only the teacher (playerId=null) picks the cell.
      if (j.mode === "buzz" && playerId) return;
      const key = `${j.round}-${catIdx}-${qIdx}`;
      if (j.usedKeys.includes(key)) return;
      // Load points to compute timer.
      const rec = _loadGame<JeopardyData>("jeopardy", s.gameId);
      const q = rec?.data.rounds[j.round]?.[catIdx]?.questions[qIdx];
      const timeBase = rec?.data.config.timeBase ?? 30;
      const timeStep = rec?.data.config.timeStep ?? 0;
      const tier = q ? Math.max(0, Math.round((q.points || 100) / 100) - 1) : 0;
      j.selectedCat = catIdx;
      j.selectedQ = qIdx;
      j.buzzedPlayerId = null;
      j.buzzedPlayerIds = [];
      j.buzzedAnswer = null;
      j.buzzStartAt = null;
      j.awaitingBonus = false;
      j.showAnswer = false;
      j.phase = "question";
      j.questionTotalMs = Math.max(5, timeBase + timeStep * tier) * 1000;
      j.questionElapsedMs = 0;
      s.questionStartAt = Date.now();
    }),
  );
}

// Buzz-mode: player submits typed answer during personal 30s window.
export async function submitJeopardyBuzzAnswer(code: string, playerId: string, given: string) {
  return fake(
    mutJeopardy(code, (j) => {
      if (j.buzzedPlayerId !== playerId) return;
      j.buzzedAnswer = given;
    }),
  );
}

// Teacher: after turn-wrong bonus distribution, advance turn + close cell.
export async function finalizeJeopardyTurnWrong(code: string) {
  return fake(
    mutJeopardy(code, (j, s) => {
      if (!j.awaitingBonus) return;
      j.awaitingBonus = false;
      j.currentPlayerIdx = (j.currentPlayerIdx + 1) % Math.max(1, s.players.length);
      j.showAnswer = true;
      j.phase = "reveal";
      if (j.selectedCat != null && j.selectedQ != null) {
        const key = `${j.round}-${j.selectedCat}-${j.selectedQ}`;
        if (!j.usedKeys.includes(key)) j.usedKeys.push(key);
      }
    }),
  );
}

export async function buzzJeopardy(code: string, playerId: string) {
  return fake(
    mutJeopardy(code, (j, s) => {
      if (j.mode !== "buzz") return;
      if (j.phase !== "question" || j.buzzedPlayerId) return;
      if (j.buzzedPlayerIds.includes(playerId)) return;
      // Freeze question timer
      if (s.questionStartAt) {
        j.questionElapsedMs += Date.now() - s.questionStartAt;
      }
      s.questionStartAt = null;
      j.buzzedPlayerId = playerId;
      j.buzzedAnswer = null;
      j.buzzStartAt = Date.now();
      j.phase = "answering";
    }),
  );
}

export async function acceptJeopardyAnswer(code: string, correct: boolean) {
  return fake(
    mutJeopardy(code, (j, s) => {
      if (j.selectedCat == null || j.selectedQ == null) return;
      const rec = _loadGame<JeopardyData>("jeopardy", s.gameId);
      const q = rec?.data.rounds[j.round]?.[j.selectedCat]?.questions[j.selectedQ];
      const points = q?.points ?? 0;
      const targetId = j.mode === "buzz" ? j.buzzedPlayerId : (s.players[j.currentPlayerIdx]?.id ?? null);
      if (targetId) {
        const p = s.players.find((x) => x.id === targetId);
        if (p) {
          const delta = correct ? points : -points;
          p.score = p.score + delta;
          if (correct) p.jCorrect = (p.jCorrect ?? 0) + 1;
          else p.jWrong = (p.jWrong ?? 0) + 1;
          j.lastDelta = { playerId: targetId, delta };
        }
      }
      // TURN mode
      if (j.mode === "turn") {
        if (correct) {
          j.currentPlayerIdx = (j.currentPlayerIdx + 1) % Math.max(1, s.players.length);
          j.showAnswer = true;
          j.phase = "reveal";
          const key = `${j.round}-${j.selectedCat}-${j.selectedQ}`;
          if (!j.usedKeys.includes(key)) j.usedKeys.push(key);
        } else {
          // Wrong → let teacher distribute bonus/penalty to others; advance later
          j.awaitingBonus = true;
        }
        return;
      }
      // BUZZ + wrong → resume timer, allow other players to buzz.
      if (j.mode === "buzz" && !correct) {
        if (targetId && !j.buzzedPlayerIds.includes(targetId)) {
          j.buzzedPlayerIds.push(targetId);
        }
        j.buzzedPlayerId = null;
        j.buzzedAnswer = null;
        j.buzzStartAt = null;
        j.phase = "question";
        s.questionStartAt = Date.now();
        if (j.buzzedPlayerIds.length >= s.players.length) {
          j.showAnswer = true;
          j.phase = "reveal";
          const key = `${j.round}-${j.selectedCat}-${j.selectedQ}`;
          if (!j.usedKeys.includes(key)) j.usedKeys.push(key);
        }
        return;
      }
      // BUZZ + correct → close
      j.showAnswer = true;
      j.phase = "reveal";
      const key = `${j.round}-${j.selectedCat}-${j.selectedQ}`;
      if (!j.usedKeys.includes(key)) j.usedKeys.push(key);
    }),
  );
}

// Manually close the current question with no points (timer expired /
// teacher decided to move on). Marks the cell as used.
export async function closeJeopardyQuestion(code: string) {
  return fake(
    mutJeopardy(code, (j) => {
      if (j.selectedCat == null || j.selectedQ == null) {
        j.phase = "board";
        return;
      }
      const key = `${j.round}-${j.selectedCat}-${j.selectedQ}`;
      if (!j.usedKeys.includes(key)) j.usedKeys.push(key);
      j.showAnswer = true;
      j.phase = "reveal";
      j.buzzedPlayerId = null;
    }),
  );
}

export async function backToBoard(code: string) {
  return fake(
    mutJeopardy(code, (j) => {
      j.selectedCat = null;
      j.selectedQ = null;
      j.buzzedPlayerId = null;
      j.buzzedPlayerIds = [];
      j.showAnswer = false;
      j.lastDelta = null;
      j.phase = "board";
    }),
  );
}

export async function skipJeopardyQuestion(code: string) {
  return fake(
    mutJeopardy(code, (j) => {
      if (j.selectedCat == null || j.selectedQ == null) {
        j.phase = "board";
        return;
      }
      const key = `${j.round}-${j.selectedCat}-${j.selectedQ}`;
      if (!j.usedKeys.includes(key)) j.usedKeys.push(key);
      j.selectedCat = null;
      j.selectedQ = null;
      j.buzzedPlayerId = null;
      j.buzzedPlayerIds = [];
      j.showAnswer = false;
      j.phase = "board";
    }),
  );
}

export async function endJeopardyRound(code: string) {
  return fake(
    mutJeopardy(code, (j, s) => {
      const rec = _loadGame<JeopardyData>("jeopardy", s.gameId);
      const total = rec?.data.rounds.length ?? 0;
      if (j.round + 1 < total) {
        j.round += 1;
        j.usedKeys = [];
        j.selectedCat = null;
        j.selectedQ = null;
        j.buzzedPlayerId = null;
        j.showAnswer = false;
        j.phase = "board";
      } else {
        // Move to final
        j.phase = "final-bets";
        j.finalBets = {};
        j.finalAnswers = {};
        j.finalGiven = {};
      }
    }),
  );
}

export async function submitJeopardyFinalBet(code: string, playerId: string, bet: number) {
  return fake(
    mutJeopardy(code, (j, s) => {
      const p = s.players.find((x) => x.id === playerId);
      const cap = Math.max(0, p?.score ?? 0);
      j.finalBets[playerId] = Math.max(0, Math.min(cap, Math.floor(bet)));
    }),
  );
}

export async function startJeopardyFinalQuestion(code: string) {
  return fake(
    mutJeopardy(code, (j, s) => {
      // Fill missing bets with 0
      s.players.forEach((p) => {
        if (j.finalBets[p.id] == null) j.finalBets[p.id] = 0;
      });
      j.phase = "final-question";
      j.showAnswer = false;
      s.questionStartAt = Date.now();
    }),
  );
}

export async function submitJeopardyFinalAnswer(code: string, playerId: string, given: string) {
  return fake(
    mutJeopardy(code, (j) => {
      j.finalGiven[playerId] = given;
    }),
  );
}

export async function markJeopardyFinal(code: string, playerId: string, correct: boolean) {
  return fake(
    mutJeopardy(code, (j) => {
      j.finalAnswers[playerId] = correct;
    }),
  );
}

export async function revealJeopardyFinal(code: string) {
  return fake(
    mutJeopardy(code, (j, s) => {
      j.showAnswer = true;
      j.phase = "final-reveal";
      // Setup animation order (ascending score → suspense: reveal weakest first)
      j.finalRevealOrder = [...s.players].sort((a, b) => a.score - b.score).map((p) => p.id);
      j.finalRevealIdx = -1;
      j.finalRevealStep = "done";
      j.finalRevealAt = null;
    }),
  );
}

// Advance the auto-anim: 4 steps per player (bet → answer → score → next).
export async function advanceJeopardyFinalReveal(code: string) {
  return fake(
    mutJeopardy(code, (j, s) => {
      if (j.phase !== "final-reveal") return;
      if (j.finalRevealIdx < 0) {
        j.finalRevealIdx = 0;
        j.finalRevealStep = "bet";
        j.finalRevealAt = Date.now();
        return;
      }
      const order: ("bet" | "answer" | "score")[] = ["bet", "answer", "score"];
      const cur = order.indexOf(j.finalRevealStep as "bet" | "answer" | "score");
      if (cur >= 0 && cur < 2) {
        j.finalRevealStep = order[cur + 1];
        j.finalRevealAt = Date.now();
        return;
      }
      // apply score for current player, move to next
      const pid = j.finalRevealOrder[j.finalRevealIdx];
      const p = s.players.find((x) => x.id === pid);
      if (p) {
        const bet = j.finalBets[pid] ?? 0;
        const ok = j.finalAnswers[pid] ?? false;
        p.score = p.score + (ok ? bet : -bet);
        j.lastDelta = { playerId: pid, delta: ok ? bet : -bet };
      }
      if (j.finalRevealIdx + 1 >= j.finalRevealOrder.length) {
        j.finalRevealStep = "done";
        j.finalRevealAt = Date.now();
      } else {
        j.finalRevealIdx += 1;
        j.finalRevealStep = "bet";
        j.finalRevealAt = Date.now();
      }
    }),
  );
}

export async function finishJeopardyGame(code: string) {
  const s = readRoom(code);
  if (!s || !s.jeopardy) return fake(null);
  s.jeopardy.phase = "podium";
  s.status = "finished";
  writeRoom(s);
  // Persist result
  try {
    const sorted = [...s.players].sort((a, b) => b.score - a.score);
    const winner = sorted[0] ?? null;
    const hasFinal = Object.keys(s.jeopardy.finalBets).length > 0;
    saveJeopardyResult({
      gameId: s.gameId,
      hasFinal,
      winnerId: winner?.id ?? null,
      teams: s.players.map((p) => ({
        id: p.id,
        name: p.nickname,
        score: p.score,
        correct: p.jCorrect ?? 0,
        wrong: p.jWrong ?? 0,
        finalBet: hasFinal ? (s.jeopardy!.finalBets[p.id] ?? 0) : undefined,
        finalCorrect: hasFinal ? (s.jeopardy!.finalAnswers[p.id] ?? false) : undefined,
      })),
    });
  } catch (err) {
    console.error("Failed to save online jeopardy result", err);
  }
  return fake(s);
}

export async function adjustJeopardyScore(code: string, playerId: string, delta: number) {
  return fake(
    mutJeopardy(code, (_j, s) => {
      const p = s.players.find((x) => x.id === playerId);
      if (p) p.score = p.score + delta;
    }),
  );
}

// =========================================================================
//                        AI HELPERS (TZ AI v2.0)
// =========================================================================
// Все функции — заглушки с [MOCK]-маркером. При интеграции с бэкендом
// меняем только тело функций, сигнатуры сохраняем. Промпты, роли и модель
// формируются на сервере — фронт передаёт только input-параметры.

export interface GeneratedQuestion {
  difficulty: "easy" | "medium" | "hard";
  question: string;
  options?: string[];
  correct?: number | boolean;
  correctAnswer?: string;
  pairs?: { left: string; right: string }[];
}

export interface GeneratedQuizQuestion {
  type: "choice" | "bool" | "text" | "matching";
  question: string;
  options?: string[];
  correct?: number | boolean;
  correctAnswer?: string;
  pairs?: { left: string; right: string }[];
}

export interface GeneratedJeopardyCategory {
  name: string;
  description: string;
}

export interface GeneratedJeopardyQuestion {
  points: number;
  difficulty: string;
  q: string;
  a: string;
}

// TODO(server): POST /api/ai/generate-improve-question
export async function improveQuestion(input: {
  currentText: string;
  format: string; // "quiz-choice" | "quiz-bool" | "quiz-text" | "quiz-matching" | "jeopardy" | "millionaire"
  topic?: string;
  wishes?: string;
  reroll?: boolean;
}): Promise<{ variants: GeneratedQuestion[] }> {
  const salt = input.reroll ? ` (reroll ${Math.floor(Math.random() * 100)})` : "";
  const difficulties = ["easy", "medium", "hard"] as const;
  const variants: GeneratedQuestion[] = difficulties.map((difficulty) => {
    const base = {
      difficulty,
      question: `[MOCK] [${difficulty}] Улучшено под ${input.format}: ${input.currentText}${salt}`,
    };
    if (input.format === "quiz-bool") {
      return { ...base, options: ["Да", "Нет"], correct: Math.random() > 0.5 };
    }
    if (input.format === "quiz-text" || input.format === "jeopardy") {
      return { ...base, correctAnswer: `[MOCK] Улучшенный ответ` };
    }
    if (input.format === "quiz-matching") {
      return {
        ...base,
        pairs: [
          { left: "[MOCK] A", right: "[MOCK] 1" },
          { left: "[MOCK] B", right: "[MOCK] 2" },
          { left: "[MOCK] C", right: "[MOCK] 3" },
        ],
      };
    }
    if (input.format === "quiz-close") {
      return {
        ...base,
        question: `[MOCK] [${difficulty}] Столица Франции — ___, Германии — ___`,
        correctAnswer: "Париж|Берлин",
      };
    }
    if (input.format === "quiz-ordering") {
      return {
        ...base,
        question: `[MOCK] [${difficulty}] Расставьте по возрастанию:`,
        options: ["[MOCK] Один", "[MOCK] Два", "[MOCK] Три", "[MOCK] Четыре"],
      };
    }
    // quiz-choice / millionaire / default
    return {
      ...base,
      options: ["[MOCK] Правильный", "[MOCK] Неправильный 1", "[MOCK] Неправильный 2", "[MOCK] Неправильный 3"],
      correct: Math.floor(Math.random() * 4),
    };
  });
  return fake({ variants }, 350);
}

// TODO(server): POST /api/ai/generate-question
export async function generateQuestion(input: {
  topic?: string;
  type?: "choice" | "bool" | "text";
  currentText?: string;
  wishes?: string;
  format?: string; // расширение для передачи точного формата билдера
  reroll?: boolean;
}): Promise<{ variants: GeneratedQuestion[] }> {
  const isImprovement = !!input.currentText && input.currentText.trim().length > 0;
  if (isImprovement) {
    return improveQuestion({
      currentText: input.currentText!,
      format: input.format ?? input.type ?? "quiz-choice",
      topic: input.topic,
      wishes: input.wishes,
      reroll: input.reroll,
    });
  }
  const topic = input.topic?.trim() || "Неожиданные факты";
  const effectiveFormat = input.format ?? input.type ?? "choice";
  const salt = input.reroll ? ` (reroll ${Math.floor(Math.random() * 100)})` : "";
  const difficulties = ["easy", "medium", "hard"] as const;
  const variants: GeneratedQuestion[] = difficulties.map((difficulty, i) => {
    const base = {
      difficulty,
      question: `[MOCK] [${difficulty}] Вопрос ${i + 1} по теме "${topic}"${salt}`,
    };
    if (effectiveFormat === "quiz-bool" || input.type === "bool") {
      return { ...base, options: ["Да", "Нет"], correct: Math.random() > 0.5 };
    }
    if (effectiveFormat === "quiz-text" || input.type === "text") {
      return { ...base, correctAnswer: `[MOCK] Правильный ответ на вопрос` };
    }
    if (effectiveFormat === "quiz-matching") {
      return {
        ...base,
        pairs: [
          { left: "[MOCK] A", right: "[MOCK] 1" },
          { left: "[MOCK] B", right: "[MOCK] 2" },
          { left: "[MOCK] C", right: "[MOCK] 3" },
        ],
      };
    }
    if (effectiveFormat === "quiz-close") {
      return {
        ...base,
        question: `[MOCK] [${difficulty}] Столица Франции — ___, Германии — ___`,
        correctAnswer: "Париж|Берлин",
      };
    }
    if (effectiveFormat === "quiz-ordering") {
      return {
        ...base,
        question: `[MOCK] [${difficulty}] Расставьте по возрастанию:`,
        options: ["[MOCK] Один", "[MOCK] Два", "[MOCK] Три", "[MOCK] Четыре"],
      };
    }
    // choice / millionaire / default
    return {
      ...base,
      options: [
        "[MOCK] Правильный ответ",
        "[MOCK] Неправильный ответ 1",
        "[MOCK] Неправильный ответ 2",
        "[MOCK] Неправильный ответ 3",
      ],
      correct: Math.floor(Math.random() * 4),
    };
  });
  return fake({ variants }, 350);
}

// TODO(server): POST /api/ai/generate-quiz
export async function generateQuiz(input: {
  topic?: string;
  count?: number;
  wishes?: string;
}): Promise<{ title: string; questions: GeneratedQuizQuestion[] }> {
  const topic = input.topic?.trim() || "Удивительные открытия";
  const count = Math.min(20, Math.max(5, input.count ?? 10));
  const questions: GeneratedQuizQuestion[] = Array.from({ length: count }).map((_, i) => {
    const pos = i % 10;
    let type: GeneratedQuizQuestion["type"];
    if (pos < 6) type = "choice";
    else if (pos < 8) type = "text";
    else if (pos === 8) type = "bool";
    else type = "matching";
    const question = `[MOCK] Вопрос ${i + 1} (${type}) по теме "${topic}"`;
    if (type === "choice") {
      return {
        type,
        question,
        options: ["[MOCK] Правильный", "[MOCK] Неправильный 1", "[MOCK] Неправильный 2", "[MOCK] Неправильный 3"],
        correct: Math.floor(Math.random() * 4),
      };
    }
    if (type === "bool") {
      return {
        type,
        question,
        options: ["Да", "Нет"],
        correct: Math.random() > 0.5,
      };
    }
    if (type === "text") {
      return {
        type,
        question,
        correctAnswer: "[MOCK] Правильный ответ",
      };
    }
    // matching
    return {
      type,
      question,
      pairs: [
        { left: "[MOCK] A", right: "[MOCK] 1" },
        { left: "[MOCK] B", right: "[MOCK] 2" },
        { left: "[MOCK] C", right: "[MOCK] 3" },
      ],
    };
  });
  return fake({ title: `[MOCK] Квиз: ${topic}`, questions }, 500);
}

// TODO(server): POST /api/ai/generate-jeopardy-categories
export async function generateJeopardyCategories(input: {
  topic?: string;
  wishes?: string;
}): Promise<{ categories: GeneratedJeopardyCategory[] }> {
  const topic = input.topic?.trim() || "Удивительные явления";
  return fake(
    {
      categories: [
        { name: `[MOCK] ${topic}: ключевые события`, description: "Основные даты и факты" },
        { name: `[MOCK] ${topic}: личности`, description: "Выдающиеся деятели" },
        { name: `[MOCK] ${topic}: малоизвестные факты`, description: "Удивительные подробности" },
      ],
    },
    400,
  );
}

// TODO(server): POST /api/ai/generate-jeopardy-questions
export async function generateJeopardyQuestions(input: {
  category: string;
  emptySlots: number[];
  wishes?: string;
}): Promise<{ questions: GeneratedJeopardyQuestion[] }> {
  const difficultyMap: Record<number, string> = {
    100: "easy",
    200: "easy-medium",
    300: "medium",
    400: "medium-hard",
    500: "hard",
  };
  const questions = input.emptySlots.map((points) => ({
    points,
    difficulty: difficultyMap[points] ?? "medium",
    q: `[MOCK] [${points}] Вопрос по теме "${input.category}"`,
    a: `[MOCK] Ответ на ${points}`,
  }));
  return fake({ questions }, 400);
}

// ---------- Public export for debugging / migration audits ----------
export const __apiVersion = "1.1.0-facade-ai";

// ---------- Library "played" tab helper ----------
export async function listPlayedGameIdsForUser(userId: string): Promise<Set<string>> {
  const out = new Set<string>();
  if (typeof window === "undefined") return fake(out);
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    let gameId = "";
    if (k.startsWith("islandquiz.v1.results.")) gameId = k.slice("islandquiz.v1.results.".length);
    else if (k.startsWith("islandquiz.v1.jresults.")) gameId = k.slice("islandquiz.v1.jresults.".length);
    else if (k.startsWith("islandquiz.v1.online-results.")) gameId = k.slice("islandquiz.v1.online-results.".length);
    else if (k.startsWith("islandquiz.v1.millionaire-results."))
      gameId = k.slice("islandquiz.v1.millionaire-results.".length);
    else continue;
    try {
      const arr = JSON.parse(localStorage.getItem(k) || "[]") as Array<Record<string, unknown>>;
      const hit = arr.some((r) => {
        if (r.userId === userId) return true;
        const players = (r.players ?? []) as Array<Record<string, unknown>>;
        return Array.isArray(players) && players.some((p) => p.userId === userId);
      });
      if (hit) out.add(gameId);
    } catch {
      /* skip */
    }
  }
  return fake(out);
}

// ---------- Ratings ----------
export function computeRatingStats(g: StoredGame): { avg: number; count: number } {
  const r = g.ratings;
  if (!r) return { avg: 0, count: 0 };
  const values = Object.values(r);
  if (!values.length) return { avg: 0, count: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  return { avg: sum / values.length, count: values.length };
}

// TODO(server): POST /api/games/:id/rate
export async function rateGame(gameId: string, rating: number): Promise<{ ok: boolean }> {
  const me = getCurrentUser();
  if (!me) return fake({ ok: false });
  const r = Math.max(1, Math.min(5, Math.round(rating)));
  const all = _listGames();
  const g = all.find((x) => x.id === gameId);
  if (!g) return fake({ ok: false });
  const ratings = { ...(g.ratings ?? {}), [me.id]: r };
  _saveGame(g.kind, g.id, g.data, {
    ownerId: g.ownerId,
    ownerName: g.ownerName,
    visibility: g.visibility,
    forkedFrom: g.forkedFrom,
    forkedOwnerName: g.forkedOwnerName,
    tags: g.tags,
    playCount: g.playCount,
    ratings,
  });
  return fake({ ok: true });
}

export function getMyRating(g: StoredGame, userId?: string): number | undefined {
  if (!userId) return undefined;
  return g.ratings?.[userId];
}

// ---------- Public profiles ----------
export interface PublicProfile {
  user: User;
  games: StoredGame[];
  stats: { gamesCount: number; avgRating: number; totalRatings: number };
}

// TODO(server): GET /api/users/:id
export async function getUserProfile(userId: string): Promise<PublicProfile | null> {
  const user = findUserById(userId);
  if (!user) return fake(null);
  const me = getCurrentUser();
  const all = _listGames();
  const mine = all.filter((g) => g.ownerId === userId);
  const visible =
    me?.id === userId ? mine : mine.filter((g) => g.visibility === "public");
  let totalRatings = 0;
  let ratingSum = 0;
  for (const g of mine) {
    const { avg, count } = computeRatingStats(g);
    if (count) {
      totalRatings += count;
      ratingSum += avg * count;
    }
  }
  const avgRating = totalRatings ? ratingSum / totalRatings : 0;
  return fake({
    user,
    games: visible,
    stats: { gamesCount: mine.length, avgRating, totalRatings },
  });
}

// TODO(server): GET /api/users/:id/games
export async function getUserGames(userId: string): Promise<StoredGame[]> {
  const me = getCurrentUser();
  const all = _listGames().filter((g) => g.ownerId === userId);
  return fake(me?.id === userId ? all : all.filter((g) => g.visibility === "public"));
}

