// Reusable character-count indicator (TZ v2.0 §5).
// Renders "current/max"; turns red and bold when reaching the limit.

export function CharCounter({
  value,
  max,
  className = "",
}: {
  value: string;
  max: number;
  className?: string;
}) {
  const len = value.length;
  const over = len >= max;
  return (
    <span
      className={`text-[10px] tabular-nums ${
        over ? "font-bold text-danger" : "text-muted-foreground"
      } ${className}`}
      aria-live="polite"
    >
      {len}/{max}
    </span>
  );
}
