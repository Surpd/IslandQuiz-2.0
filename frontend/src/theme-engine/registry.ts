import type { PlayerTheme } from "@/lib/types";
import type { ThemeDefinition } from "@/theme-engine/types";

const themeModules = import.meta.glob("./themes/**/theme.ts", {
  eager: true,
  import: "default",
}) as Record<string, ThemeDefinition>;

const THEMES = Object.values(themeModules).reduce<Record<string, ThemeDefinition>>(
  (themes, theme) => {
    themes[theme.id] = theme;
    return themes;
  },
  {},
);

export function getThemeDefinition(theme: PlayerTheme): ThemeDefinition | null {
  return THEMES[theme] ?? null;
}
