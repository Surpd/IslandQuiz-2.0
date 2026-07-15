import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FileText,
  Grid3x3,
  Coins,
  Palette,
  FileSpreadsheet,
  Printer,
  Sigma,
  Library as LibraryIcon,
  Radio,
  ArrowRight,
  Flame,
  Sparkles,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { LogoMenu } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IslandQuiz — конструктор квизов и викторин" },
      {
        name: "description",
        content:
          "Создавайте квизы, свою игру и миллионера. AI-помощник, онлайн-комнаты, библиотека, шаринг, пять тем, экспорт в Excel и LaTeX-формулы.",
      },
    ],
  }),
  component: Home,
});

const formats = [
  {
    href: "/builder/quiz",
    icon: FileText,
    title: "Квиз",
    tone: "primary" as const,
    desc: "Гибкий формат с ABCD, Да/Нет, открытым ответом и сопоставлением. Идеально для тестов и уроков.",
  },
  {
    href: "/builder/jeopardy",
    icon: Grid3x3,
    title: "Своя игра",
    tone: "accent" as const,
    desc: "Классическое поле с категориями и раундами. Команды, ставки в финале и подсчёт очков — всё встроено.",
  },
  {
    href: "/builder/millionaire",
    icon: Coins,
    title: "Миллионер",
    tone: "amber" as const,
    desc: "Лестница вопросов с несгораемыми суммами и подсказкой 50:50. Атмосфера настоящего шоу.",
  },
];

const features = [
  {
    icon: Palette,
    title: "5 визуальных тем",
    desc: "Amber, Midnight, Classic, Ocean, Forest. Атмосфера меняется одним кликом.",
  },
  {
    icon: FileSpreadsheet,
    title: "Excel и CSV",
    desc: "Экспорт готовых игр в .xlsx и импорт вопросов из CSV-шаблона.",
  },
  { icon: Printer, title: "Печать и PDF", desc: "Раздаточный материал в один клик через встроенную печать браузера." },
  { icon: Sigma, title: "LaTeX-формулы", desc: "Пишите \\(x^2\\) прямо в вопросе — рендерится через KaTeX." },
];

