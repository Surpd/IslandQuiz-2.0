import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  FileSpreadsheet,
  Flame,
  Gamepad2,
  Grid3X3,
  Library,
  Palette,
  Play,
  Printer,
  Radio,
  Sigma,
  Sparkles,
  Trophy,
  Users,
  WandSparkles,
} from "lucide-react";
import { LogoMenu } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";

const ease = [0.22, 1, 0.36, 1] as const;

function useDesktopMotion() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return desktop;
}

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: reduced ? 0 : 0.55, ease }}
    >
      {children}
    </motion.div>
  );
}

function QuizDemo() {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(reduced ? 2 : 0);
  useEffect(() => {
    if (reduced) return;
    const timer = window.setTimeout(
      () => setStep((current) => (current + 1) % 3),
      step === 2 ? 2600 : 1100,
    );
    return () => window.clearTimeout(timer);
  }, [step, reduced]);

  const answers = ["Осло", "Рейкьявик", "Хельсинки", "Копенгаген"];
  return (
    <div className="relative rounded-[2rem] border border-white/70 bg-white p-4 shadow-[0_30px_90px_rgba(15,23,42,.16)] sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <i className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <i className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </div>
        <span className="rounded-full bg-primary-soft px-3 py-1 text-[10px] font-black uppercase tracking-[.18em] text-primary">
          live preview
        </span>
      </div>
      <div className="rounded-2xl bg-slate-950 p-5 text-white sm:p-7">
        <div className="flex items-center justify-between text-xs font-bold text-white/55">
          <span>ВОПРОС 3 / 10</span>
          <span>01:24</span>
        </div>
        <h3 className="mt-5 font-display text-xl font-black sm:text-2xl">Столица Исландии?</h3>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {answers.map((answer, index) => {
            const correct = index === 1 && step >= 1;
            return (
              <motion.div
                key={answer}
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, scale: correct ? 1.015 : 1 }}
                transition={{ delay: reduced ? 0 : index * 0.08, duration: 0.3 }}
                className={`flex min-h-12 items-center justify-between rounded-xl border px-4 py-3 text-sm font-bold ${correct ? "border-emerald-400 bg-emerald-400 text-slate-950" : "border-white/10 bg-white/[.06]"}`}
              >
                <span>{answer}</span>
                {correct && <Check className="h-4 w-4" />}
              </motion.div>
            );
          })}
        </div>
        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-rose-400"
            animate={{ scaleX: step >= 2 ? 0.72 : 0.38 }}
            style={{ transformOrigin: "left" }}
            transition={{ duration: reduced ? 0 : 0.6, ease }}
          />
        </div>
      </div>
      <AnimatePresence>
        {step >= 2 && (
          <motion.div
            initial={reduced ? false : { opacity: 0, scale: 0.7, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
            className="absolute -bottom-5 -right-2 rounded-2xl bg-amber-300 px-4 py-3 shadow-xl sm:-right-5"
          >
            <span className="block text-[10px] font-black uppercase tracking-wider text-amber-900/60">
              точный ответ
            </span>
            <span className="font-display text-xl font-black text-slate-950">+300</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HeroProductCluster() {
  const reduced = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const smoothX = useSpring(pointerX, { stiffness: 90, damping: 24, mass: 0.5 });
  const smoothY = useSpring(pointerY, { stiffness: 90, damping: 24, mass: 0.5 });
  const cardX = useTransform(smoothX, (value) => value * 0.65);
  const cardY = useTransform(smoothY, (value) => value * 0.65);
  const nearX = useTransform(smoothX, (value) => value * 1.1);
  const nearY = useTransform(smoothY, (value) => value * 1.1);
  const farX = useTransform(smoothX, (value) => value * 0.35);
  const farY = useTransform(smoothY, (value) => value * 0.35);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduced || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 10);
    pointerY.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 10);
  };

  const resetPointer = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  return (
    <div
      className="relative mx-auto w-full max-w-[650px] px-1 pb-10 pt-8 sm:px-12 sm:pb-14 sm:pt-12 lg:px-10"
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
    >
      <motion.div
        style={reduced ? undefined : { x: cardX, y: cardY }}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduced ? 0 : 0.28, duration: reduced ? 0 : 0.62, ease }}
        className="relative z-20"
      >
        <QuizDemo />
      </motion.div>

      <motion.div
        style={reduced ? undefined : { x: farX, y: farY }}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduced ? 0 : 0.72, duration: reduced ? 0 : 0.42, ease }}
        className="absolute right-1 top-0 z-10 hidden items-center gap-2 rounded-2xl border border-border bg-white/95 px-4 py-3 shadow-soft sm:flex"
      >
        <span className="flex -space-x-2" aria-hidden>
          {["Е", "М", "Л"].map((letter, index) => (
            <i
              key={letter}
              className={`grid h-7 w-7 place-items-center rounded-full border-2 border-white text-[10px] font-black not-italic text-white ${index === 0 ? "bg-primary" : index === 1 ? "bg-accent" : "bg-amber"}`}
            >
              {letter}
            </i>
          ))}
        </span>
        <span>
          <b className="block text-sm">12 игроков</b>
          <small className="block text-[10px] text-muted-foreground">уже в комнате</small>
        </span>
      </motion.div>

      <motion.div
        style={reduced ? undefined : { x: nearX, y: nearY }}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduced ? 0 : 0.88, type: "spring", stiffness: 240, damping: 22 }}
        className="absolute -bottom-1 left-0 z-30 flex items-center gap-3 rounded-2xl border border-amber/20 bg-white px-4 py-3 shadow-lift sm:left-2"
      >
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-soft text-amber">
          <Flame className="h-4 w-4" />
        </span>
        <span>
          <small className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            серия ответов
          </small>
          <b className="font-display text-lg">x4</b>
        </span>
      </motion.div>

      <motion.div
        style={reduced ? undefined : { x: farX, y: farY }}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduced ? 0 : 1, duration: reduced ? 0 : 0.4, ease }}
        className="absolute -right-1 bottom-8 z-30 hidden w-40 rounded-2xl border border-border bg-white p-3 shadow-soft md:block"
      >
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-muted-foreground">
          <span>Раунд</span>
          <Trophy className="h-3.5 w-3.5 text-amber" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-soft text-[10px] font-black text-primary">
            Е
          </span>
          <span className="flex-1 text-xs font-bold">Ева</span>
          <span className="font-mono text-xs font-black">2450</span>
        </div>
      </motion.div>
    </div>
  );
}

