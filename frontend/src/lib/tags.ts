export const MAX_TAG_LENGTH = 20;
export const MAX_GAME_TAGS = 5;

export function normalizeTag(value: string): string {
  if (/\r|\n/.test(value)) throw new Error("Тег не может содержать перенос строки.");
  if ([...value].some((char) => /\p{Cc}|\p{Cf}/u.test(char) && !/\s/u.test(char))) {
    throw new Error("Тег содержит недопустимые управляющие символы.");
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("Тег не может быть пустым.");
  if (normalized.length > MAX_TAG_LENGTH) {
    throw new Error("Тег не может быть длиннее 20 символов.");
  }
  if ([...normalized].every((char) => !/[\p{L}\p{N}]/u.test(char))) {
    throw new Error("Тег содержит только символы пунктуации.");
  }
  return normalized;
}

export function canonicalTag(value: string): string {
  return normalizeTag(value).toLocaleLowerCase();
}

export function sameTag(left: string, right: string): boolean {
  try {
    return canonicalTag(left) === canonicalTag(right);
  } catch {
    return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
  }
}

export function safeCanonicalTag(value: string): string {
  try {
    return canonicalTag(value);
  } catch {
    return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  }
}

export type TagSuggestion = {
  id?: string;
  name: string;
  canonical_name?: string;
  is_system?: boolean;
  usage_count?: number;
};