function Home() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-3 px-6">
          <LogoMenu />
          <nav className="hidden gap-8 md:flex">
            <a href="#formats" className="text-sm font-medium text-muted-foreground hover:text-primary">
              Форматы
            </a>
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-primary">
              Возможности
            </a>
            <Link to="/library" className="text-sm font-medium text-muted-foreground hover:text-primary">
              Библиотека
            </Link>
            <Link to="/join" className="text-sm font-medium text-muted-foreground hover:text-primary">
              Присоединиться
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            {user ? (
              <Link
                to="/profile"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-surface-muted"
              >
                <Avatar name={user.name} size={28} />
                <span className="max-w-[8ch] truncate sm:max-w-[12ch]">{user.name}</span>
              </Link>
            ) : (
              <Link
                to="/login"
                className="rounded-full px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-muted"
              >
                Войти
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden pt-16 pb-24 sm:pt-24 sm:pb-32">
          <div className="pointer-events-none absolute top-10 -right-16 h-72 w-72 rounded-full bg-primary-soft blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-accent-soft blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-6 lg:grid-cols-2">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary-soft px-4 py-1.5 text-primary">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider">Собрано с душой</span>
              </div>
              <h1 className="font-display text-5xl font-black leading-[1.05] md:text-6xl">
                Создавай викторины, <br />
                которые <span className="text-primary">хочется</span> проходить
              </h1>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
                Личный инструмент для квизов, «Своей игры» и «Миллионера». AI-помощник генерирует вопросы, онлайн-комнаты
                объединяют участников, а библиотека и шаринг помогают делиться играми с другими пользователями.
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <Link to="/builder/quiz" className="btn-accent">
                  Создать игру
                </Link>
                <Link
                  to="/library"
                  className="rounded-2xl border-2 border-border-strong bg-surface px-8 py-4 text-lg font-bold text-foreground transition-colors hover:bg-foreground hover:text-white"
                >
                  Библиотека
                </Link>
              </div>
            </div>

            {/* Preview mock */}
            <div className="relative">
              <div className="surface-card rotate-1 p-6 shadow-lift">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-danger" />
                    <div className="h-3 w-3 rounded-full bg-amber" />
                    <div className="h-3 w-3 rounded-full bg-success" />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">islandquiz</span>
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg bg-surface-muted p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">Вопрос 3 из 10</p>
                    <p className="mt-2 font-display font-bold">Столица Исландии?</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-border-strong p-3 text-sm">Осло</div>
                    <div className="rounded-lg border-2 border-primary bg-primary-soft p-3 text-sm font-semibold">
                      Рейкьявик
                    </div>
                    <div className="rounded-lg border border-border-strong p-3 text-sm">Хельсинки</div>
                    <div className="rounded-lg border border-border-strong p-3 text-sm">Копенгаген</div>
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full w-2/3 rounded-full bg-accent" />
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -left-6 -rotate-3 rounded-2xl border border-border bg-white p-4 shadow-lift">
                <p className="text-xs font-semibold text-muted-foreground">Ваш счёт</p>
                <p className="font-display text-2xl font-black text-primary">+300</p>
              </div>
            </div>
          </div>
        </section>

        {/* Formats */}
        <section id="formats" className="bg-white py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-16 text-center">
              <h2 className="font-display text-3xl font-black md:text-4xl">Выберите формат</h2>
              <p className="mt-3 text-muted-foreground">Три легендарных механики в одном инструменте</p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {formats.map((f) => {
                const Icon = f.icon;
                const toneMap = {
                  primary: "bg-primary-soft text-primary group-hover:bg-primary group-hover:text-primary-foreground",
                  accent: "bg-accent-soft text-accent group-hover:bg-accent group-hover:text-accent-foreground",
                  amber: "bg-amber-soft text-amber group-hover:bg-amber group-hover:text-white",
                };
                return (
                  <div
                    key={f.title}
                    className="group relative flex flex-col rounded-3xl border border-border bg-background p-8 transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-lift"
                  >
                    <div
                      className={`mb-6 grid h-14 w-14 place-items-center rounded-2xl transition-colors ${toneMap[f.tone]}`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="font-display text-2xl font-bold">{f.title}</h3>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                    <Link
                      to={f.href}
                      className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white py-3 font-bold text-foreground shadow-sm transition-all group-hover:bg-foreground group-hover:text-white"
                    >
                      Создать
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Library block */}
        <section className="bg-surface py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid items-center gap-10 md:grid-cols-2">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                  <LibraryIcon className="h-3.5 w-3.5" /> Библиотека
                </div>
                <h2 className="font-display text-3xl font-black md:text-4xl">Ваша библиотека квизов</h2>
                <p className="mt-4 text-muted-foreground">
                  Все созданные игры хранятся в одном месте. Делайте игры публичными, добавляйте чужие к себе, ищите по
                  тегам и категориям, редактируйте и запускайте — без ограничений.
                </p>
                <Link to="/library" className="btn-accent mt-6 inline-flex">
                  Перейти в библиотеку <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { icon: FileText, tone: "bg-primary-soft text-primary", label: "Столицы мира", kind: "Квиз" },
                  { icon: Grid3x3, tone: "bg-amber-soft text-amber", label: "Кино 90-х", kind: "Своя игра" },
                  { icon: Coins, tone: "bg-success-soft text-success", label: "Химия", kind: "Миллионер" },
                  { icon: FileText, tone: "bg-primary-soft text-primary", label: "История ХХ века", kind: "Квиз" },
                ].map((c, i) => (
                  <div key={i} className="surface-card p-4">
                    <div className={`grid h-8 w-8 place-items-center rounded-lg ${c.tone}`}>
                      <c.icon className="h-4 w-4" />
                    </div>
                    <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {c.kind}
                    </p>
                    <p className="font-display text-sm font-bold">{c.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Online rooms block */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid items-center gap-10 md:grid-cols-2">
              <div className="relative order-2 md:order-1">
                <div className="surface-card rotate-[-1deg] p-6 shadow-lift">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                      </span>
                      LIVE
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">код: 4207</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { n: "Ева", s: 2450, hot: 4 },
                      { n: "Марк", s: 2180, hot: 2 },
                      { n: "Лиза", s: 1990 },
                      { n: "Тим", s: 1720 },
                    ].map((p, i) => (
                      <div
                        key={p.n}
                        className={`flex items-center justify-between rounded-xl px-3 py-2 ${i === 0 ? "bg-amber-soft" : "bg-surface-muted"}`}
                      >
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <span className="w-4 font-mono text-xs text-muted-foreground">{i + 1}</span>
                          <span>{p.n}</span>
                          {p.hot && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber/20 px-1.5 text-[10px] font-bold text-amber">
                              <Flame className="h-3 w-3" />
                              {p.hot}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-sm font-bold">{p.s.toLocaleString("ru-RU")}</span>
                      </div>
                    ))}

                  </div>
                </div>
              </div>
              <div className="order-1 md:order-2">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent">
                  <Radio className="h-3.5 w-3.5" /> Онлайн-комнаты
                </div>
                <h2 className="font-display text-3xl font-black md:text-4xl">Играйте вместе в реальном времени</h2>
                <p className="mt-4 text-muted-foreground">
                  Создайте комнату, поделитесь кодом — и участники подключатся со своих устройств. Работает для Квиза и
                  «Своей игры»: стрики, рейтинг, подиум — всё как в Kahoot!
                </p>
                <Link to="/join" className="btn-accent mt-6 inline-flex">
                  Попробовать онлайн-режим <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* AI helper block */}
        <section className="bg-surface py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid items-center gap-10 md:grid-cols-2">
              <div className="order-2 md:order-1">
                <div className="surface-card rotate-1 p-6 shadow-lift">
                  <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                    <Sparkles className="h-4 w-4" /> AI-помощник
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-lg bg-surface-muted p-3">
                      <p className="text-xs text-muted-foreground">Тема</p>
                      <p className="font-display font-bold">Космос</p>
                    </div>
                    <div className="rounded-lg border border-primary/30 bg-primary-soft p-3">
                      <p className="text-xs font-semibold text-primary">Сгенерированный вопрос</p>
                      <p className="mt-1 text-sm font-medium">
                        Какая планета Солнечной системы вращается вокруг своей оси задом наперёд?
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-border-strong p-2 text-xs">Марс</div>
                      <div className="rounded-lg border-2 border-primary bg-primary-soft p-2 text-xs font-semibold">
                        Венера
                      </div>
                      <div className="rounded-lg border border-border-strong p-2 text-xs">Юпитер</div>
                      <div className="rounded-lg border border-border-strong p-2 text-xs">Сатурн</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="order-1 md:order-2">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent">
                  <Sparkles className="h-3.5 w-3.5" /> AI-помощник
                </div>
                <h2 className="font-display text-3xl font-black md:text-4xl">ИИ помогает создавать вопросы</h2>
                <p className="mt-4 text-muted-foreground">
                  Введите тему — получите готовые вопросы, улучшайте формулировки, генерируйте целые квизы и категории
                  для «Своей игры". Экономьте время на подготовку.
                </p>
                <Link to="/builder/quiz" className="btn-accent mt-6 inline-flex">
                  Создать с AI <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-16 max-w-2xl">
              <h2 className="font-display text-3xl font-black md:text-4xl">Всё нужное — уже внутри</h2>
              <p className="mt-3 text-muted-foreground">
                Инструмент, который не мешает создавать. Логика проверена, а интерфейс не отвлекает.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className="surface-card p-6">
                    <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-display text-lg font-bold">{f.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16">
          <div className="mx-auto max-w-4xl px-6">
            <div className="relative overflow-hidden rounded-3xl bg-foreground p-10 text-center text-white sm:p-16">
              <div className="pointer-events-none absolute top-0 right-0 h-64 w-64 -translate-y-16 translate-x-16 rounded-full bg-primary/30 blur-3xl" />
              <div className="pointer-events-none absolute bottom-0 left-0 h-64 w-64 translate-y-16 -translate-x-16 rounded-full bg-accent/30 blur-3xl" />
              <h2 className="relative font-display text-3xl font-black md:text-4xl">Готовы попробовать?</h2>
              <p className="relative mt-3 text-white/70">Создайте свой первый квиз за пару минут.</p>
              <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link to="/builder/quiz" className="btn-accent inline-flex">
                  Создать игру
                </Link>
                <Link
                  to="/register"
                  className="inline-flex rounded-2xl border-2 border-white/30 px-8 py-4 text-lg font-bold text-white transition-colors hover:bg-white/10"
                >
                  Зарегистрироваться
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="grid h-6 w-6 place-items-center rounded bg-foreground text-white">
              <span className="text-[9px] font-black">IQ</span>
            </div>
            <span className="font-display text-sm font-bold">IslandQuiz</span>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 IslandQuiz. Сделано для своих.</p>
        </div>
      </footer>
    </div>
  );
}
