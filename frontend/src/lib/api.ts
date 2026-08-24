// src/lib/api.ts — единая точка входа для всех данных (TZ v2.0 §10, §11).
// REST + WebSocket поверх FastAPI-бэкенда. Контракт функций для UI сохранён.

import type {
  QuizResult,
  OnlineQuizResult,
  OnlineQuizPlayerAnswer,
  OnlineQuizPlayerResult,
  MillionaireResult,
  MillionaireAnswerDetail,
} from "./results";
import type { JeopardyResult } from "./jeopardy-results";
import type {
  GameKind,
  GameVisibility,
  JeopardyData,
  PlayerTheme,
  QuizData,
  QuizQuestion,
  StoredGame,
} from "./types";
import { normalizePlayerTheme } from "./types";
import type { User } from "./auth";
import { formatQuizAnswer, formatGivenAnswer } from "./format-answer";
import { clearAuthToken, getAuthToken, setAuthToken } from "./auth";
import type { TagSuggestion } from "./tags";

// Re-export types consumed by other modules so the facade stays the single entry point.
export type { User } from "./auth";
export type { GameKind, GameVisibility, StoredGame } from "./types";
export type {
  QuizResult,
  OnlineQuizResult,
  OnlineQuizPlayerAnswer,
  OnlineQuizPlayerResult,
  MillionaireResult,
  MillionaireAnswerDetail,
} from "./results";
export type { JeopardyResult } from "./jeopardy-results";

// ---------- HTTP helper ----------
const BASE_URL = "https://api.islandquiz.online";
const WS_BASE = "wss://api.islandquiz.online";
const AUTH_EXPIRED_EVENT = "islandquiz:auth-expired";

export async function apiFetch(path: string, options?: RequestInit): Promise<any> {
  const token = getAuthToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      clearAuthToken();
      if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    const error = await res.json().catch(() => ({ error: "Network error" }));
    throw new Error(error.error || error.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface AdminUser {
  id: string;
  email?: string | null;
  name?: string | null;
  plan?: string | null;
  role?: string | null;
  banned?: boolean | null;
  created_at?: string | null;
}

export interface AdminGame {
  id: string;
  kind?: string | null;
  data?: { config?: { title?: string | null } } | null;
  owner_name?: string | null;
  visibility?: string | null;
}

export interface AdminListResponse<T> {
  total: number;
  limit: number;
  offset: number;
  items: T[];
}

export async function getAdminUsers(limit = 20, offset = 0): Promise<AdminListResponse<AdminUser>> {
  const data = await apiFetch(`/api/admin/users?limit=${limit}&offset=${offset}`);
  return { items: Array.isArray(data?.users) ? data.users : [], total: data?.total ?? 0, limit: data?.limit ?? limit, offset: data?.offset ?? offset };
}

export async function getAdminGames(limit = 20, offset = 0): Promise<AdminListResponse<AdminGame>> {
  const data = await apiFetch(`/api/admin/games?limit=${limit}&offset=${offset}`);
  return { items: Array.isArray(data?.games) ? data.games : [], total: data?.total ?? 0, limit: data?.limit ?? limit, offset: data?.offset ?? offset };
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function toMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : Date.now();
  }
  return Date.now();
}

function mapUser(u: any): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatar: u.avatar ?? undefined,
    bio: u.bio ?? undefined,
    subject: u.subject ?? undefined,
    role: u.role ?? undefined,
    telegramId: u.telegram_id ?? undefined,
    createdAt: toMs(u.created_at ?? u.createdAt),
  };
}

function mapGame<T = unknown>(g: any): StoredGame<T> {
  return {
    id: g.id,
    kind: g.kind,
    data: g.data,
    updatedAt: toMs(g.updated_at ?? g.updatedAt),
    ownerId: g.owner_id ?? g.ownerId ?? undefined,
    ownerName: g.owner_name ?? g.ownerName ?? undefined,
    visibility: g.visibility,
    forkedFrom: g.forked_from ?? g.forkedFrom ?? undefined,
    forkedOwnerName: g.forked_owner_name ?? g.forkedOwnerName ?? undefined,
    tags: g.tags ?? undefined,
    ratings: g.ratings ?? undefined,
    playCount: g.play_count ?? g.playCount ?? 0,
    showAnswers: g.show_answers ?? g.showAnswers ?? false,
  };
}

function mapQuizResult(r: any): QuizResult {
  return {
    id: r.id,
    gameId: r.gameId ?? r.game_id,
    userId: r.userId ?? r.user_id ?? undefined,
    playerName: r.playerName ?? r.player_name,
    avatar: r.avatar ?? undefined,
    score: r.score,
    maxScore: r.maxScore ?? r.max_score,
    correctCount: r.correctCount ?? r.correct_count,
    totalQuestions: r.totalQuestions ?? r.total_questions,
    timeSec: r.timeSec ?? r.time_sec,
    finishedAt: toMs(r.finishedAt ?? r.finished_at),
    answers: r.answers ?? undefined,
  };
}

function mapJeopardyResult(r: any): JeopardyResult {
  return {
    id: r.id,
    gameId: r.gameId ?? r.game_id,
    playedAt: toMs(r.playedAt ?? r.played_at),
    teams: r.teams ?? [],
    winnerId: r.winnerId ?? r.winner_id ?? null,
    hasFinal: r.hasFinal ?? r.has_final ?? false,
    userId: r.userId ?? r.user_id ?? undefined,
    avatar: r.avatar ?? undefined,
  };
}

function mapMillionaireResult(r: any): MillionaireResult {
  return {
    id: r.id,
    gameId: r.gameId ?? r.game_id,
    userId: r.userId ?? r.user_id ?? undefined,
    playerName: r.playerName ?? r.player_name,
    avatar: r.avatar ?? undefined,
    outcome: r.outcome,
    wonAmount: r.wonAmount ?? r.won_amount,
    guaranteedAmount: r.guaranteedAmount ?? r.guaranteed_amount,
    reachedCount: r.reachedCount ?? r.reached_count,
    totalQuestions: r.totalQuestions ?? r.total_questions,
    timeSec: r.timeSec ?? r.time_sec,
    finishedAt: toMs(r.finishedAt ?? r.finished_at),
    answers: r.answers ?? [],
  };
}

