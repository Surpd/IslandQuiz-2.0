// Player-side atoms shared by all three plays: timer bar, back link, chrome shell.
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { PlayerTheme } from "@/lib/types";
import type { ReactNode } from "react";
import { AnimatedBackground } from "./animated-bg";
import { AnimatePresence } from "framer-motion";
import { PlayerStage } from "./player-motion";

export function PlayerShell({
  theme,
  children,
  stageKey,
}: {
  theme: PlayerTheme;
  children: ReactNode;
  stageKey?: string;
}) {
  return (
    <div data-scope="player" className={`relative overflow-x-clip pt-${theme}`}>
      <AnimatedBackground theme={theme} playing={stageKey?.startsWith("question-")} />
      <main className={`player-shell-content relative z-10 ${stageKey ? "player-stage-stack" : ""}`}>
        {stageKey ? <AnimatePresence initial={false}><PlayerStage key={stageKey}>{children}</PlayerStage></AnimatePresence> : children}
      </main>
    </div>
  );
}

export function TimerBar({ pct, urgent }: { pct: number; urgent?: boolean }) {
  return (
    <div
      role="progressbar"
      aria-label="Оставшееся время"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.max(0, Math.min(100, pct)))}
      className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--pt-surface-strong)]"
    >
      <div
        className={`h-full w-full origin-left rounded-full transition-[transform,background-color] ${urgent ? "animate-pulse-soft" : ""}`}
        style={{
          transform: `scaleX(${Math.max(0, Math.min(100, pct)) / 100})`,
          background: urgent ? "var(--danger)" : "var(--pt-accent)",
          transitionDuration: "200ms",
          transitionTimingFunction: "linear",
        }}
      />
    </div>
  );
}

export function BackLink() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-1.5 text-sm text-[color:var(--pt-text-muted)] hover:text-[color:var(--pt-text)]"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      На главную
    </Link>
  );
}
