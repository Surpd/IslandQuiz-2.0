import { useState } from "react";
import { Star } from "lucide-react";

interface Props {
  value: number; // average or myRating for interactive
  count?: number;
  interactive?: boolean;
  onRate?: (n: number) => void;
  size?: number;
  showCount?: boolean;
}

export function RatingStars({ value, count, interactive, onRate, size = 16, showCount = true }: Props) {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  return (
    <div className="inline-flex items-center gap-1">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = display >= n - 0.25;
          const half = !filled && display >= n - 0.75;
          return (
            <button
              key={n}
              type="button"
              disabled={!interactive}
              onMouseEnter={() => interactive && setHover(n)}
              onMouseLeave={() => interactive && setHover(0)}
              onClick={() => interactive && onRate?.(n)}
              className={`transition-transform ${interactive ? "cursor-pointer hover:scale-110" : "cursor-default"}`}
              aria-label={`${n} звёзд`}
              style={{ padding: 1 }}
            >
              <Star
                width={size}
                height={size}
                className={filled ? "fill-amber text-amber" : half ? "fill-amber/40 text-amber" : "text-muted-foreground/40"}
              />
            </button>
          );
        })}
      </div>
      {showCount && (
        <span className="text-xs font-semibold text-muted-foreground">
          {value ? value.toFixed(1) : "—"}
          {count !== undefined && count > 0 && <span className="opacity-70"> ({count})</span>}
        </span>
      )}
    </div>
  );
}