function mapOnlineResult(r: any): OnlineQuizResult {
  return {
    id: r.id,
    gameId: r.gameId ?? r.game_id,
    roomCode: r.roomCode ?? r.room_code,
    playedAt: toMs(r.playedAt ?? r.played_at),
    durationSec: r.durationSec ?? r.duration_sec,
    players: r.players ?? [],
  };
}

// Latency helper kept for AI stubs only
const fake = <T,>(value: T, ms = 120): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

// ---------- Auth ----------
export async function register(input: { email: string; password: string; name: string }) {
  const body = {
    email: input.email.trim().toLowerCase(),
    password: input.password,
    name: input.name.trim(),
  };
  if (!body.email || !body.password || !body.name) {
    return { ok: false as const, error: "Заполните все поля" };
  }
  const data = await apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (data.ok && data.token) {
    setAuthToken(data.token);
  }
  if (data.ok && data.user) {
    await bindOrphanGames();
    return { ok: true as const, user: mapUser(data.user) };
  }
  return { ok: false as const, error: (data.error as string) || "Ошибка регистрации" };
}

export async function login(input: { email: string; password: string }) {
  const body = {
    email: input.email.trim().toLowerCase(),
    password: input.password,
  };
  if (!body.email || !body.password) {
    return { ok: false as const, error: "Заполните все поля" };
  }
  const data = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (data.ok && data.token) {
    setAuthToken(data.token);
  }
  if (data.ok && data.user) {
    await bindOrphanGames();
    return { ok: true as const, user: mapUser(data.user) };
  }
  return { ok: false as const, error: (data.error as string) || "Неверный email или пароль" };
}

export async function logout() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
  clearAuthToken();
  return { ok: true };
}

