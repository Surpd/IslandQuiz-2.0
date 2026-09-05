import { animate, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

export const playerMotion = {
  press: 0.1,
  feedback: 0.18,
  stage: 0.26,
  reward: 0.42,
  ease: [0.22, 1, 0.36, 1] as const,
};

/** Exiting content is decorative: new server state is interactive immediately. */
export function PlayerStage({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  const reduced = useReducedMotion();
  return <motion.div
    className="player-stage"
    inert={!present}
    aria-hidden={!present || undefined}
    initial={reduced ? false : { opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: reduced ? 0 : -8 }}
    transition={{ duration: reduced ? 0 : playerMotion.stage, ease: playerMotion.ease }}
    style={!present ? { pointerEvents: "none", gridArea: "1 / 1", alignSelf: "start" } : { gridArea: "1 / 1", minWidth: 0 }}
  >{children}</motion.div>;
}

export function PlayerScore({ value, className = "" }: { value: number; className?: string }) {
  const reduced = useReducedMotion();
  const previous = useRef(value);
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (reduced || from === value) { setDisplay(value); return; }
    const animation = animate(from, value, {
      duration: playerMotion.reward,
      ease: playerMotion.ease,
      onUpdate: (next) => setDisplay(Math.round(next)),
    });
    return () => animation.stop();
  }, [value, reduced]);
  return <span className={`player-score tabular-nums ${className}`} aria-label={`${value.toLocaleString("ru-RU")} очков`}>
    <span aria-hidden="true">{display.toLocaleString("ru-RU")}</span>
  </span>;
}
