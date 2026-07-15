// Auth context: exposes current user + session mutators.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  register as apiRegister,
  login as apiLogin,
  logout as apiLogout,
  getMe,
  updateProfile as apiUpdateProfile,
  forkGame as apiForkGame,
  setGameVisibility as apiSetGameVisibility,
  rateGame as apiRateGame,
} from "@/lib/api";

import type { User } from "@/lib/auth";

interface AuthValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (patch: { name?: string; avatar?: string; bio?: string; subject?: string }) => Promise<void>;
  forkGame: (gameId: string) => Promise<{ id: string } | null>;
  setGameVisibility: (gameId: string, v: "public" | "private" | "link") => Promise<void>;
  rateGame: (gameId: string, rating: number) => Promise<void>;
  refresh: () => void;
}


const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    getMe().then((u) => setUser(u));
  }, []);

  useEffect(() => {
    getMe()
      .then((u) => setUser(u))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      isLoading,
      async login(email, password) {
        const r = await apiLogin({ email, password });
        if (r.ok) setUser(r.user);
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      async register(name, email, password) {
        const r = await apiRegister({ name, email, password });
        if (r.ok) setUser(r.user);
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      },
      async logout() {
        await apiLogout();
        setUser(null);
      },
      async updateProfile(patch) {
        const u = await apiUpdateProfile(patch);
        if (u) {
          // Set new reference to force re-render even if fields shallow-equal.
          setUser({ ...u });
        } else {
          // Fallback: refetch from storage.
          refresh();
        }
      },
      async forkGame(gameId) {
        return apiForkGame(gameId);
      },
      async setGameVisibility(gameId, v) {
        await apiSetGameVisibility(gameId, v);
      },
      async rateGame(gameId, rating) {
        await apiRateGame(gameId, rating);
      },
      refresh,

    }),
    [user, isLoading, refresh],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