export async function forgotPassword(email: string) {
  const form = new URLSearchParams();
  form.append("email", email);
  return apiFetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

export async function resetPassword(token: string, newPassword: string) {
  const form = new URLSearchParams();
  form.append("token", token);
  form.append("password", newPassword);
  return apiFetch("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

export async function getMe(): Promise<User | null> {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const u = await apiFetch("/api/users/me");
    return u ? mapUser(u) : null;
  } catch {
    clearAuthToken();
    return null;
  }
}

export async function updateProfile(patch: {
  name?: string;
  avatar?: string;
  bio?: string;
  subject?: string;
}): Promise<User | null> {
  try {
    const u = await apiFetch("/api/users/me", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return u ? mapUser(u) : null;
  } catch {
    return null;
  }
}

export async function linkEmailPassword(email: string, password: string) {
  return apiFetch("/api/auth/link-email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function startTelegramLink() {
  return apiFetch("/api/auth/telegram/start", { method: "POST" });
}

export async function deleteAccount() {
  const token = getAuthToken();
  await apiFetch("/api/users/me", {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  clearAuthToken();
}

// ---------- Games ----------
export type AnyGameData = QuizData | JeopardyData | import("./types").MillionaireData;

export interface SaveGameInput<T = AnyGameData> {
  id?: string;
  kind: GameKind;
  data: T;
  title?: string;
  tags?: string[];
  visibility?: GameVisibility;
  showAnswers?: boolean;
}

export async function saveGame<T = AnyGameData>(input: SaveGameInput<T>) {
  return apiFetch("/api/games/", {
    method: "POST",
    body: JSON.stringify({
      id: input.id,
      kind: input.kind,
      data: input.data,
      title: input.title,
      tags: input.tags,
      visibility: input.visibility,
      show_answers: input.showAnswers,
    }),
  }) as Promise<{ id: string; play_url: string }>;
}

export async function getTagSuggestions(
  query = "",
  limit = 10,
  signal?: AbortSignal,
): Promise<TagSuggestion[]> {
  const data = await apiFetch(`/api/tags?query=${encodeURIComponent(query)}&limit=${limit}`, { signal });
  return Array.isArray(data?.tags) ? data.tags : [];
}

export async function forkGame(gameId: string): Promise<{ id: string } | null> {
  try {
    return await apiFetch(`/api/games/${gameId}/fork`, { method: "POST" });
  } catch {
    return null;
  }
}

export async function setGameVisibility(gameId: string, visibility: GameVisibility) {
  return apiFetch(
    `/api/games/${gameId}/visibility?visibility=${encodeURIComponent(visibility)}`,
    { method: "PATCH" },
  ) as Promise<{ ok: boolean }>;
}

export async function setGameShowAnswers(gameId: string, showAnswers: boolean) {
  return apiFetch(
    `/api/games/${gameId}/show-answers?show_answers=${showAnswers}`,
    { method: "PATCH" },
  ) as Promise<{ ok: boolean }>;
}

// Server stores ownership — orphans are a localStorage migration concept only.
export async function bindOrphanGames(): Promise<number> {
  return 0;
}

export function countOrphanGames(): number {
  return 0;
}

export async function loadGame<T = AnyGameData>(kind: GameKind, id: string) {
  try {
    const g = await apiFetch(`/api/games/${id}/play`);
    if (!g) return null;
    const mapped = mapGame<T>(g);
    if (mapped.kind !== kind) return null;
    return mapped;
  } catch {
    return null;
  }
}

export async function listGames(kind?: GameKind, limit = 20, offset = 0): Promise<{ games: StoredGame[]; total: number; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  const path = `/api/games/?${params.toString()}`;
  const data = await apiFetch(path);
  return {
    games: Array.isArray(data.games) ? data.games.map((g: any) => mapGame(g)) : [],
    total: data.total ?? 0,
    limit: data.limit ?? limit,
    offset: data.offset ?? offset,
  };
}

export async function findGame(id: string): Promise<StoredGame | null> {
  try {
    const g = await apiFetch(`/api/games/${id}`);
    console.log("[findGame] raw:", g);
    const mapped = g ? mapGame(g) : null;
    console.log("[findGame] mapped:", mapped);
    return mapped;
  } catch (e) {
    console.error("[findGame] error:", e);
    return null;
  }
}

export async function getGamePreview(id: string): Promise<StoredGame | null> {
  try {
    const g = await apiFetch(`/api/games/${id}/preview`);
    return g ? mapGame(g) : null;
  } catch {
    return null;
  }
}

export async function deleteGame(_kind: GameKind, id: string) {
  return apiFetch(`/api/games/${id}`, { method: "DELETE" });
}

// ---------- Results (per-quiz dashboard) ----------
export async function getResults(gameId: string) {
  const list = await apiFetch(`/api/quiz/${gameId}/results`);
  return Array.isArray(list) ? list.map(mapQuizResult) : [];
}

export async function createPlaySnapshot<T>(kind: GameKind, gameId: string) {
  return apiFetch(`/api/games/${gameId}/play-snapshot`, {
    method: "POST",
    body: JSON.stringify({ kind }),
  }) as Promise<{ data: T; version: string; snapshotToken: string }>;
}

export async function submitResult(payload: {
  gameId: string;
  playerName: string;
  timeSec: number;
  snapshotToken: string;
  answers: { qId: string; given: string }[];
}) {
  return apiFetch(`/api/quiz/${payload.gameId}/results`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---------- Millionaire results ----------
export async function getMillionaireResults(gameId: string): Promise<MillionaireResult[]> {
  const list = await apiFetch(`/api/millionaire/${gameId}/results`);
  return Array.isArray(list) ? list.map(mapMillionaireResult) : [];
}

export async function submitMillionaireResult(
  payload: { gameId: string; playerName: string; timeSec: number; snapshotToken: string; answers: { qIdx: number; selectedIndex?: number }[] },
) {
  return apiFetch(`/api/millionaire/${payload.gameId}/results`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---------- Jeopardy results ----------
export async function getJeopardyResults(gameId: string): Promise<JeopardyResult[]> {
  const list = await apiFetch(`/api/jeopardy/${gameId}/results`);
  return Array.isArray(list) ? list.map(mapJeopardyResult) : [];
}

export async function getJeopardyGameDetail(
  gameId: string,
  resultId: string,
): Promise<JeopardyResult | null> {
  try {
    const r = await apiFetch(`/api/jeopardy/${gameId}/results/${resultId}`);
    return r ? mapJeopardyResult(r) : null;
  } catch {
    return null;
  }
}

export async function submitJeopardyResult(
  payload: {
    gameId: string;
    snapshotToken: string;
    teams: { id: string; name: string }[];
    decisions: ({ kind: "question"; playerId: string; correct: boolean; round: number; catIdx: number; qIdx: number } | { kind: "final"; playerId: string; correct: boolean; bet: number })[];
  },
) {
  return apiFetch(`/api/jeopardy/${payload.gameId}/results`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ---------- Online rooms (WebSocket Sync Mode, TZ §3) ----------

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
  buzzedPlayerIds: string[];
  buzzedAnswer: string | null;
  buzzStartAt: number | null;
  buzzTimeoutMs: number;
  questionTotalMs: number;
  questionElapsedMs: number;
  showAnswer: boolean;
  awaitingBonus: boolean;
  finalBets: Record<string, number>;
  finalAnswers: Record<string, boolean>;
  finalGiven: Record<string, string>;
  finalRevealOrder: string[];
  finalRevealIdx: number;
  finalRevealStep: "bet" | "answer" | "score" | "done";
  finalRevealAt: number | null;
  lastDelta?: { playerId: string; delta: number } | null;
}

export interface RoomState {
  code: string;
  gameKind: GameKind;
  gameId: string;
  theme: PlayerTheme;
  hostId: string;
  status: RoomStatus;
  questionIdx: number;
  questionStartAt: number | null;
  players: RoomPlayer[];
  fastestPlayerId?: string;
  createdAt: number;
  jeopardy?: JeopardyRoomState;
}

type RoomConn = {
  ws: WebSocket;
  handlers: Set<(s: RoomState) => void>;
  onceWaiters: Set<(msg: RoomMessage) => void>;
  state: RoomState | null;
  available: boolean;
  openPromise: Promise<void>;
};

type RoomMessage = {
  type: string;
  state?: RoomState;
  error?: string;
  credential?: string;
  role?: "host" | "player";
  playerId?: string;
};

const ROOM_HOST_CREDENTIAL_PREFIX = "islandquiz.room.host.";
const ROOM_PLAYER_CREDENTIAL_PREFIX = "islandquiz.room.player.";

function roomCredential(code: string): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem(`${ROOM_HOST_CREDENTIAL_PREFIX}${code}`) ??
    sessionStorage.getItem(`${ROOM_PLAYER_CREDENTIAL_PREFIX}${code}`)
  );
}

function storeRoomCredential(code: string, message: RoomMessage) {
  if (!message.credential || !message.role || typeof window === "undefined") return;
  const key =
    message.role === "host"
      ? `${ROOM_HOST_CREDENTIAL_PREFIX}${code}`
      : `${ROOM_PLAYER_CREDENTIAL_PREFIX}${code}`;
  const storage = message.role === "host" ? localStorage : sessionStorage;
  storage.setItem(key, message.credential);
}

const roomConns = new Map<string, RoomConn>();

let reconnectAttempts: Record<string, number> = {};

function ensureRoomConn(code: string): RoomConn {
  const existing = roomConns.get(code);
  if (existing && (existing.ws.readyState === WebSocket.OPEN || existing.ws.readyState === WebSocket.CONNECTING)) {
    reconnectAttempts[code] = 0;
    return existing;
  }

  const credential = roomCredential(code);
  const suffix = credential ? `?credential=${encodeURIComponent(credential)}` : "";
  const ws = new WebSocket(`${WS_BASE}/ws/room/${code}${suffix}`);
  const handlers = new Set<(s: RoomState) => void>();
  const onceWaiters = new Set<(msg: RoomMessage) => void>();

  let resolveOpen!: () => void;
  const openPromise = new Promise<void>((resolve) => {
    resolveOpen = resolve;
  });

  const conn: RoomConn = { ws, handlers, onceWaiters, state: null, available: false, openPromise };

  ws.onopen = () => {
    reconnectAttempts[code] = 0;
    resolveOpen();
  };
  
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string) as RoomMessage;
      if (msg.type === "room_identity") storeRoomCredential(code, msg);
      if (msg.type === "room_state" && msg.state) {
        const state = { ...msg.state, theme: normalizePlayerTheme(msg.state.theme) ?? "classic" };
        conn.available = true;
        conn.state = state;
        handlers.forEach((h) => h(state));
      }
      if (msg.type === "room_available") conn.available = true;
      onceWaiters.forEach((w) => w(msg));
    } catch {
      /* ignore malformed */
    }
  };
  
  ws.onclose = () => {
    if (roomConns.get(code) === conn) {
      roomConns.delete(code);
      const attempt = reconnectAttempts[code] || 0;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      reconnectAttempts[code] = attempt + 1;
      console.log(`[WS] Room ${code} disconnected. Reconnecting in ${delay}ms (attempt ${attempt + 1})`);
      setTimeout(() => {
        const newConn = ensureRoomConn(code);
        // Перенести хендлеры в новое соединение
        handlers.forEach(h => newConn.handlers.add(h));
        if (conn.state) newConn.state = conn.state;
        roomConns.set(code, newConn);
      }, delay);
    }
  };
  
  ws.onerror = () => resolveOpen();

  roomConns.set(code, conn);
  return conn;
}

function sendRoom(code: string, payload: Record<string, unknown>) {
  const conn = ensureRoomConn(code);
  const send = () => {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(payload));
    }
  };
  if (conn.ws.readyState === WebSocket.OPEN) send();
  else void conn.openPromise.then(send);
}

function waitRoomMessage(
  code: string,
  pred: (msg: RoomMessage) => boolean,
  timeoutMs = 8000,
): Promise<RoomMessage> {
  const conn = ensureRoomConn(code);
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      conn.onceWaiters.delete(onMsg);
      reject(new Error("Таймаут комнаты"));
    }, timeoutMs);
    const onMsg = (msg: RoomMessage) => {
      if (!pred(msg)) return;
      window.clearTimeout(timer);
      conn.onceWaiters.delete(onMsg);
      resolve(msg);
    };
    conn.onceWaiters.add(onMsg);
  });
}

