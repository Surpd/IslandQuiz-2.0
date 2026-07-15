// Animated backgrounds per player theme. Purely decorative, pointer-events none.
// IMPORTANT: memoized so the per-second timer re-renders in player routes do not
// re-randomize positions and cause the "jittering" effect. Animations are pure CSS.
import { memo } from "react";
import type { PlayerTheme } from "@/lib/types";

function AnimatedBackgroundImpl({ theme }: { theme: PlayerTheme }) {
  if (theme === "ocean") return <Bubbles />;
  if (theme === "forest") return <Leaves />;
  if (theme === "midnight") return <Stars />;
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
        const size = 12 + Math.round(Math.random() * 40);
        const left = Math.round(Math.random() * 100);
        const dur = 12 + Math.random() * 14;
        const delay = -Math.random() * dur;
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
        const left = Math.round(Math.random() * 100);
        const dur = 14 + Math.random() * 12;
        const delay = -Math.random() * dur;
        const size = 14 + Math.round(Math.random() * 14);
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

function Stars() {
  const stars = Array.from({ length: 40 });
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {stars.map((_, i) => {
        const size = 1 + Math.random() * 2;
        return (
          <span
            key={i}
            className="absolute rounded-full bg-[color:var(--pt-accent-2)]"
            style={{
              width: size,
              height: size,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: 0.3 + Math.random() * 0.7,
              animation: `iq-twinkle ${2 + Math.random() * 4}s ease-in-out infinite`,
              animationDelay: `-${Math.random() * 6}s`,
            }}
          />
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
            left: `${Math.random() * 100}%`,
            bottom: `-4px`,
            boxShadow: "0 0 8px var(--pt-accent)",
            animation: `iq-float-up ${8 + Math.random() * 10}s linear infinite`,
            animationDelay: `-${Math.random() * 12}s`,
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
        const size = 14 + Math.round(Math.random() * 26);
        const left = Math.round(Math.random() * 100);
        const dur = 16 + Math.random() * 14;
        const delay = -Math.random() * dur;
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

