import { useEffect, useState } from "react";
import type {
  ThemeDefinition,
  ThemeEventDefinition,
  ThemeEventId,
  ThemeMode,
  ThemePlacement,
} from "@/theme-engine/types";

export function EventManager({
  definition,
  mode,
  placement,
  eventsEnabled,
  reducedMotion: reducedMotionOverride,
  forcedEvent,
  forceEventKey = 0,
  onActiveEventChange,
}: {
  definition: ThemeDefinition;
  mode: ThemeMode;
  placement: ThemePlacement;
  eventsEnabled?: boolean;
  reducedMotion?: boolean;
  forcedEvent?: ThemeEventId | null;
  forceEventKey?: number;
  onActiveEventChange?: (eventId: ThemeEventId | null) => void;
}) {
  const [activeEvent, setActiveEvent] = useState<ThemeEventDefinition | null>(null);

  useEffect(() => {
    const shouldScheduleEvents =
      eventsEnabled ?? (mode === "full" && definition.player.events && placement === "player");

    if (forcedEvent) {
      const event = (definition.manualEvents ?? definition.events).find(
        (candidate) => candidate.id === forcedEvent,
      );
      if (!event) {
        setActiveEvent(null);
        return;
      }

      setActiveEvent(event);
      const clearTimer = window.setTimeout(() => setActiveEvent(null), event.durationMs);
      return () => window.clearTimeout(clearTimer);
    }

    if (!shouldScheduleEvents) {
      setActiveEvent(null);
      return;
    }

    const reducedMotion =
      reducedMotionOverride ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (reducedMotion) {
      setActiveEvent(null);
      return;
    }

    let disposed = false;
    let nextTimer: number | undefined;
    let clearTimer: number | undefined;
    const events = definition.events.filter((event) => !isMobile || event.mobile !== false);

    const schedule = () => {
      if (disposed || events.length === 0) return;
      const event = events[Math.floor(Math.random() * events.length)];
      const delay = event.minDelayMs + Math.random() * (event.maxDelayMs - event.minDelayMs);
      nextTimer = window.setTimeout(() => {
        if (disposed) return;
        setActiveEvent(event);
        clearTimer = window.setTimeout(() => {
          setActiveEvent(null);
          schedule();
        }, event.durationMs);
      }, delay);
    };

    schedule();
    return () => {
      disposed = true;
      if (nextTimer !== undefined) window.clearTimeout(nextTimer);
      if (clearTimer !== undefined) window.clearTimeout(clearTimer);
    };
  }, [
    definition,
    mode,
    placement,
    eventsEnabled,
    reducedMotionOverride,
    forcedEvent,
    forceEventKey,
  ]);

  useEffect(() => {
    onActiveEventChange?.(activeEvent?.id ?? null);
  }, [activeEvent, onActiveEventChange]);

  if (!activeEvent) return null;

  return <ThemeEvent event={activeEvent} />;
}

function ThemeEvent({ event }: { event: ThemeEventDefinition }) {
  if (event.id === "shooting-star") {
    return (
      <img
        className="theme-event theme-event--shooting-star"
        src="/assets/night-sky/vectors/shooting-star.svg"
        alt=""
      />
    );
  }
  if (event.id === "satellite") {
    return (
      <img
        className="theme-event theme-event--satellite"
        src="/assets/night-sky/vectors/satellite.svg"
        alt=""
      />
    );
  }
  if (event.id === "aurora-pulse") {
    return <span className="theme-event theme-event--aurora-pulse" />;
  }
  return <span className="theme-event theme-event--moon-glow-boost" />;
}