async function sendAndWaitState(code: string, payload: Record<string, unknown>): Promise<RoomState | null> {
  const conn = ensureRoomConn(code);
  await conn.openPromise;
  const wait = waitRoomMessage(code, (m) => m.type === "room_state" && !!m.state);
  sendRoom(code, payload);
  try {
    const msg = await wait;
    return msg.state ?? conn.state;
  } catch {
    return conn.state;
  }
}

function sendJeopardyAction(
  code: string,
  payload: Record<string, unknown>,
  phases: JeopardyPhase[],
): Promise<RoomState | null> {
  const state = roomConns.get(code)?.state;
  if (!state?.jeopardy || !phases.includes(state.jeopardy.phase)) return Promise.resolve(state ?? null);
  return sendAndWaitState(code, payload);
}

export function subscribeRoom(code: string, handler: (s: RoomState) => void) {
  if (typeof window === "undefined") return () => {};
  const conn = ensureRoomConn(code);
  conn.handlers.add(handler);
  if (conn.state) handler(conn.state);
  void conn.openPromise.then(() => {
    if (conn.state) handler(conn.state);
  });
  return () => {
    conn.handlers.delete(handler);
  };
}

export async function createRoom(gameKind: GameKind, gameId: string, theme: PlayerTheme = "classic") {
  const snapshot = await createPlaySnapshot(gameKind, gameId);
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const conn = ensureRoomConn(code);
  await conn.openPromise;
  const creation = waitRoomMessage(
    code,
    (m) => m.type === "error" || (m.type === "room_state" && !!m.state),
  );
  sendRoom(code, {
    action: "create_room",
    gameKind,
    gameId,
    theme,
    snapshotToken: snapshot.snapshotToken,
  });
  const message = await creation;
  if (message.type === "error") {
    throw new Error(message.error || "Не удалось создать комнату");
  }
  return { code, room_url: `/room/${code}` };
}

const MAX_ROOM_AVATAR_BYTES = 2 * 1024;

function roomAvatar(avatar: string): string {
  return new TextEncoder().encode(avatar).byteLength <= MAX_ROOM_AVATAR_BYTES ? avatar : "";
}

export async function joinRoom(code: string, nickname: string, avatar: string) {
  const conn = ensureRoomConn(code);
  await conn.openPromise;
  // Unbound sockets receive room_available, while identified sockets receive room_state.
  let roomAvailable = conn.available;
  if (!roomAvailable) {
    const initial = await waitRoomMessage(
      code,
      (m) => m.type === "room_state" || m.type === "room_available",
      1500,
    ).catch(() => null);
    roomAvailable = initial?.type === "room_available" || initial?.type === "room_state";
  }
  if (!roomAvailable) {
    return { success: false as const, error: "Комната не найдена" };
  }

  const errorWait = waitRoomMessage(
    code,
    (m) => m.type === "error" || (m.type === "room_state" && !!m.state),
  );
  sendRoom(code, { action: "join", player: { nickname, avatar: roomAvatar(avatar) } });
  try {
    const msg = await errorWait;
    if (msg.type === "error") {
      return { success: false as const, error: msg.error || "Комната не найдена" };
    }
  } catch {
    /* use cached */
  }

  const playerId = conn.state?.players.find((p) => p.nickname === nickname)?.id;
  if (!playerId || !roomCredential(code)) return { success: false as const, error: "Не удалось присоединиться" };
  return { success: true as const, player_id: playerId };
}

