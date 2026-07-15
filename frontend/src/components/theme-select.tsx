import { PLAYER_THEMES, type PlayerTheme } from "@/lib/types";

const SWATCHES: Record<PlayerTheme, string[]> = {
  amber: ["#1a0f04", "#ff9d00", "#e8c547"],
  midnight: ["#0a0a1e", "#a78bfa", "#7c9cff"],
  classic: ["#0c1e3a", "#3b82f6", "#60a5fa"],
  ocean: ["#051f2e", "#14b8a6", "#5eead4"],
  forest: ["#0d1f14", "#84cc16", "#bef264"],
};

export function ThemeSelect({
  value,
  onChange,
}: {
  value: PlayerTheme;
  onChange: (theme: PlayerTheme) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {PLAYER_THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`flex items-center gap-2 rounded-xl border-2 p-2 text-left transition-all ${
            value === t.id
              ? "border-primary bg-primary-soft"
              : "border-border bg-surface hover:border-border-strong"
          }`}
        >
          <div className="flex -space-x-1">
            {SWATCHES[t.id].map((c, i) => (
              <div
                key={i}
                className="h-6 w-6 rounded-full border-2 border-white"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold">{t.name}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
