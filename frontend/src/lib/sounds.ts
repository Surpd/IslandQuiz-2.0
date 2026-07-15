// Tiny Web Audio helpers for the online player.
// All sounds are short and quiet; user can mute via toggleMute().

const MUTE_KEY = "islandquiz.sound.muted";

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  try {
    const AC = (window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext);
    if (!AC) return null;
    ctx = new AC();
  } catch {
    return null;
  }
  return ctx;
}

export function isMuted(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}
export function setMuted(v: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch { /* ignore */ }
}
export function toggleMute(): boolean {
  const next = !isMuted();
  setMuted(next);
  return next;
}

type Note = { freq: number; start: number; dur: number; type?: OscillatorType; gain?: number };
function playNotes(notes: Note[]) {
  if (isMuted()) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const now = c.currentTime;
  const master = c.createGain();
  master.gain.value = 0.18;
  master.connect(c.destination);
  notes.forEach((n) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = n.type ?? "sine";
    osc.frequency.value = n.freq;
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(n.gain ?? 0.6, now + n.start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
    osc.connect(g).connect(master);
    osc.start(now + n.start);
    osc.stop(now + n.start + n.dur + 0.02);
  });
}

export const sfx = {
  click: () => playNotes([{ freq: 520, start: 0, dur: 0.06, type: "triangle", gain: 0.4 }]),
  correct: () =>
    playNotes([
      { freq: 523.25, start: 0.0, dur: 0.18 }, // C
      { freq: 659.25, start: 0.09, dur: 0.18 }, // E
      { freq: 783.99, start: 0.18, dur: 0.28 }, // G
    ]),
  wrong: () =>
    playNotes([
      { freq: 200, start: 0.0, dur: 0.22, type: "square", gain: 0.35 },
      { freq: 150, start: 0.08, dur: 0.28, type: "square", gain: 0.3 },
    ]),
  whoosh: () =>
    playNotes([
      { freq: 220, start: 0, dur: 0.25, type: "sawtooth", gain: 0.15 },
      { freq: 440, start: 0.05, dur: 0.2, type: "sawtooth", gain: 0.12 },
    ]),
  tick: () => playNotes([{ freq: 880, start: 0, dur: 0.04, type: "triangle", gain: 0.15 }]),
  fanfare: () =>
    playNotes([
      { freq: 523.25, start: 0.0, dur: 0.18 },
      { freq: 659.25, start: 0.15, dur: 0.18 },
      { freq: 783.99, start: 0.3, dur: 0.18 },
      { freq: 1046.5, start: 0.45, dur: 0.45 },
      { freq: 783.99, start: 0.55, dur: 0.35, gain: 0.4 },
    ]),
};
