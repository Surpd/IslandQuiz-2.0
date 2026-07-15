// Draft autosave for builders. Saves to localStorage with a 3s debounce.
import { useEffect, useRef, useState } from "react";
import type { GameKind } from "@/lib/types";

const NS = "islandquiz.v1";
const draftKey = (kind: GameKind) => `${NS}.draft.${kind}`;

export interface DraftRecord<T> {
  data: T;
  updatedAt: number;
}

export function loadDraft<T>(kind: GameKind): DraftRecord<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(kind));
    if (!raw) return null;
    return JSON.parse(raw) as DraftRecord<T>;
  } catch {
    return null;
  }
}

export function saveDraft<T>(kind: GameKind, data: T) {
  if (typeof window === "undefined") return;
  try {
    const rec: DraftRecord<T> = { data, updatedAt: Date.now() };
    localStorage.setItem(draftKey(kind), JSON.stringify(rec));
  } catch (err) {
    console.warn("Failed to save draft", err);
  }
}

export function clearDraft(kind: GameKind) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(draftKey(kind));
}

/**
 * Auto-save `data` to a per-kind draft slot after `delayMs` of inactivity.
 * Skips saving while `paused` is true (e.g. while restore banner is visible,
 * or before the user has interacted / after a real save).
 */
export function useAutoDraft<T>(kind: GameKind, data: T, opts?: { paused?: boolean; delayMs?: number }) {
  const { paused = false, delayMs = 3000 } = opts ?? {};
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRef = useRef(true);

  useEffect(() => {
    if (paused) return;
    // skip the very first render (initial state hydrate)
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveDraft(kind, data);
    }, delayMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [kind, data, paused, delayMs]);
}

/**
 * Manages the "restore draft?" prompt state. Returns whether a draft was found
 * (only checked once on mount) and helpers to consume it.
 */
export function useDraftPrompt<T>(kind: GameKind, enabled: boolean) {
  const [draft, setDraft] = useState<DraftRecord<T> | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setChecked(true);
      return;
    }
    setDraft(loadDraft<T>(kind));
    setChecked(true);
  }, [kind, enabled]);

  return {
    draft,
    checked,
    dismiss: () => {
      clearDraft(kind);
      setDraft(null);
    },
    accept: () => setDraft(null),
  };
}