export async function getRoomState(code: string) {
  const conn = roomConns.get(code);
  if (conn?.state) return conn.state;
  const c = ensureRoomConn(code);
  await c.openPromise;
  if (!c.state) {
    await waitRoomMessage(code, (m) => m.type === "room_state", 2000).catch(() => null);
  }
  return c.state;
}

export async function startRoom(code: string) {
  return sendAndWaitState(code, {
    action: "start",
    questionStartAt: Date.now(),
  });
}

export async function revealAnswer(code: string) {
  return sendAndWaitState(code, { action: "reveal" });
}

export async function showLeaderboard(code: string) {
  return sendAndWaitState(code, { action: "leaderboard" });
}

export async function nextQuestion(code: string) {
  return sendAndWaitState(code, {
    action: "next_question",
    questionStartAt: Date.now(),
  });
}

export async function finishRoom(code: string) {
  return sendAndWaitState(code, { action: "finish" });
}

export async function kickPlayer(code: string, playerId: string) {
  return sendAndWaitState(code, { action: "kick", playerId });
}

export async function adjustPlayerScore(code: string, playerId: string, delta: number) {
  return sendAndWaitState(code, { action: "adjust_score", playerId, delta });
}

export async function restartRoom(code: string) {
  return sendAndWaitState(code, { action: "restart" });
}

// Kahoot-style scoring (TZ §0)
export function computeKahootScore(opts: {
  correct: boolean;
  timeMs: number;
  totalMs: number;
  streakBefore: number;
}) {
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
  payload: { given?: string },
) {
  const s = roomConns.get(code)?.state;
  if (!s) return { correct: false, score: 0 };
  const p = s.players.find((pl) => pl.id === playerId);
  if (!p) return { correct: false, score: 0 };
  if (p.lastAnswer?.questionIdx === s.questionIdx) {
    return { correct: p.lastAnswer.correct, score: p.score };
  }
  await sendAndWaitState(code, {
    action: "answer",
    given: payload.given ?? "",
  });
  const after = roomConns.get(code)?.state;
  const player = after?.players.find((pl) => pl.id === playerId);
  const answer = player?.lastAnswer;
  return { correct: answer?.correct ?? false, score: player?.score ?? p.score, delta: answer?.delta ?? 0 };
}

export async function getOnlineResults(gameId: string): Promise<OnlineQuizResult[]> {
  const list = await apiFetch(`/api/quiz/${gameId}/online-results`);
  return Array.isArray(list) ? list.map(mapOnlineResult) : [];
}

export async function listRooms() {
  // Rooms live only in memory on the server — no list endpoint.
  return [] as RoomState[];
}

// =========================================================================
//                        ONLINE JEOPARDY (rooms)
// =========================================================================

export async function setJeopardyMode(code: string, mode: "buzz" | "turn") {
  return sendJeopardyAction(code, { action: "jeopardy_set_mode", mode }, ["lobby", "board"]);
}

export async function startJeopardyGame(code: string) {
  return sendJeopardyAction(code, { action: "jeopardy_start" }, ["lobby"]);
}

export async function selectJeopardyQuestion(
  code: string,
  playerId: string | null,
  catIdx: number,
  qIdx: number,
) {
  const s = roomConns.get(code)?.state;
  if (!s?.jeopardy) return null;
  const j = s.jeopardy;
  if (j.mode === "turn" && playerId) {
    const cur = s.players[j.currentPlayerIdx]?.id;
    if (cur && cur !== playerId) return s;
  }
  if (j.mode === "buzz" && playerId) return s;
  if (j.phase !== "board" || !Number.isInteger(catIdx) || catIdx < 0 || !Number.isInteger(qIdx) || qIdx < 0) return s;
  const key = `${j.round}-${catIdx}-${qIdx}`;
  if (j.usedKeys.includes(key)) return s;

  let questionTotalMs = 30000;
  try {
    const rec = await loadGame<JeopardyData>("jeopardy", s.gameId);
    const q = rec?.data.rounds[j.round]?.[catIdx]?.questions[qIdx];
    const timeBase = rec?.data.config.timeBase ?? 30;
    const timeStep = rec?.data.config.timeStep ?? 0;
    const tier = q ? Math.max(0, Math.round((q.points || 100) / 100) - 1) : 0;
    questionTotalMs = Math.max(5, timeBase + timeStep * tier) * 1000;
  } catch {
    /* keep default */
  }

  return sendJeopardyAction(code, {
    action: "jeopardy_select",
    catIdx,
    qIdx,
    questionTotalMs,
    questionStartAt: Date.now(),
  }, ["board"]);
}

export async function submitJeopardyBuzzAnswer(code: string, playerId: string, given: string) {
  const s = roomConns.get(code)?.state;
  if (!s?.jeopardy || s.jeopardy.phase !== "answering" || s.jeopardy.buzzedPlayerId !== playerId || !given.trim() || given.length > 2000) return s ?? null;
  return sendJeopardyAction(code, {
    action: "jeopardy_buzz_answer",
    given,
  }, ["answering"]);
}

export async function finalizeJeopardyTurnWrong(code: string) {
  const s = roomConns.get(code)?.state;
  if (!s?.jeopardy || s.jeopardy.mode !== "turn" || !s.jeopardy.awaitingBonus) return s ?? null;
  return sendJeopardyAction(code, { action: "jeopardy_turn_wrong_finalize" }, ["answering"]);
}

