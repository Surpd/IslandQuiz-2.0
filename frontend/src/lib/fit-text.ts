// Auto-fit text sizing: picks a tailwind size class based on text length so
// long questions / options shrink to fit fixed-size frames without scrolling.
// Keep the buckets in sync across offline + online players.

export function fitQuestionSize(text: string | undefined | null): string {
  const len = (text ?? "").length;
  if (len > 240) return "text-xs sm:text-sm md:text-base";
  if (len > 160) return "text-sm sm:text-base md:text-lg";
  if (len > 100) return "text-base sm:text-lg md:text-xl";
  if (len > 60) return "text-lg sm:text-xl md:text-2xl";
  return "text-xl sm:text-2xl md:text-3xl";
}

export function fitOptionSize(text: string | undefined | null): string {
  const len = (text ?? "").length;
  if (len > 160) return "text-[11px] sm:text-xs";
  if (len > 100) return "text-xs sm:text-sm";
  if (len > 60) return "text-sm";
  if (len > 30) return "text-sm sm:text-base";
  return "text-base sm:text-lg";
}
