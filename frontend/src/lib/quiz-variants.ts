import type { QuizData, QuizQuestion, QuizVariant } from "./types";

export const PRIMARY_VARIANT_ID = "variant-1";
export const MAX_QUIZ_VARIANTS = 4;

export interface ResolvedQuizVariant {
  id: string;
  name: string;
  questions: QuizQuestion[];
  primary: boolean;
}

export function quizVariants(data: QuizData): ResolvedQuizVariant[] {
  const extras = Array.isArray(data.variants)
    ? data.variants.filter((variant): variant is QuizVariant => !!variant && typeof variant.id === "string" && Array.isArray(variant.questions))
    : [];
  return [
    { id: PRIMARY_VARIANT_ID, name: "Вариант 1", questions: Array.isArray(data.questions) ? data.questions : [], primary: true },
    ...extras.slice(0, MAX_QUIZ_VARIANTS - 1).map((variant, index) => ({
      id: variant.id,
      name: variant.name?.trim() || `Вариант ${index + 2}`,
      questions: variant.questions,
      primary: false,
    })),
  ];
}

export function selectQuizVariant(data: QuizData, variantId?: string): ResolvedQuizVariant {
  const variants = quizVariants(data);
  return variants.find((variant) => variant.id === variantId) ?? variants[0];
}

export function withSelectedQuizVariant(data: QuizData, variantId?: string): QuizData {
  const selected = selectQuizVariant(data, variantId);
  return { ...data, questions: selected.questions };
}

export function additionalQuizVariants(variants: ResolvedQuizVariant[]): QuizVariant[] | undefined {
  const extras = variants.slice(1).map(({ id, name, questions }) => ({ id, name, questions }));
  return extras.length ? extras : undefined;
}
