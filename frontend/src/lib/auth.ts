// Local user storage for the account system stub.
// All functions run against localStorage; swap this module for real backend later.

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  bio?: string;
  subject?: string;
  createdAt: number;
}


type StoredUser = User & {
  passwordHash?: string;
  // Backward-compatible fallback for any records that may have been written by
  // an older local stub while debugging. New writes always use passwordHash.
  password?: string;
};

const USERS_KEY = "islandquiz.v1.auth.users";
export const SESSION_KEY = "islandquiz.v1.auth.session";

declare global {
  interface Window {
    __islandQuizAuthStoragePatched?: boolean;
  }
}

function getStoredSessionUser(): { id: string; name: string } | null {
  if (typeof window === "undefined") return null;
  const id = localStorage.getItem(SESSION_KEY);
  if (!id) return null;
  try {
    const users = JSON.parse(localStorage.getItem(USERS_KEY) || "[]") as StoredUser[];
    const user = users.find((u) => u.id === id);
    return user ? { id: user.id, name: user.name || user.email || "Пользователь" } : null;
  } catch {
    return null;
  }
}

function isGameStorageKey(key: string): boolean {
  return (
    key.startsWith("islandquiz.v1.quiz.") ||
    key.startsWith("islandquiz.v1.jeopardy.") ||
    key.startsWith("islandquiz.v1.millionaire.")
  );
}

function withCurrentOwner(value: string): string {
  const me = getStoredSessionUser();
  if (!me) return value;
  try {
    const record = JSON.parse(value) as { ownerId?: string; ownerName?: string; visibility?: string };
    if (record && typeof record === "object" && (!record.ownerId || record.ownerId === me.id)) {
      record.ownerId = me.id;
      record.ownerName = me.name;
      record.visibility = record.visibility ?? "private";
      return JSON.stringify(record);
    }
  } catch {
    /* leave non-JSON values untouched */
  }
  return value;
}

function patchLocalStorageForAuthKeys() {
  if (typeof window === "undefined" || window.__islandQuizAuthStoragePatched) return;
  const nativeSetItem = window.localStorage.setItem.bind(window.localStorage);
  const nativeRemoveItem = window.localStorage.removeItem.bind(window.localStorage);

  window.localStorage.setItem = (key: string, value: string) => {
    nativeSetItem(key, isGameStorageKey(key) ? withCurrentOwner(value) : value);
  };
  window.localStorage.removeItem = (key: string) => {
    // storage.cleanupInvalidGames() scans all islandquiz.v1.* keys and would
    // otherwise delete auth records because they are not game-shaped objects.
    if ((key === USERS_KEY || key === SESSION_KEY) && new Error().stack?.includes("cleanupInvalidGames")) return;
    nativeRemoveItem(key);
  };

  window.__islandQuizAuthStoragePatched = true;
}

patchLocalStorageForAuthKeys();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashPassword(email: string, password: string): string {
  let hash = 2166136261;
  const source = `${normalizeEmail(email)}\n${password}`;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `local-v1.${(hash >>> 0).toString(36)}`;
}

function publicUser(u: StoredUser): User {
  const { id, email, name, avatar, bio, subject, createdAt } = u;
  return { id, email, name, avatar, bio, subject, createdAt };
}

export function listAllUsers(): User[] {
  return readUsersRaw().map(publicUser);
}


function readUsersRaw(): StoredUser[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(USERS_KEY) || "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as StoredUser[]) : [];
  } catch {
    return [];
  }
}
function writeUsers(list: StoredUser[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USERS_KEY, JSON.stringify(list));
}

export function getSessionUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SESSION_KEY);
}

export function setSessionUserId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id === null) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, id);
}

export function findUserById(id: string): User | null {
  const user = readUsersRaw().find((u) => u.id === id);
  return user ? publicUser(user) : null;
}

export function findUserByEmail(email: string): User | null {
  const e = normalizeEmail(email);
  const user = readUsersRaw().find((u) => normalizeEmail(u.email) === e);
  return user ? publicUser(user) : null;
}

export function verifyUserCredentials(email: string, password: string): User | null {
  const e = normalizeEmail(email);
  const list = readUsersRaw();
  const idx = list.findIndex((u) => normalizeEmail(u.email) === e);
  if (idx < 0) return null;

  const user = list[idx];
  const expected = hashPassword(e, password);
  const ok = user.passwordHash === expected || user.password === password;
  if (!ok) return null;

  if (user.password || user.passwordHash !== expected) {
    list[idx] = { ...user, email: e, passwordHash: expected };
    delete list[idx].password;
    writeUsers(list);
  }

  return publicUser(list[idx]);
}

export function createUser(input: { email: string; name: string; password?: string }): User {
  const list = readUsersRaw();
  const email = normalizeEmail(input.email);
  const u: StoredUser = {
    id: Math.random().toString(36).slice(2, 10),
    email,
    name: input.name.trim() || email.split("@")[0],
    createdAt: Date.now(),
    passwordHash: input.password ? hashPassword(email, input.password) : undefined,
  };
  list.push(u);
  writeUsers(list);
  return publicUser(u);
}

export function updateUserRecord(id: string, patch: Partial<Omit<User, "id" | "createdAt">>): User | null {
  const list = readUsersRaw();
  const idx = list.findIndex((u) => u.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...patch };
  writeUsers(list);
  return publicUser(list[idx]);
}

export function getCurrentUser(): User | null {
  const id = getSessionUserId();
  return id ? findUserById(id) : null;
}
