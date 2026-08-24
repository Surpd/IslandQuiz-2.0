import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { HelpCircle, X } from "lucide-react";

const TOUR_STORAGE = {
  completed: "islandquiz.quiz-builder-tour.completed",
  invitationShown: "islandquiz.quiz-builder-tour.invitation-shown",
  invitationClosed: "islandquiz.quiz-builder-tour.invitation-closed",
  invitationNotNow: "islandquiz.quiz-builder-tour.invitation-not-now",
} as const;

type BuilderTourStep = {
  title: string;
  target: string;
  description: (authenticated: boolean) => ReactNode;
};

const QUIZ_BUILDER_TOUR_STEPS: BuilderTourStep[] = [
  {
    title: "Об игре",
    target: '[data-builder-tour="game-info"]',
    description: (authenticated) =>
      authenticated
        ? "Добавьте название, описание и теги — так игру будет проще найти в библиотеке."
        : "Добавьте название, описание и теги — они помогут оформить тему вашего квиза.",
  },
  {
    title: "Навигация",
    target: '[data-builder-tour="question-navigation"]',
    description: () => "Здесь можно переходить между вопросами и добавлять новые через +.",
  },
  {
    title: "Редактор",
    target: '[data-builder-tour="question-editor"]',
    description: (authenticated) => (
      <>
        Напишите вопрос и ответы, отметьте правильный вариант, настройте баллы и время.
        <span className="mt-2 block">✨ AI-помощник · ƒx Формулы</span>
        {!authenticated && <span className="mt-2 block text-amber-700">AI доступен после входа.</span>}
      </>
    ),
  },
  {
    title: "Типы вопросов",
    target: '[data-builder-tour="question-types"]',
    description: () => "ABCD, Да/Нет, текст, пары, пропуски или порядок — используйте разные типы вопросов в одном квизе.",
  },
  {
    title: "Настройки",
    target: '[data-builder-tour="settings"]',
    description: (authenticated) => (
      <>
        Здесь находятся таймер, порядок вопросов и другие правила игры.
        <span className="mt-2 block">
          {authenticated
            ? "Здесь же можно создавать несколько вариантов одного квиза."
            : "После регистрации можно также создавать несколько вариантов одного квиза."}
        </span>
      </>
    ),
  },
  {
    title: "AI всего квиза",
    target: '[data-builder-tour="full-ai"]',
    description: (authenticated) => (
      <>
        AI может собрать квиз целиком по вашей теме или загруженному материалу.
        {!authenticated && <span className="mt-2 block text-amber-700">Доступно после входа.</span>}
      </>
    ),
  },
  {
    title: "Запуск",
    target: '[data-builder-tour="play"]',
    description: (authenticated) =>
      authenticated
        ? "Выберите оформление и играйте офлайн или создайте онлайн-комнату для участников."
        : "Выберите оформление и запустите квиз офлайн. Войдите, чтобы проводить игры онлайн.",
  },
];

type Rect = { top: number; left: number; width: number; height: number; right: number; bottom: number };

function visibleTarget(selector: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
  }) ?? null;
}

function readStorage(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeStorage(key: string): void {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Private browsing or disabled storage should not block the tour.
  }
}

function snapshotRect(element: HTMLElement): Rect {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

function tooltipPosition(rect: Rect | null, tooltip: HTMLDivElement | null): CSSProperties {
  if (!rect) return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };

  const margin = 12;
  const gap = 14;
  const width = Math.min(360, window.innerWidth - margin * 2);
  const height = tooltip?.getBoundingClientRect().height ?? 190;
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
  const canGoBelow = rect.bottom + gap + height <= window.innerHeight - margin;
  const canGoAbove = rect.top - gap - height >= margin;

  if (canGoBelow || !canGoAbove) {
    return { left, top: Math.min(window.innerHeight - height - margin, rect.bottom + gap), width };
  }
  return { left, top: Math.max(margin, rect.top - gap - height), width };
}