export async function buzzJeopardy(code: string, playerId: string) {
  const s = roomConns.get(code)?.state;
  if (!s?.jeopardy) return null;
  const j = s.jeopardy;
  if (j.mode !== "buzz" || j.phase !== "question" || j.buzzedPlayerId) return s;
  if (j.buzzedPlayerIds.includes(playerId)) return s;
  return sendJeopardyAction(code, {
    action: "jeopardy_buzz",
    buzzStartAt: Date.now(),
  }, ["question"]);
}

export async function acceptJeopardyAnswer(code: string, correct: boolean) {
  const s = roomConns.get(code)?.state;
  if (!s?.jeopardy || s.jeopardy.selectedCat == null || s.jeopardy.selectedQ == null) return null;
  let points = 0;
  try {
    const rec = await loadGame<JeopardyData>("jeopardy", s.gameId);
    const q =
      rec?.data.rounds[s.jeopardy.round]?.[s.jeopardy.selectedCat]?.questions[s.jeopardy.selectedQ];
    points = q?.points ?? 0;
  } catch {
    /* keep 0 */
  }
  return sendJeopardyAction(code, {
    action: "jeopardy_accept",
    correct,
    points,
  }, ["answering", "question"]);
}

export async function closeJeopardyQuestion(code: string) {
  return sendJeopardyAction(code, { action: "jeopardy_close_question" }, ["question", "answering", "reveal"]);
}

export async function backToBoard(code: string) {
  return sendJeopardyAction(code, { action: "jeopardy_back_to_board" }, ["question", "answering", "reveal"]);
}

export async function skipJeopardyQuestion(code: string) {
  return sendJeopardyAction(code, { action: "jeopardy_skip" }, ["question", "answering", "reveal"]);
}

export async function endJeopardyRound(code: string) {
  const s = roomConns.get(code)?.state;
  let totalRounds = 1;
  if (s) {
    try {
      const rec = await loadGame<JeopardyData>("jeopardy", s.gameId);
      totalRounds = rec?.data.rounds.length ?? 1;
    } catch {
      /* keep 1 */
    }
  }
  return sendJeopardyAction(code, { action: "jeopardy_end_round", totalRounds }, ["board"]);
}

export async function submitJeopardyFinalBet(code: string, playerId: string, bet: number) {
  const s = roomConns.get(code)?.state;
  const player = s?.players.find((item) => item.id === playerId);
  if (!s?.jeopardy || s.jeopardy.phase !== "final-bets" || !player || !Number.isInteger(bet) || bet < 0 || bet > Math.max(0, player.score)) return s ?? null;
  return sendJeopardyAction(code, {
    action: "jeopardy_final_bet",
    bet,
  }, ["final-bets"]);
}

export async function startJeopardyFinalQuestion(code: string) {
  return sendJeopardyAction(code, { action: "jeopardy_final_start" }, ["final-bets"]);
}

export async function submitJeopardyFinalAnswer(code: string, playerId: string, given: string) {
  const s = roomConns.get(code)?.state;
  if (!s?.jeopardy || s.jeopardy.phase !== "final-question" || !s.players.some((item) => item.id === playerId) || !given.trim() || given.length > 2000) return s ?? null;
  return sendJeopardyAction(code, {
    action: "jeopardy_final_answer",
    given,
  }, ["final-question"]);
}

export async function markJeopardyFinal(code: string, playerId: string, correct: boolean) {
  const s = roomConns.get(code)?.state;
  if (!s?.jeopardy || s.jeopardy.phase !== "final-question" || !s.players.some((item) => item.id === playerId) || !(playerId in s.jeopardy.finalGiven) || playerId in s.jeopardy.finalAnswers) return s ?? null;
  return sendJeopardyAction(code, {
    action: "jeopardy_final_mark",
    playerId,
    correct,
  }, ["final-question"]);
}

export async function revealJeopardyFinal(code: string) {
  return sendJeopardyAction(code, { action: "jeopardy_final_reveal" }, ["final-question"]);
}

export async function advanceJeopardyFinalReveal(code: string) {
  return sendJeopardyAction(code, { action: "jeopardy_final_advance" }, ["final-reveal"]);
}

export async function finishJeopardyGame(code: string) {
  return sendJeopardyAction(code, { action: "jeopardy_finish" }, ["final-reveal"]);
}

export async function adjustJeopardyScore(code: string, playerId: string, delta: number) {
  const s = roomConns.get(code)?.state;
  if (!s?.jeopardy || !["board", "answering", "reveal"].includes(s.jeopardy.phase) || !s.players.some((item) => item.id === playerId) || !Number.isInteger(delta) || Math.abs(delta) > 1000000) return s ?? null;
  return sendJeopardyAction(code, {
    action: "jeopardy_adjust_score",
    playerId,
    delta,
  }, ["board", "answering", "reveal"]);
}

// =========================================================================
//                        AI HELPERS (TZ AI v2.0)
// =========================================================================
// Все функции — заглушки с [MOCK]-маркером. При интеграции с бэкендом
// меняем только тело функций, сигнатуры сохраняем. Промпты, роли и модель
// формируются на сервере — фронт передаёт только input-параметры.

// =========================================================================
//                        AI HELPERS (TZ AI v2.0)
// =========================================================================

export type QuizDifficulty = "easy" | "medium" | "hard" | "mixed";

export interface GeneratedQuestion {
  difficulty: "easy" | "medium" | "hard";
  question: string;
  options?: string[];
  correct?: number | boolean;
  correctAnswer?: string;
  pairs?: { left: string; right: string }[];
}

type AIResponse = Record<string, unknown>;

const AI_QUESTION_TYPES = new Set([
  "choice",
  "bool",
  "text",
  "matching",
  "close",
  "ordering",
]);

