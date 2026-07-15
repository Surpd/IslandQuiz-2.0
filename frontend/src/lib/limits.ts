// Field length limits (TZ v2.0 §5)
export const LIMITS = {
  title: 100,
  question: 500,
  option: 200,
  category: 60,
  nickname: 24,
  jeopardyCategoriesPerRound: 6,
  jeopardyQuestionsPerCategory: 5,
} as const;

export function counter(value: string, max: number): string {
  return `${value.length}/${max}`;
}
