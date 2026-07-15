// Shared game data models. Kept close to the Python pydantic shapes from
// user-uploads/models.py so a future backend swap is painless.

export type PlayerTheme = "amber" | "midnight" | "classic" | "ocean" | "forest";

export const PLAYER_THEMES: { id: PlayerTheme; name: string; hint: string }[] = [
  { id: "amber", name: "Amber Gold", hint: "Тёплое, уютное" },
  { id: "midnight", name: "Midnight", hint: "Сфокусированное ночное" },
  { id: "classic", name: "Classic Blue", hint: "Строгая классика" },
  { id: "ocean", name: "Ocean Deep", hint: "Глубокое морское" },
  { id: "forest", name: "Forest", hint: "Природное зелёное" },
];

// ---------- Quiz ----------
export type QuizQuestionType = "choice" | "bool" | "text" | "matching" | "close" | "ordering";

export interface QuizPair {
  left: string;
  right: string;
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
  points: number;
  time: number;
}

export interface QuizConfig {
  title: string;
  description: string;
  theme: PlayerTheme;
  shuffleQuestions: boolean;
  showResult: "each" | "end";
  defaultTime: number;
  orderMode: "sequential" | "free";
  totalTime: number; // minutes when free
}

export interface QuizData {
  config: QuizConfig;
  questions: QuizQuestion[];
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
  theme: PlayerTheme;
  timeBase: number;
  timeStep: number;
  timeFinal: number;
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
  theme: PlayerTheme;
  timePerQuestion: number;
  moneyScale: MoneyScale;
  milestones: MilestoneMode;
  pointsMode?: PointsMode;
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