function isAIResponse(value: unknown): value is AIResponse {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function aiResponseError(value: unknown): Error | null {
  if (!isAIResponse(value)) return null;
  if (typeof value.error === "string" && value.error.trim()) {
    return new Error(value.error);
  }
  return null;
}

function requireAIResponse(value: unknown, expected: string): AIResponse {
  const error = aiResponseError(value);
  if (error) throw error;
  if (!isAIResponse(value)) {
    throw new Error(`AI вернул некорректные данные: ожидался ${expected}.`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`AI вернул некорректное поле ${field}.`);
  }
  return value.trim();
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`AI вернул некорректное поле ${field}.`);
  }
  return value;
}

function optionalPairs(value: unknown): { left: string; right: string }[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((pair) => !isAIResponse(pair) || typeof pair.left !== "string" || !pair.left.trim() || typeof pair.right !== "string" || !pair.right.trim())) {
    throw new Error("AI вернул некорректные пары для сопоставления.");
  }
  return value as { left: string; right: string }[];
}

function normalizeGeneratedQuestion(value: unknown): GeneratedQuestion {
  const question = requireAIResponse(value, "вариант вопроса");
  const difficulty = question.difficulty;
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
    throw new Error("AI вернул некорректную сложность вопроса.");
  }
  if (question.correct !== undefined && typeof question.correct !== "number" && typeof question.correct !== "boolean") {
    throw new Error("AI вернул некорректный правильный ответ.");
  }
  if (question.correctAnswer !== undefined && typeof question.correctAnswer !== "string") {
    throw new Error("AI вернул некорректный текст правильного ответа.");
  }
  return {
    difficulty,
    question: requireNonEmptyString(question.question, "question"),
    options: optionalStringArray(question.options, "options"),
    correct: question.correct as number | boolean | undefined,
    correctAnswer: question.correctAnswer as string | undefined,
    pairs: optionalPairs(question.pairs),
  };
}

function normalizeGeneratedQuizQuestion(value: unknown): GeneratedQuizQuestion {
  const question = requireAIResponse(value, "вопрос квиза");
  if (typeof question.type !== "string" || !AI_QUESTION_TYPES.has(question.type)) {
    throw new Error("AI вернул неподдерживаемый тип вопроса.");
  }
  const normalized = normalizeGeneratedQuestion(question);
  const type = question.type as GeneratedQuizQuestion["type"];
  const correct = normalized.correct;

  if (type === "choice" && (!normalized.options || normalized.options.length !== 4 || typeof correct !== "number" || !Number.isInteger(correct) || correct < 0 || correct > 3)) {
    throw new Error("AI вернул некорректный вопрос с вариантами ответа.");
  }
  if (type === "bool" && typeof normalized.correct !== "boolean") {
    throw new Error("AI вернул некорректный вопрос Да/Нет.");
  }
  if ((type === "text" || type === "close") && !normalized.correctAnswer?.trim()) {
    throw new Error("AI вернул вопрос без правильного ответа.");
  }
  if (type === "matching" && (!normalized.pairs || normalized.pairs.length < 3)) {
    throw new Error("AI вернул некорректный вопрос на сопоставление.");
  }
  if (type === "ordering" && (!normalized.options || normalized.options.length < 3)) {
    throw new Error("AI вернул некорректный вопрос на порядок.");
  }

  return { ...normalized, type };
}

async function uploadAIFile(path: string, formData: FormData): Promise<unknown> {
  const token = typeof window !== "undefined" ? localStorage.getItem("islandquiz.token") : null;
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });
  const payload: unknown = await response.json().catch(() => ({ error: "Network error" }));
  if (!response.ok) {
    throw aiResponseError(payload) ?? new Error(`HTTP ${response.status}`);
  }
  return payload;
}

export interface GeneratedQuizQuestion {
  type: "choice" | "bool" | "text" | "matching" | "close" | "ordering";
  difficulty?: "easy" | "medium" | "hard";
  question: string;
  options?: string[];
  correct?: number | boolean;
  correctAnswer?: string;
  pairs?: { left: string; right: string }[];
}

export type QuizTypeDistribution = Record<GeneratedQuizQuestion["type"], number>;

