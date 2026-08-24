// Shared game data models. Kept close to the Python pydantic shapes from
// user-uploads/models.py so a future backend swap is painless.

export type PlayerTheme = "amber" | "midnight" | "classic" | "ocean" | "forest";

export const PLAYER_THEMES: { id: PlayerTheme; name: string; hint: string }[] = [
  { id: "classic", name: "Classic", hint: "Мягкая светлая классика" },
  { id: "amber", name: "Amber", hint: "Тёплое, уютное" },
  { id: "ocean", name: "Ocean", hint: "Глубокое морское" },
  { id: "forest", name: "Forest", hint: "Природное зелёное" },
  { id: "midnight", name: "Night Sky", hint: "Живой ночной мир" },
];

export function isPlayerTheme(value: unknown): value is PlayerTheme {
  return PLAYER_THEMES.some((theme) => theme.id === value);
}

export function normalizePlayerTheme(value: unknown): PlayerTheme | undefined {
  if (value === "color-cloud") return "classic";
  return isPlayerTheme(value) ? value : undefined;
}

// ---------- Quiz ----------
export type QuizQuestionType = "choice" | "bool" | "text" | "matching" | "close" | "ordering";

export interface QuizPair {
  left: string;
  right: string;
}

/** Optional non-answer content for previews and future editors. Legacy games derive this safely from answer. */
export interface QuizQuestionDisplay {
  matching?: {
    left: string[];
    right: string[];
  };
  ordering?: string[];
}

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  q: string;
  image?: string;
  // choice: string[] of options; matching: unused (pairs used); text/bool: unused
  options: string[];
  // choice: correct option text; bool: "true"|"false"; text: acceptable answers (comma-separated); matching: JSON of QuizPair[]
  answer: string;
  /** Optional display-only content; never used for scoring or answer checks. */
  display?: QuizQuestionDisplay;
  points: number;
  time: number;
  difficulty?: "easy" | "medium" | "hard";
}

export interface QuizVariant {
  id: string;
  name: string;
  questions: QuizQuestion[];
}

export interface QuizConfig {
  title: string;
  description: string;
  shuffleQuestions: boolean;
  showResult: "each" | "end";
  defaultTime: number;
  orderMode: "sequential" | "free";
  totalTime: number; // minutes when free
  showAnswers?: boolean;
  allowPreview?: boolean;
  allowCopy?: boolean;
}

export interface QuizData {
  config: QuizConfig;
  questions: QuizQuestion[];
  /** Additional variants only. The root questions remain Variant 1 for legacy compatibility. */
  variants?: QuizVariant[];
}

// ---------- Jeopardy ----------
export interface JeopardyQuestion {
  points: number;
  q: string;
  a: string;
  image?: string;
}

export interface JeopardyCategory {
  category: string;
  questions: JeopardyQuestion[];
}

export interface JeopardyFinal {
  category: string;
  q: string;
  a: string;
  image?: string;
}

export interface JeopardyConfig {
  title?: string;
  roundTitles?: string[];
  timeBase: number;
  timeStep: number;
  timeFinal: number;
  showAnswers?: boolean;
  allowPreview?: boolean;
  allowCopy?: boolean;
}

export interface JeopardyData {
  config: JeopardyConfig;
  rounds: JeopardyCategory[][];
  final: JeopardyFinal;
}

// ---------- Millionaire ----------
export interface MillionaireOption {
  text: string;
  correct: boolean;
}

export interface MillionaireQuestion {
  q: string;
  image?: string;
  options: MillionaireOption[];
  money: number;
}

export type MoneyScale = "easy" | "normal" | "hard";
export type MilestoneMode = "classic" | "three" | "none";
export type PointsMode = "classic" | "double" | "custom";

export interface MillionaireConfig {
  title?: string;
  timePerQuestion: number;
  moneyScale: MoneyScale;
  milestones: MilestoneMode;
  pointsMode?: PointsMode;
  showAnswers?: boolean;
  allowPreview?: boolean;
  allowCopy?: boolean;
}

export interface MillionaireData {
  config: MillionaireConfig;
  questions: MillionaireQuestion[];
}

// ---------- Storage envelope ----------
export type GameKind = "quiz" | "jeopardy" | "millionaire";

export type GameVisibility = "public" | "private" | "link";

export interface StoredGame<T = unknown> {
  id: string;
  kind: GameKind;
  updatedAt: number;
  data: T;
  ownerId?: string;
  ownerName?: string;
  visibility?: GameVisibility;
  forkedFrom?: string;
  forkedOwnerName?: string;
  tags?: string[];
  ratings?: Record<string, number>;
  playCount?: number;
  showAnswers?: boolean;
}