const formatCards = [
  {
    title: "Квиз",
    desc: "Ответ, обратная связь и темп — в одном коротком раунде.",
    icon: Gamepad2,
    tone: "teal",
  },
  {
    title: "Своя игра",
    desc: "Открывайте поле по категориям и стоимости вопроса.",
    icon: Grid3X3,
    tone: "rose",
  },
  {
    title: "Миллионер",
    desc: "Двигайтесь по лестнице и используйте подсказки.",
    icon: CircleDollarSign,
    tone: "amber",
  },
] as const;

function FormatPreview({ tone }: { tone: "teal" | "rose" | "amber" }) {
  const [active, setActive] = useState(1);
  if (tone === "rose")
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {[100, 200, 300, 400, 500, 600].map((n, i) => (
          <motion.button
            type="button"
            aria-label={`Открыть вопрос за ${n}`}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setActive(i)}
            key={n}
            className={`rounded-lg py-3 text-xs font-black ${active === i ? "bg-accent text-white" : "bg-accent-soft text-accent"}`}
          >
            {active === i ? "?" : n}
          </motion.button>
        ))}
      </div>
    );
  if (tone === "amber")
    return (
      <div className="space-y-1.5">
        {["15 000", "30 000", "60 000"].map((n, i) => (
          <button
            type="button"
            onClick={() => setActive(i)}
            key={n}
            className={`flex w-full justify-between rounded-lg px-3 py-2 text-xs font-black ${active === i ? "bg-amber text-white" : "bg-amber-soft text-amber-800"}`}
          >
            <span>{i + 8}</span>
            <span>{n}</span>
          </button>
        ))}
      </div>
    );
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {["Тихий", "Индийский", "Северный", "Южный"].map((n, i) => (
        <button
          type="button"
          onClick={() => setActive(i)}
          key={n}
          className={`rounded-lg border px-2 py-2.5 text-left text-[11px] font-bold ${active === i ? "border-primary bg-primary-soft text-primary" : "border-border bg-white"}`}
        >
          {active === i && <Check className="mr-1 inline h-3 w-3" />}
          {n}
        </button>
      ))}
    </div>
  );
}

