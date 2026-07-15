// Colored-letter avatar with optional image / custom color override.
// user.avatar can encode:
//   - "" / undefined → derive color from name
//   - "color:#rrggbb" → use that color, letter from name
//   - "data:image/..." or "http(s)://..." → render image

export const AVATAR_COLORS = [
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#d946ef",
  "#ec4899",
  "#0ea5e9",
];

export function avatarColor(seed: string): string {
  let h = 0;
  const s = seed || "?";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function parseAvatar(avatar?: string): { image?: string; color?: string } {
  if (!avatar) return {};
  if (avatar.startsWith("color:")) return { color: avatar.slice(6) };
  if (avatar.startsWith("data:") || avatar.startsWith("http")) return { image: avatar };
  return {};
}

export function Avatar({
  name,
  avatar,
  size = 32,
  className = "",
}: {
  name: string;
  avatar?: string;
  size?: number;
  className?: string;
}) {
  const parsed = parseAvatar(avatar);
  if (parsed.image) {
    return (
      <img
        src={parsed.image}
        alt=""
        className={`inline-block rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }
  const bg = parsed.color || avatarColor(name);
  const letter = (name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={`inline-grid place-items-center rounded-full font-bold text-white leading-none ${className}`}
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: Math.round(size * 0.45),
      }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}
