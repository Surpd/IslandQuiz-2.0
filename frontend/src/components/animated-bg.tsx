// Animated backgrounds per player theme. Purely decorative, pointer-events none.
// IMPORTANT: memoized so the per-second timer re-renders in player routes do not
// re-randomize positions and cause the "jittering" effect. Animations are pure CSS.
import { memo } from "react";
import { useReducedMotion } from "framer-motion";
import type { PlayerTheme } from "@/lib/types";
import { SceneRenderer } from "@/theme-engine/scene-renderer";
import { getThemeDefinition } from "@/theme-engine/registry";

// Stable on the server, hydration and remounts; no mutable global RNG.
const sample = (index: number, salt: number) => {
  const value = Math.sin((index + 1) * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

function AnimatedBackgroundImpl({ theme, playing = false }: { theme: PlayerTheme; playing?: boolean }) {
  const reduced = useReducedMotion();
  if (getThemeDefinition(theme)) {
    return <SceneRenderer theme={theme} mode="full" placement="player" eventsEnabled={!playing && !reduced} reducedMotion={!!reduced} />;
  }
  if (theme === "ocean") return <Bubbles />;
  if (theme === "forest") return <Leaves />;
  if (theme === "amber") return <Sparks />;
  if (theme === "classic") return <Shapes />;
  return null;
}


export const AnimatedBackground = memo(AnimatedBackgroundImpl);

function Bubbles() {
  const bubbles = Array.from({ length: 14 });
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {bubbles.map((_, i) => {
        const size = 12 + Math.round(sample(i, 1) * 40);
        const left = Math.round(sample(i, 2) * 100);
        const dur = 12 + sample(i, 3) * 14;
        const delay = -sample(i, 4) * dur;
        return (
          <span
            key={i}
            className="absolute rounded-full border border-[color:var(--pt-accent)]/40 bg-[color:var(--pt-accent)]/10"
            style={{
              width: size,
              height: size,
              left: `${left}%`,
              bottom: `-${size}px`,
              animation: `iq-float-up ${dur}s linear infinite`,
              animationDelay: `${delay}s`,
            }}
          />
        );
      })}
    </div>
  );
}

function Leaves() {
  const leaves = Array.from({ length: 10 });
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {leaves.map((_, i) => {
        const left = Math.round(sample(i, 2) * 100);
        const dur = 14 + sample(i, 3) * 12;
        const delay = -sample(i, 4) * dur;
        const size = 14 + Math.round(sample(i, 1) * 14);
        return (
          <svg
            key={i}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            className="absolute text-[color:var(--pt-accent-2)]/60"
            style={{
              left: `${left}%`,
              top: `-${size}px`,
              animation: `iq-drift-down ${dur}s linear infinite, iq-sway 6s ease-in-out infinite`,
              animationDelay: `${delay}s, ${delay / 2}s`,
            }}
          >
            <path
              fill="currentColor"
              d="M12 2C7 6 4 10 6 16c1 3 4 6 8 6 4 0 6-3 4-8-1-4-4-8-6-12z"
            />
          </svg>
        );
      })}
    </div>
  );
}

function Sparks() {
  const sparks = Array.from({ length: 12 });
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {sparks.map((_, i) => (
        <span
          key={i}
          className="absolute h-1 w-1 rounded-full bg-[color:var(--pt-accent)]"
          style={{
            left: `${sample(i, 2) * 100}%`,
            bottom: `-4px`,
            boxShadow: "0 0 8px var(--pt-accent)",
            animation: `iq-float-up ${8 + sample(i, 3) * 10}s linear infinite`,
            animationDelay: `-${sample(i, 4) * 12}s`,
          }}
        />
      ))}
    </div>
  );
}

function Shapes() {
  const shapes = Array.from({ length: 16 });
  const kinds = ["circle", "square", "triangle"] as const;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {shapes.map((_, i) => {
        const size = 14 + Math.round(sample(i, 1) * 26);
        const left = Math.round(sample(i, 2) * 100);
        const dur = 16 + sample(i, 3) * 14;
        const delay = -sample(i, 4) * dur;
        const kind = kinds[i % kinds.length];
        const common: React.CSSProperties = {
          width: size,
          height: size,
          left: `${left}%`,
          bottom: `-${size}px`,
          animation: `iq-float-up ${dur}s linear infinite, iq-sway 7s ease-in-out infinite`,
          animationDelay: `${delay}s, ${delay / 2}s`,
          opacity: 0.5,
        };
        if (kind === "circle") {
          return (
            <span
              key={i}
              className="absolute rounded-full border-2 border-[color:var(--pt-accent)]/50 bg-[color:var(--pt-accent-2)]/10"
              style={common}
            />
          );
        }
        if (kind === "square") {
          return (
            <span
              key={i}
              className="absolute rotate-12 rounded-md border-2 border-[color:var(--pt-accent-2)]/50 bg-[color:var(--pt-accent)]/10"
              style={common}
            />
          );
        }
        return (
          <svg
            key={i}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            className="absolute text-[color:var(--pt-accent)]/50"
            style={common}
          >
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              d="M12 3 L22 20 L2 20 Z"
            />
          </svg>
        );
      })}
    </div>
  );
}

