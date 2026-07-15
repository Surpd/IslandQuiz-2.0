// localStorage-backed persistence for IslandQuiz.
// Designed so a future Lovable Cloud swap only replaces this module.

import type { GameKind, StoredGame } from "./types";

const NS = "islandquiz.v1";
const key = (kind: GameKind, id: string) => `${NS}.${kind}.${id}`;

export function newId(): string {
  // 8-char base36, human-friendly for share URLs
  return Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);
}

export function saveGame<T>(
  kind: GameKind,
  id: string,
  data: T,
  meta?: Partial<Omit<StoredGame, "id" | "kind" | "data" | "updatedAt">>,
): StoredGame<T> {
  const existing = loadGame<T>(kind, id);
  const record: StoredGame<T> = {
    ...(existing ?? {}),
    id,
    kind,
    data,
    updatedAt: Date.now(),
    ...(meta ?? {}),
  };
  if (typeof window === "undefined") return record;
  try {
    localStorage.setItem(key(kind, id), JSON.stringify(record));
    cleanupInvalidGames();
  } catch (err) {
    console.error("Failed to save game", err);
  }
  return record;
}

export function loadGame<T>(kind: GameKind, id: string): StoredGame<T> | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(key(kind, id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredGame<T>;
  } catch {
    return null;
  }
}

export function deleteGame(kind: GameKind, id: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key(kind, id));
}

export function listGames(kind?: GameKind): StoredGame[] {
  if (typeof window === "undefined") return [];
  const out: StoredGame[] = [];
  const prefix = kind ? `${NS}.${kind}.` : `${NS}.`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) {
      try {
        const rec = JSON.parse(localStorage.getItem(k)!) as StoredGame;
        if (isValidGame(rec)) out.push(rec);
      } catch {
        /* skip */
      }
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function isValidGame(rec: unknown): rec is StoredGame {
  if (!rec || typeof rec !== "object") return false;
  const r = rec as { kind?: unknown; data?: { config?: unknown } };
  // Ignore non-game records (e.g. result keys) — only quiz/jeopardy/millionaire are games
  if (r.kind !== "quiz" && r.kind !== "jeopardy" && r.kind !== "millionaire") return false;
  if (!r.data || typeof r.data !== "object") return false;
  if (!r.data.config) return false;
  return true;
}

export function cleanupInvalidGames(): number {
  if (typeof window === "undefined") return 0;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(`${NS}.`)) continue;
    // Never touch result keys
    if (k.startsWith(`${NS}.results.`)) continue;
    if (k.startsWith(`${NS}.jresults.`)) continue;
    if (k.startsWith(`${NS}.online-results.`)) continue;
    if (k.startsWith(`${NS}.millionaire-results.`)) continue;
    if (k.startsWith(`${NS}.auth.`)) continue;
    if (k.startsWith(`${NS}.draft.`)) continue;
    try {
      const rec = JSON.parse(localStorage.getItem(k)!);
      if (!isValidGame(rec)) toRemove.push(k);
    } catch {
      toRemove.push(k);
    }
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
  return toRemove.length;
}