export function BuilderTour({
  open,
  authenticated,
  onOpenChange,
  onStepChange,
  steps = QUIZ_BUILDER_TOUR_STEPS,
}: {
  open: boolean;
  authenticated: boolean;
  onOpenChange: (open: boolean) => void;
  onStepChange?: (step: number | null) => void;
  steps?: BuilderTourStep[];
}) {
  const [invitation, setInvitation] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const step = steps[stepIndex] ?? steps[0];

  useEffect(() => {
    if (readStorage(TOUR_STORAGE.completed) || readStorage(TOUR_STORAGE.invitationShown) || readStorage(TOUR_STORAGE.invitationClosed) || readStorage(TOUR_STORAGE.invitationNotNow)) return;
    writeStorage(TOUR_STORAGE.invitationShown);
    setInvitation(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    onStepChange?.(0);
  }, [open, onStepChange]);

  useEffect(() => {
    if (!open) {
      setTargetRect(null);
      onStepChange?.(null);
      return;
    }

    let frame = 0;
    const target = visibleTarget(step.target);
    if (!target) {
      setTargetRect(null);
      return;
    }

    target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center", inline: "nearest" });
    const update = () => setTargetRect(snapshotRect(target));
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [open, onStepChange, reducedMotion, step.target]);

  const closeTour = useCallback((completed = false) => {
    if (completed) writeStorage(TOUR_STORAGE.completed);
    onOpenChange(false);
    onStepChange?.(null);
  }, [onOpenChange, onStepChange]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeTour();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeTour, open]);

  const next = () => {
    if (stepIndex === steps.length - 1) {
      closeTour(true);
      return;
    }
    const nextIndex = stepIndex + 1;
    setStepIndex(nextIndex);
    onStepChange?.(nextIndex);
  };

  const openTour = () => {
    setInvitation(false);
    onOpenChange(true);
  };

  const invitationAction = (action: "closed" | "not-now") => {
    writeStorage(action === "closed" ? TOUR_STORAGE.invitationClosed : TOUR_STORAGE.invitationNotNow);
    setInvitation(false);
  };

  return (
    <>
      {invitation && !open && (
        <div className="pointer-events-none fixed bottom-24 left-4 z-[85] max-w-[calc(100vw-2rem)] sm:left-6" role="status" aria-labelledby="builder-tour-invitation-title">
          <div className="pointer-events-auto relative w-full max-w-sm rounded-3xl border border-border bg-surface p-5 shadow-lift">
            <button type="button" onClick={() => invitationAction("closed")} className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground hover:bg-surface-muted" aria-label="Закрыть приглашение">
              <X className="h-4 w-4" />
            </button>
            <h2 id="builder-tour-invitation-title" className="pr-8 font-display text-lg font-bold">Впервые здесь?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Быстро покажем, как устроен редактор квиза.</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => invitationAction("not-now")} className="btn-ghost">Не сейчас</button>
              <button type="button" onClick={openTour} className="btn-primary">Показать</button>
            </div>
          </div>
        </div>
      )}

      {open && step && (
        <div className="pointer-events-none fixed inset-0 z-[80]">
          <div className="pointer-events-auto absolute inset-0 bg-transparent" aria-hidden="true" />
          {targetRect && <div className="pointer-events-none fixed rounded-xl border-2 border-primary shadow-[0_0_0_9999px_rgba(15,23,42,0.62)]" style={{ top: targetRect.top - 5, left: targetRect.left - 5, width: targetRect.width + 10, height: targetRect.height + 10 }} />}
          <div ref={tooltipRef} className="pointer-events-auto fixed z-[82] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-border-strong bg-surface p-4 shadow-lift" style={tooltipPosition(targetRect, tooltipRef.current)} role="dialog" aria-modal="true" aria-labelledby="builder-tour-step-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Шаг {stepIndex + 1} из {steps.length}</p>
                <h2 id="builder-tour-step-title" className="mt-1 font-display text-base font-bold">{step.title}</h2>
              </div>
              <button type="button" onClick={() => closeTour()} className="-mr-1 -mt-1 rounded-lg p-1.5 text-muted-foreground hover:bg-surface-muted" aria-label="Закрыть обучение">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 text-sm leading-5 text-muted-foreground">{step.description(authenticated)}</div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <button type="button" onClick={() => { if (stepIndex === 0) closeTour(); else { const previous = stepIndex - 1; setStepIndex(previous); onStepChange?.(previous); } }} className="btn-ghost" aria-label={stepIndex === 0 ? "Закрыть обучение" : "Назад"}>{stepIndex === 0 ? "Закрыть" : "Назад"}</button>
              <button type="button" onClick={next} className="btn-primary">{stepIndex === steps.length - 1 ? "Готово" : "Далее"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function BuilderTourHelpButton({ onClick, mobile = false }: { onClick: () => void; mobile?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Помощь"
      title="Помощь"
      className={mobile ? "grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-surface-muted" : "fixed bottom-6 left-6 z-40 grid h-11 w-11 place-items-center rounded-full border border-border-strong bg-surface text-muted-foreground shadow-lift transition-colors hover:text-primary"}
    >
      <HelpCircle className="h-5 w-5" />
    </button>
  );
}