export async function getQuizTypeDistribution(count: number): Promise<QuizTypeDistribution> {
  const response = requireAIResponse(
    await apiFetch(`/api/ai/quiz-type-distribution/${count}`),
    "распределение типов",
  );
  const distribution = requireAIResponse(response.distribution, "распределение типов");
  const types: GeneratedQuizQuestion["type"][] = [
    "choice", "bool", "text", "matching", "close", "ordering",
  ];
  const normalized = {} as QuizTypeDistribution;
  for (const type of types) {
    const amount = distribution[type];
    if (!Number.isInteger(amount) || (amount as number) < 0) {
      throw new Error("AI вернул некорректное распределение типов.");
    }
    normalized[type] = amount as number;
  }
  if (Object.values(normalized).reduce((sum, amount) => sum + amount, 0) !== count) {
    throw new Error("AI вернул некорректное общее количество типов.");
  }
  return normalized;
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

export async function improveQuestion(input: {
  currentText: string;
  format: string;
  topic?: string;
  wishes?: string;
  reroll?: boolean;
}): Promise<{ variants: GeneratedQuestion[] }> {
  const response = requireAIResponse(await apiFetch("/api/ai/improve-question", {
    method: "POST",
    body: JSON.stringify(input),
  }), "варианты вопроса");
  if (!Array.isArray(response.variants) || response.variants.length !== 3) {
    throw new Error("AI не вернул варианты вопроса.");
  }
  return { variants: response.variants.map(normalizeGeneratedQuestion) };
}

export async function generateQuestion(input: {
  topic?: string;
  type?: "choice" | "bool" | "text";
  currentText?: string;
  wishes?: string;
  format?: string;
  reroll?: boolean;
  difficulty?: "easy" | "medium" | "hard";
}): Promise<{ variants: GeneratedQuestion[] }> {
  const response = requireAIResponse(await apiFetch("/api/ai/generate-question", {
    method: "POST",
    body: JSON.stringify(input),
  }), "варианты вопроса");
  if (!Array.isArray(response.variants) || response.variants.length !== 3) {
    throw new Error("AI не вернул варианты вопроса.");
  }
  return { variants: response.variants.map(normalizeGeneratedQuestion) };
}

export async function generateQuiz(input: {
  topic?: string;
  count?: number;
  difficulty?: QuizDifficulty;
  wishes?: string;
  type_distribution?: QuizTypeDistribution;
}): Promise<{
  title: string;
  questions: GeneratedQuizQuestion[];
}> {
  const expectedCount = Math.min(20, Math.max(5, input.count ?? 10));
  const response = requireAIResponse(await apiFetch("/api/ai/generate-quiz", {
    method: "POST",
    body: JSON.stringify(input),
  }), "квиз");
  if (!Array.isArray(response.questions) || response.questions.length !== expectedCount) {
    throw new Error("AI не вернул вопросы квиза.");
  }
  return {
    title: requireNonEmptyString(response.title, "title"),
    questions: response.questions.map(normalizeGeneratedQuizQuestion),
  };
}

export async function generateQuizFromFile(input: {
  file: File;
  count: number;
  difficulty: QuizDifficulty;
  wishes?: string;
  type_distribution?: QuizTypeDistribution;
}): Promise<{ title: string; questions: GeneratedQuizQuestion[] }> {
  const expectedCount = Math.min(20, Math.max(5, input.count));
  const formData = new FormData();
  formData.append("file", input.file);
  formData.append("count", String(input.count));
  formData.append("difficulty", input.difficulty);
  if (input.wishes) formData.append("wishes", input.wishes);
  if (input.type_distribution) {
    formData.append("type_distribution", JSON.stringify(input.type_distribution));
  }

  const response = requireAIResponse(
    await uploadAIFile("/api/ai/generate-from-file", formData),
    "квиз",
  );
  if (!Array.isArray(response.questions) || response.questions.length !== expectedCount) {
    throw new Error("AI не вернул вопросы квиза.");
  }
  return {
    title: requireNonEmptyString(response.title, "title"),
    questions: response.questions.map(normalizeGeneratedQuizQuestion),
  };
}

export async function generateJeopardyCategories(input: {
  topic?: string;
  wishes?: string;
}): Promise<{ categories: GeneratedJeopardyCategory[] }> {
  const response = requireAIResponse(await apiFetch("/api/ai/generate-jeopardy-categories", {
    method: "POST",
    body: JSON.stringify(input),
  }), "категории Jeopardy");
  if (!Array.isArray(response.categories) || response.categories.length !== 5) {
    throw new Error("AI не вернул категории Jeopardy.");
  }
  return {
    categories: response.categories.map((category) => {
      const value = requireAIResponse(category, "категорию Jeopardy");
      return {
        name: requireNonEmptyString(value.name, "category.name"),
        description: requireNonEmptyString(value.description, "category.description"),
      };
    }),
  };
}

export async function generateJeopardyQuestions(input: {
  category: string;
  emptySlots: number[];
  wishes?: string;
}): Promise<{ questions: GeneratedJeopardyQuestion[] }> {
  const response = requireAIResponse(await apiFetch("/api/ai/generate-jeopardy-questions", {
    method: "POST",
    body: JSON.stringify(input),
  }), "вопросы Jeopardy");
  if (!Array.isArray(response.questions) || response.questions.length === 0) {
    throw new Error("AI не вернул вопросы Jeopardy.");
  }
  const seenPoints = new Set<number>();
  const questions = response.questions.map((question) => {
      const value = requireAIResponse(question, "вопрос Jeopardy");
      const points = value.points;
      if (typeof points !== "number" || !Number.isInteger(points) || !input.emptySlots.includes(points) || seenPoints.has(points)) {
        throw new Error("AI вернул некорректную стоимость вопроса Jeopardy.");
      }
      seenPoints.add(points);
      return {
        points,
        difficulty: requireNonEmptyString(value.difficulty, "question.difficulty"),
        q: requireNonEmptyString(value.q, "question.q"),
        a: requireNonEmptyString(value.a, "question.a"),
      };
  });
  if (questions.length !== input.emptySlots.length) {
    throw new Error("AI вернул неполный набор вопросов Jeopardy.");
  }
  return { questions };
}

export const __apiVersion = "2.0.0-rest-ws";

export async function listPlayedGameIdsForUser(): Promise<Set<string>> {
  try {
    const list = await apiFetch(`/api/played-games/me`);
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
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

export async function rateGame(gameId: string, rating: number): Promise<{ ok: boolean }> {
  const r = Math.max(1, Math.min(5, Math.round(rating)));
  try {
    return await apiFetch(`/api/games/${gameId}/rate?rating=${r}`, { method: "POST" });
  } catch {
    return { ok: false };
  }
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

export async function getUserProfile(userId: string): Promise<PublicProfile | null> {
  try {
    const data = await apiFetch(`/api/users/${userId}`);
    if (!data) return null;
    return {
      user: mapUser(data.user),
      games: Array.isArray(data.games?.games) ? data.games.games.map((g: any) => mapGame(g)) : Array.isArray(data.games) ? data.games.map((g: any) => mapGame(g)) : [],
      stats: data.stats ?? { gamesCount: 0, avgRating: 0, totalRatings: 0 },
    };
  } catch {
    return null;
  }
}

export async function getUserGames(userId: string, limit = 20, offset = 0): Promise<{ games: StoredGame[]; total: number; limit: number; offset: number }> {
  try {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    const data = await apiFetch(`/api/users/${userId}/games?${params.toString()}`);
    return {
      games: Array.isArray(data.games) ? data.games.map((g: any) => mapGame(g)) : [],
      total: data.total ?? 0,
      limit: data.limit ?? limit,
      offset: data.offset ?? offset,
    };
  } catch {
    return { games: [], total: 0, limit, offset };
  }
}
