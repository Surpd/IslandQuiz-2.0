// Jeopardy game result persistence (localStorage stub).
// Only api.ts should import this — see src/lib/api.ts.

export interface JeopardyTeamResult {
  id: string;
  name: string;
  score: number;
  correct: number;
  wrong: number;
  finalBet?: number;
  finalCorrect?: boolean;
}

export interface JeopardyResult {
  id: string;
  gameId: string;
  playedAt: number;
  teams: JeopardyTeamResult[];
  winnerId: string | null;
  hasFinal: boolean;
  userId?: string;
  avatar?: string;
}

const NS = "islandquiz.v1.jresults";
const key = (gameId: string) => `${NS}.${gameId}`;

function currentSessionUserId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem("islandquiz.v1.auth.session") ?? undefined;
}

export function saveJeopardyResult(r: Omit<JeopardyResult, "id" | "playedAt">): JeopardyResult {
  const rec: JeopardyResult = {
    ...r,
    userId: r.userId ?? currentSessionUserId(),
    id: Math.random().toString(36).slice(2, 10),
    playedAt: Date.now(),
  };
  if (typeof window === "undefined") return rec;
  try {
    const list = loadJeopardyResults(r.gameId);
    list.push(rec);
    localStorage.setItem(key(r.gameId), JSON.stringify(list));
  } catch (err) {
    console.error("Failed to save jeopardy result", err);
  }
  return rec;
}

export function loadJeopardyResults(gameId: string): JeopardyResult[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(key(gameId));
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as JeopardyResult[];
    return arr.sort((a, b) => b.playedAt - a.playedAt);
  } catch {
    return [];
  }
}
