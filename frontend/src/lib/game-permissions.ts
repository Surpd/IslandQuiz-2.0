import type { StoredGame } from "./types";

export type GamePermissionConfig = {
  showAnswers?: boolean;
  allowPreview?: boolean;
  allowCopy?: boolean;
};

export function gamePermissionConfig(game: StoredGame): GamePermissionConfig {
  const data = game.data as { config?: GamePermissionConfig } | undefined;
  return data?.config ?? {};
}

export function allowsGamePreview(game: StoredGame, privileged = false): boolean {
  return privileged || gamePermissionConfig(game).allowPreview !== false;
}

export function allowsGameCopy(game: StoredGame, privileged = false): boolean {
  return privileged || gamePermissionConfig(game).allowCopy !== false;
}