function Leaderboard() {
  const reduced = useReducedMotion();
  const initial = [
    { name: "Ева", score: 2450, streak: 4 },
    { name: "Марк", score: 2180, streak: 2 },
    { name: "Лиза", score: 1990, streak: 3 },
    { name: "Тим", score: 1720, streak: 1 },
  ];
  const [boost, setBoost] = useState(false);
  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setBoost((v) => !v), 4200);
    return () => window.clearInterval(id);
  }, [reduced]);
  const players = initial
    .map((p) => (p.name === "Лиза" && boost ? { ...p, score: 2590, streak: 5 } : p))
    .sort((a, b) => b.score - a.score);
  return (
    <div className="rounded-[2rem] border border-primary/10 bg-white/90 p-4 shadow-[0_28px_80px_rgba(13,148,136,.14)] backdrop-blur sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary">
          <Radio className="h-4 w-4" /> Комната 4207
        </span>
        <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">
          4 игрока
        </span>
      </div>
      <div className="space-y-2">
        {players.map((p, i) => (
          <motion.div
            layout={!reduced}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            key={p.name}
            className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${i === 0 ? "border-primary/20 bg-primary-soft" : "border-border bg-surface-muted/70"}`}
          >
            <span className="w-5 text-center font-mono text-xs text-muted-foreground">{i + 1}</span>
            <span
              className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${i === 0 ? "bg-primary text-white" : "bg-white text-foreground shadow-sm"}`}
            >
              {p.name[0]}
            </span>
            <span className="flex-1 font-bold text-foreground">{p.name}</span>
            <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-1 text-xs font-bold text-accent">
              <Flame className="h-3.5 w-3.5" />
              {p.streak}
            </span>
            <motion.span
              key={p.score}
              initial={reduced ? false : { scale: 1.18, color: "#0d9488" }}
              animate={{ scale: 1, color: "#0f172a" }}
              className="w-16 text-right font-mono text-sm font-black"
            >
              {p.score}
            </motion.span>
          </motion.div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Лиза отвечает верно и поднимается в рейтинге
      </p>
    </div>
  );
}

function AIDemo() {
  const reduced = useReducedMotion();
  const [generated, setGenerated] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setGenerated((v) => !v), 3600);
    return () => window.clearInterval(id);
  }, [reduced]);
  return (
    <div className="surface-card overflow-hidden p-5 sm:p-7">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
          <Bot className="h-5 w-5" />
        </span>
        <div>
          <p className="font-display font-black">AI-помощник</p>
          <p className="text-xs text-muted-foreground">Тема: Космос</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setGenerated(false)}
        className="mt-5 flex w-full items-center justify-between rounded-xl border border-border bg-surface-muted px-4 py-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span>Создать вопрос</span>
        <WandSparkles className="h-4 w-4 text-primary" />
      </button>
      <div className="mt-4 min-h-44 rounded-2xl bg-slate-950 p-4 text-white">
        <AnimatePresence mode="wait">
          {!generated ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-36 flex-col items-center justify-center gap-3 text-white/60"
            >
              <motion.div
                animate={reduced ? undefined : { rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
              >
                <Sparkles className="h-6 w-6 text-primary" />
              </motion.div>
              <span className="text-xs font-bold">Собираю варианты…</span>
            </motion.div>
          ) : (
            <motion.div
              key="question"
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <p className="text-sm font-black">Какая планета вращается «лёжа на боку»?</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {["Марс", "Уран", "Венера", "Нептун"].map((a, i) => (
                  <motion.div
                    initial={reduced ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07 }}
                    key={a}
                    className={`rounded-lg border p-2 text-xs font-bold ${i === 1 ? "border-emerald-400 bg-emerald-400/20 text-emerald-200" : "border-white/10 bg-white/5"}`}
                  >
                    {a}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function LandingMotion() {
  const { user } = useAuth();
  const reduced = useReducedMotion();
  const desktopMotion = useDesktopMotion();
  const { scrollY } = useScroll();
  const scrollCueOpacity = useTransform(scrollY, [0, 100], [1, 0]);
  const smoothScrollY = useSpring(scrollY, { stiffness: 110, damping: 28, mass: 0.4 });
  const heroPreviewScale = useTransform(smoothScrollY, [180, 900], [1, 0.86]);
  const heroPreviewY = useTransform(smoothScrollY, [180, 900], [0, 92]);
  const heroPreviewOpacity = useTransform(smoothScrollY, [500, 900], [1, 0.18]);
  const formatCardsScale = useTransform(smoothScrollY, [1120, 1700], [1, 0.9]);
  const formatCardsY = useTransform(smoothScrollY, [1120, 1700], [0, 72]);
  const formatCardsOpacity = useTransform(smoothScrollY, [1420, 1700], [1, 0.48]);
  const libraryCardsY = useTransform(smoothScrollY, [1150, 1720], [56, 0]);
  const libraryCardsScale = useTransform(smoothScrollY, [1150, 1720], [0.94, 1]);
  const selectedGameScale = useTransform(smoothScrollY, [1740, 2080], [1, 1.055]);
  const selectedGameY = useTransform(smoothScrollY, [1740, 2080], [0, -14]);
  const launchBadgeOpacity = useTransform(smoothScrollY, [1600, 1900], [0, 1]);
  const roomUiY = useTransform(smoothScrollY, [1700, 2220], [72, 0]);
  const roomUiScale = useTransform(smoothScrollY, [1700, 2220], [0.94, 1]);
  const roomUiOpacity = useTransform(smoothScrollY, [1700, 2100], [0.35, 1]);
  const scrollLinked = desktopMotion && !reduced;
  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6">
          <LogoMenu />
          <nav className="hidden items-center gap-7 md:flex">
            <a
              href="#formats"
              className="text-sm font-bold text-muted-foreground hover:text-primary"
            >
              Форматы
            </a>
            <a href="#rooms" className="text-sm font-bold text-muted-foreground hover:text-primary">
              Онлайн
            </a>
            <a href="#ai" className="text-sm font-bold text-muted-foreground hover:text-primary">
              AI
            </a>
          </nav>
          <Link
            to={user ? "/profile" : "/login"}
            className="rounded-full border border-border bg-white px-4 py-2 text-sm font-black shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            {user ? user.name : "Войти"}
          </Link>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden pb-20 pt-14 sm:pb-24 sm:pt-18 md:flex md:min-h-[calc(100svh-4.5rem)] md:items-center md:pb-16 md:pt-12">
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -left-24 top-0 h-96 w-96 rounded-full bg-primary-soft blur-3xl"
            animate={reduced ? undefined : { x: [0, 18, 0], y: [0, 12, 0], scale: [1, 1.04, 1] }}
            transition={reduced ? undefined : { duration: 18, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -right-28 top-1/4 h-[28rem] w-[28rem] rounded-full bg-accent-soft opacity-70 blur-3xl"
            animate={reduced ? undefined : { x: [0, -16, 0], y: [0, -10, 0], scale: [1, 1.05, 1] }}
            transition={reduced ? undefined : { duration: 22, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-soft opacity-60 blur-3xl"
            animate={reduced ? undefined : { x: [0, 10, 0], y: [0, -8, 0] }}
            transition={reduced ? undefined : { duration: 20, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative mx-auto grid w-full max-w-7xl items-center gap-8 px-6 md:grid-cols-[.9fr_1.1fr] lg:gap-12">
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0 : 0.52, ease }}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary-soft px-4 py-2 text-xs font-black uppercase tracking-[.16em] text-primary">
                <Sparkles className="h-3.5 w-3.5" /> Игры оживают здесь
              </span>
              <motion.h1
                initial={reduced ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduced ? 0 : 0.08, duration: reduced ? 0 : 0.52, ease }}
                className="mt-7 max-w-xl font-display text-5xl font-black leading-[.98] tracking-tight sm:text-6xl lg:text-7xl"
              >
                Создавай викторины, в которые <span className="text-primary">хочется играть</span>
              </motion.h1>
              <motion.p
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduced ? 0 : 0.15, duration: reduced ? 0 : 0.48, ease }}
                className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg"
              >
                Квизы, «Своя игра» и «Миллионер» — с AI-помощником, библиотекой и живыми
                онлайн-комнатами.
              </motion.p>
              <motion.div
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduced ? 0 : 0.22, duration: reduced ? 0 : 0.44, ease }}
                className="mt-9 flex flex-wrap gap-3"
              >
                <Link
                  to="/builder/quiz"
                  search={{ id: undefined }}
                  className="btn-accent inline-flex items-center gap-2"
                >
                  Создать игру <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/library"
                  className="inline-flex items-center gap-2 rounded-2xl border-2 border-border-strong bg-white px-7 py-3.5 font-black transition hover:border-foreground"
                >
                  Открыть библиотеку
                </Link>
              </motion.div>
              <motion.div
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduced ? 0 : 0.3, duration: reduced ? 0 : 0.4 }}
                className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs font-bold text-muted-foreground"
              >
                <span className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-success" /> 3 формата
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-success" /> 2 визуальные темы
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-success" /> Онлайн и офлайн
                </span>
              </motion.div>
            </motion.div>
            <motion.div
              style={
                scrollLinked
                  ? { scale: heroPreviewScale, y: heroPreviewY, opacity: heroPreviewOpacity }
                  : undefined
              }
              className="relative origin-center"
            >
              <HeroProductCluster />
            </motion.div>
          </div>
          <motion.a
            style={{ opacity: reduced ? 1 : scrollCueOpacity }}
            href="#formats"
            className="absolute bottom-3 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-1 text-[10px] font-black uppercase tracking-[.16em] text-muted-foreground lg:flex"
          >
            <span>Посмотреть возможности</span>
            <span className="relative mt-1 h-5 w-px overflow-hidden bg-border-strong">
              <motion.i
                className="absolute left-0 top-0 h-2 w-px bg-primary"
                animate={reduced ? undefined : { y: [-8, 20] }}
                transition={
                  reduced
                    ? undefined
                    : { duration: 1.8, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.8 }
                }
              />
            </span>
          </motion.a>
        </section>

        <section id="formats" className="relative overflow-hidden bg-white py-20 sm:py-28">
          <motion.div
            aria-hidden
            style={scrollLinked ? { opacity: heroPreviewOpacity } : undefined}
            className="pointer-events-none absolute -top-20 right-[12%] hidden h-40 w-64 rounded-[2rem] border border-primary/10 bg-primary-soft blur-2xl md:block"
          />
          <div className="mx-auto max-w-7xl px-6">
            <Reveal className="max-w-2xl">
              <p className="text-xs font-black uppercase tracking-[.2em] text-primary">
                Три игровые механики
              </p>
              <h2 className="mt-3 font-display text-3xl font-black sm:text-5xl">
                Не карточки. Маленькие игры.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Попробуйте каждую механику прямо здесь — без перехода и долгой заставки.
              </p>
            </Reveal>
            <motion.div
              style={
                scrollLinked
                  ? { scale: formatCardsScale, y: formatCardsY, opacity: formatCardsOpacity }
                  : undefined
              }
              className="mt-12 grid origin-center gap-5 md:grid-cols-3"
            >
              {formatCards.map((f, i) => (
                <Reveal key={f.title}>
                  <article className="group h-full rounded-[1.75rem] border border-border bg-background p-6 transition hover:-translate-y-1 hover:shadow-lift">
                    <div className="flex items-center justify-between">
                      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-sm">
                        <f.icon className="h-5 w-5 text-primary" />
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                    </div>
                    <h3 className="mt-6 font-display text-2xl font-black">{f.title}</h3>
                    <p className="mt-2 min-h-12 text-sm leading-relaxed text-muted-foreground">
                      {f.desc}
                    </p>
                    <div className="mt-6 rounded-2xl border border-border bg-white p-3">
                      <FormatPreview tone={f.tone} />
                    </div>
                  </article>
                </Reveal>
              ))}
            </motion.div>
          </div>
          <motion.div
            aria-hidden
            style={scrollLinked ? { opacity: launchBadgeOpacity, y: libraryCardsY } : undefined}
            className="pointer-events-none absolute bottom-5 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-xs font-black text-primary shadow-soft md:flex"
          >
            <Check className="h-3.5 w-3.5" /> Игра сохранена
          </motion.div>
        </section>

        <section className="relative overflow-hidden bg-gradient-to-b from-background to-[#f7fbfb] py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2">
            <Reveal>
              <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-primary">
                <Library className="h-4 w-4" /> Библиотека
              </span>
              <h2 className="mt-4 font-display text-3xl font-black sm:text-5xl">
                Все игры — на своих местах
              </h2>
              <p className="mt-4 max-w-lg text-muted-foreground">
                Ищите по тегам, открывайте карточки и запускайте нужный формат без лишних экранов.
              </p>
              <Link
                to="/library"
                className="mt-7 inline-flex items-center gap-2 font-black text-primary"
              >
                Смотреть библиотеку <ChevronRight className="h-4 w-4" />
              </Link>
            </Reveal>
            <Reveal>
              <motion.div
                style={scrollLinked ? { y: libraryCardsY, scale: libraryCardsScale } : undefined}
                className="grid origin-center grid-cols-2 gap-3"
              >
                {[
                  { t: "Столицы мира", k: "Квиз", c: "bg-primary-soft text-primary" },
                  { t: "Кино 90-х", k: "Своя игра", c: "bg-accent-soft text-accent" },
                  { t: "Большая химия", k: "Миллионер", c: "bg-amber-soft text-amber" },
                  { t: "История искусства", k: "Квиз", c: "bg-success-soft text-success" },
                ].map((x, i) => (
                  <motion.div
                    whileHover={{ y: -4 }}
                    key={x.t}
                    style={
                      scrollLinked && i === 0
                        ? { scale: selectedGameScale, y: selectedGameY }
                        : undefined
                    }
                    className={`surface-card p-4 ${i === 0 ? "col-span-2 sm:col-span-1" : ""}`}
                  >
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${x.c}`}
                    >
                      {x.k}
                    </span>
                    <p className="mt-7 font-display font-black">{x.t}</p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Play className="h-3.5 w-3.5" /> Открыть игру
                    </div>
                    {i === 0 && (
                      <motion.span
                        style={scrollLinked ? { opacity: launchBadgeOpacity } : undefined}
                        className="mt-3 hidden items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-black text-primary md:inline-flex"
                      >
                        <Radio className="h-3 w-3" /> Готово к запуску
                      </motion.span>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            </Reveal>
          </div>
          <motion.div
            aria-hidden
            style={scrollLinked ? { opacity: launchBadgeOpacity } : undefined}
            className="pointer-events-none absolute -bottom-12 left-1/2 hidden h-24 w-px -translate-x-1/2 bg-gradient-to-b from-primary/60 to-transparent md:block"
          />
        </section>

        <section
          id="rooms"
          className="relative overflow-hidden bg-gradient-to-b from-[#f7fbfb] via-[#eef9f8] to-white py-20 text-foreground sm:py-28"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -left-32 top-20 h-96 w-96 rounded-full bg-primary-soft blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-32 bottom-10 h-80 w-80 rounded-full bg-accent-soft opacity-60 blur-3xl"
          />
          <div className="relative mx-auto max-w-7xl px-6">
            <motion.div
              style={
                scrollLinked
                  ? { opacity: launchBadgeOpacity, y: roomUiY, scale: roomUiScale }
                  : undefined
              }
              className="relative z-10 mx-auto mb-7 flex max-w-3xl items-center gap-3 rounded-2xl border border-primary/15 bg-white/95 p-3 shadow-soft backdrop-blur sm:p-4"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <Gamepad2 className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <small className="block text-[10px] font-black uppercase tracking-[.14em] text-primary">
                  Выбранная игра
                </small>
                <b className="block truncate font-display">Столицы мира</b>
              </span>
              <span className="hidden items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-xs font-black text-success sm:inline-flex">
                <Check className="h-3.5 w-3.5" /> Комната запущена
              </span>
              <span className="rounded-full bg-foreground px-3 py-1.5 font-mono text-xs font-black text-white">
                4207
              </span>
            </motion.div>
            <div className="grid items-center gap-12 lg:grid-cols-[1.12fr_.88fr]">
              <motion.div
                style={
                  scrollLinked
                    ? { y: roomUiY, scale: roomUiScale, opacity: roomUiOpacity }
                    : undefined
                }
                className="origin-center"
              >
                <Leaderboard />
              </motion.div>
              <Reveal>
                <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-black uppercase tracking-[.18em] text-primary">
                  <Users className="h-4 w-4" /> Онлайн-комнаты
                </span>
                <h2 className="mt-4 font-display text-3xl font-black sm:text-5xl">
                  Рейтинг меняется вместе с игрой
                </h2>
                <p className="mt-5 max-w-lg leading-relaxed text-muted-foreground">
                  Участники отвечают со своих устройств, получают очки и видят честную динамику
                  раунда. Перестроение помогает считать результат, а не отвлекает от него.
                </p>
                <Link to="/join" className="btn-accent mt-8 inline-flex items-center gap-2">
                  Войти по коду <ArrowRight className="h-4 w-4" />
                </Link>
              </Reveal>
            </div>
          </div>
        </section>

        <section id="ai" className="bg-white py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2">
            <Reveal>
              <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-accent">
                <Sparkles className="h-4 w-4" /> AI-помощник
              </span>
              <h2 className="mt-4 font-display text-3xl font-black sm:text-5xl">
                От темы — к готовому вопросу
              </h2>
              <p className="mt-5 max-w-lg leading-relaxed text-muted-foreground">
                AI помогает придумать вопрос и варианты, а последнее слово остаётся за автором игры.
              </p>
              <Link
                to="/builder/quiz"
                search={{ id: undefined }}
                className="mt-7 inline-flex items-center gap-2 font-black text-accent"
              >
                Попробовать в конструкторе <ChevronRight className="h-4 w-4" />
              </Link>
            </Reveal>
            <Reveal>
              <AIDemo />
            </Reveal>
          </div>
        </section>

        <section id="features" className="py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-6">
            <Reveal>
              <p className="text-xs font-black uppercase tracking-[.2em] text-primary">
                Больше возможностей
              </p>
              <h2 className="mt-3 max-w-2xl font-display text-3xl font-black sm:text-5xl">
                Инструменты для подготовки и проведения
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-4 md:grid-cols-4 md:grid-rows-2">
              {[
                {
                  icon: Palette,
                  title: "2 визуальные темы",
                  text: "Выберите светлую или тёмную атмосферу игрока.",
                  cls: "md:col-span-2 bg-slate-950 text-white",
                },
                {
                  icon: FileSpreadsheet,
                  title: "Excel и CSV",
                  text: "Импортируйте вопросы и экспортируйте игры.",
                  cls: "bg-white",
                },
                {
                  icon: Printer,
                  title: "Печать и PDF",
                  text: "Готовьте раздаточный материал через печать браузера.",
                  cls: "bg-white",
                },
                {
                  icon: Sigma,
                  title: "LaTeX",
                  text: "Формулы рендерятся прямо внутри вопросов.",
                  cls: "bg-white",
                },
                {
                  icon: Trophy,
                  title: "Проектор и офлайн",
                  text: "Проводите игру в аудитории с одного экрана.",
                  cls: "md:col-span-2 bg-primary text-white",
                },
                {
                  icon: Library,
                  title: "Общая библиотека",
                  text: "Храните, находите и запускайте свои игры.",
                  cls: "bg-white",
                },
              ].map((f) => (
                <Reveal
                  key={f.title}
                  className={f.cls.includes("col-span-2") ? "md:col-span-2" : ""}
                >
                  <article className={`h-full rounded-[1.75rem] border border-border p-6 ${f.cls}`}>
                    <f.icon className="h-6 w-6" />
                    <h3 className="mt-10 font-display text-xl font-black">{f.title}</h3>
                    <p
                      className={`mt-2 text-sm leading-relaxed ${f.cls.includes("text-white") ? "text-white/65" : "text-muted-foreground"}`}
                    >
                      {f.text}
                    </p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-6 sm:px-6 sm:pb-8">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-16 text-center text-white sm:px-12 sm:py-24">
            <motion.div
              aria-hidden
              className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/30 blur-3xl"
              animate={reduced ? undefined : { scale: [1, 1.14, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={reduced ? undefined : { duration: 7, repeat: Infinity }}
            />
            <div className="relative">
              <Sparkles className="mx-auto h-7 w-7 text-amber-300" />
              <h2 className="mx-auto mt-5 max-w-3xl font-display text-4xl font-black sm:text-6xl">
                Следующая хорошая игра начинается с вопроса
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-white/60">
                Соберите свой квиз, пригласите участников и проведите раунд по-своему.
              </p>
              <Link
                to="/builder/quiz"
                search={{ id: undefined }}
                className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-accent px-7 py-4 font-black shadow-accent transition hover:-translate-y-0.5"
              >
                Начать бесплатно <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="py-8 text-center text-xs text-muted-foreground">
        Экспериментальная motion-версия IslandQuiz · не добавлена в навигацию
      </footer>
    </div>
  );
}
