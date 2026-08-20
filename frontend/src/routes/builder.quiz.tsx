import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Plus,
  Trash2,
  Circle,
  CheckCircle2,
  Type as TypeIcon,
  Shuffle,
  BarChart3,
  Blocks,
  ListOrdered,
  ArrowUp,
  ArrowDown, GripVertical,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { BuilderShell } from "@/components/builder-shell";
import { FormulaButton } from "@/components/formula-popover";
import { AIHelperButton } from "@/components/ai-helper";
import { AIGenerateQuizButton } from "@/components/ai-generate-quiz";
import { CharCounter } from "@/components/char-counter";
import { TagInput } from "@/components/tag-input";
import { SortableQuestionList } from "@/components/sortable-question-list";
import { SortableQuestionCards } from "@/components/sortable-question-cards";
import { Upload } from "lucide-react";
import { LIMITS } from "@/lib/limits";
import { ImageDrop } from "@/lib/image-drop";
import { ThemeSelect } from "@/components/theme-select";
import { newId } from "@/lib/storage";  // генерация id
import { loadGame, saveGame, deleteGame } from "@/lib/api";    // загрузка игры с бэкенда
import { useAutoDraft, useDraftPrompt, clearDraft } from "@/hooks/use-draft";
import { DraftBanner } from "@/components/draft-banner";
import { BuilderToolbar, BuilderFabs, BuilderGameInfoSection, BuilderSettingsSection } from "@/components/builder-actions";
import {
  downloadExcelTemplate,
  exportQuizExcel,
  importQuizXlsx,
  printQuiz,
} from "@/lib/exports";
import type {
  PlayerTheme,
  QuizConfig,
  QuizData,
  QuizQuestion,
  QuizQuestionType,
} from "@/lib/types";

import type { GameVisibility } from "@/lib/types";

export const Route = createFileRoute("/builder/quiz")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Конструктор квиза — IslandQuiz" },
      { name: "description", content: "Создавайте квизы с ABCD, Да/Нет, открытым ответом и сопоставлением." },
    ],
  }),
  component: BuilderQuiz,
});

const TYPE_META: Record<QuizQuestionType, { label: string; icon: typeof Circle; tone: string }> = {
  choice: { label: "ABCD", icon: Circle, tone: "text-primary" },
  bool: { label: "Да/Нет", icon: CheckCircle2, tone: "text-success" },
  text: { label: "Текст", icon: TypeIcon, tone: "text-amber" },
  matching: { label: "Пары", icon: Shuffle, tone: "text-accent" },
  close: { label: "Пропуски", icon: Blocks, tone: "text-primary" },
  ordering: { label: "Порядок", icon: ListOrdered, tone: "text-accent" },
};

const DEFAULT_QUIZ_CONFIG: QuizConfig = {
  title: "Новый квиз",
  description: "",
  theme: "amber",
  shuffleQuestions: false,
  showResult: "end",
  defaultTime: 30,
  orderMode: "sequential",
  totalTime: 10,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQuizQuestionType(value: unknown): value is QuizQuestionType {
  return value === "choice" || value === "bool" || value === "text" || value === "matching" || value === "close" || value === "ordering";
}

function normalizeQuizConfig(value: unknown): QuizConfig {
  if (!isRecord(value)) return DEFAULT_QUIZ_CONFIG;
  const theme = value.theme;
  return {
    title: typeof value.title === "string" ? value.title : DEFAULT_QUIZ_CONFIG.title,
    description: typeof value.description === "string" ? value.description : "",
    theme: theme === "amber" || theme === "midnight" || theme === "classic" || theme === "ocean" || theme === "forest" ? theme : "amber",
    shuffleQuestions: typeof value.shuffleQuestions === "boolean" ? value.shuffleQuestions : false,
    showResult: value.showResult === "each" || value.showResult === "end" ? value.showResult : "end",
    defaultTime: typeof value.defaultTime === "number" && value.defaultTime > 0 ? value.defaultTime : 30,
    orderMode: value.orderMode === "free" || value.orderMode === "sequential" ? value.orderMode : "sequential",
    totalTime: typeof value.totalTime === "number" && value.totalTime > 0 ? value.totalTime : 10,
  };
}

function normalizeQuizQuestion(value: unknown, defaultTime: number): QuizQuestion | null {
  if (!isRecord(value) || !isQuizQuestionType(value.type)) return null;
  const type = value.type;
  const options = Array.isArray(value.options) ? value.options.filter((option): option is string => typeof option === "string") : [];
  return {
    id: typeof value.id === "string" && value.id ? value.id : newId(),
    type,
    q: typeof value.q === "string" ? value.q : "",
    image: typeof value.image === "string" ? value.image : "",
    options: type === "choice" ? (options.length ? options : ["", "", "", ""]) : [],
    answer: typeof value.answer === "string" ? value.answer : type === "bool" ? "true" : "",
    points: typeof value.points === "number" && value.points > 0 ? value.points : 100,
    time: typeof value.time === "number" && value.time > 0 ? value.time : defaultTime,
  };
}

function normalizeQuizData(value: unknown): QuizData {
  const data = isRecord(value) ? value : {};
  const config = normalizeQuizConfig(data.config);
  const questions = Array.isArray(data.questions)
    ? data.questions.map((question) => normalizeQuizQuestion(question, config.defaultTime)).filter((question): question is QuizQuestion => question !== null)
    : [];
  return { config, questions: questions.length ? questions : [makeQuestion("choice", 100, config.defaultTime)] };
}

function makeQuestion(type: QuizQuestionType, points = 100, time = 30): QuizQuestion {
  const base = { id: newId(), type, q: "", image: "", options: [], answer: "", points, time };
  if (type === "choice") return { ...base, options: ["", "", "", ""], answer: "" };
  if (type === "bool") return { ...base, answer: "true" };
  if (type === "matching") return { ...base, answer: JSON.stringify([{ left: "", right: "" }]) };
  if (type === "close") return { ...base, answer: JSON.stringify([""]) };
  if (type === "ordering") return { ...base, answer: JSON.stringify(["", "", ""]) };
  return base;
}

function BuilderQuiz() {
  const { id: urlId } = Route.useSearch();
  const navigate = useNavigate();
  const [config, setConfig] = useState<QuizConfig>(DEFAULT_QUIZ_CONFIG);
  const [questions, setQuestions] = useState<QuizQuestion[]>([makeQuestion("choice")]);
  const [tags, setTags] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [printAnswers, setPrintAnswers] = useState(true);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">(urlId ? "loading" : "idle");
  const [visibility, setVisibility] = useState<GameVisibility>("private");
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const questionIds = questions.map((question) => question.id).join("|");

  useEffect(() => {
    const list = listRef.current;
    if (!list || !questions.length) return;
    const cards = questions
      .map((question) => document.getElementById(`q-${question.id}`))
      .filter((card): card is HTMLElement => card !== null);
    if (!cards.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveQuestionId(visible[0].target.id.slice(2));
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: [0, 0.25, 0.5] },
    );
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [questionIds, questions]);

  // Bug 1.2: подгружаем сохранённый квиз по ?id=
  useEffect(() => {
    if (!urlId) return;
    (async () => {
      try {
        const rec = await loadGame<QuizData>("quiz", urlId);
        if (rec) {
          const data = normalizeQuizData(rec.data);
          setConfig(data.config);
          setQuestions(data.questions);
          setTags(rec.tags ?? []);
          if (rec.visibility) setVisibility(rec.visibility);
          setSavedSnapshot(JSON.stringify({ config: data.config, questions: data.questions, tags: rec.tags ?? [] }));
          setSavedId(urlId);
          setLoadState("idle");
        } else {
          setLoadState("error");
        }
      } catch (err) {
        console.error(err);
        setLoadState("error");
      }
    })();
  }, [urlId]);

  // Draft autosave — only for NEW games (no urlId, no savedId yet).
  const draftEnabled = !urlId;
  const draftPrompt = useDraftPrompt<{ config: QuizConfig; questions: QuizQuestion[]; tags: string[] }>(
    "quiz",
    draftEnabled,
  );
  const draftPaused = !draftEnabled || !draftPrompt.checked || !!draftPrompt.draft || !!savedId;
  useAutoDraft("quiz", { config, questions, tags }, { paused: draftPaused });

  const restoreDraft = () => {
    const d = draftPrompt.draft;
    if (!d) return;
    const data = normalizeQuizData(d.data);
    setConfig(data.config);
    setQuestions(data.questions);
    setTags(d.data.tags ?? []);
    draftPrompt.accept();
    showToast("Черновик восстановлен");
  };

  const addQuestion = (type: QuizQuestionType) => {
    const q = makeQuestion(type, 100, config.defaultTime);
    setQuestions((prev) => [...prev, q]);
    setTimeout(() => {
      document.getElementById(`q-${q.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const scrollToQuestion = (index: number) => {
    const question = questions[index];
    if (!question) return;
    setActiveQuestionId(question.id);
    document.getElementById(`q-${question.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const patchQuestion = (id: string, patch: Partial<QuizQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const validate = (): boolean => {
    if (questions.some((q) => !q.q.trim())) {
      showToast("Заполните текст всех вопросов");
      return false;
    }
    return true;
  };

  // Bug 1.3: если есть savedId — обновляем, иначе создаём.

  const currentSnapshot = useMemo(
    () => JSON.stringify({ config, questions, tags }),
    [config, questions, tags],
  );
  const saveState = savedSnapshot === currentSnapshot ? "saved" : "dirty";

  const handleSave = async (): Promise<string | null> => {
    if (!validate()) return null;
    const id = savedId ?? newId();
    await saveGame({ kind: "quiz", id, data: { config, questions }, tags, visibility });
    setSavedSnapshot(currentSnapshot);
    setSavedId(id);
    clearDraft("quiz");
    showToast(savedId ? "Изменения сохранены" : "Квиз сохранён!");
    return id;
  };

  const handleSaveAsCopy = async (): Promise<string | null> => {
    if (!validate()) return null;
    const id = newId();
    await saveGame({
      kind: "quiz",
      id,
      data: {
        config: { ...config, title: `${config.title} (копия)` },
        questions,
      },
      tags,
    });
    setSavedSnapshot(currentSnapshot);
    setSavedId(id);
    clearDraft("quiz");
    showToast("Создана копия квиза");
    return id;
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    if (urlId) navigate({ to: "/game/$id", params: { id: urlId } });
    else navigate({ to: "/library" });
  };

  const handleDelete = async () => {
    if (!savedId || !window.confirm("Удалить этот квиз?")) return;
    try {
      await deleteGame("quiz", savedId);
      navigate({ to: "/library" });
    } catch {
      showToast("Не удалось удалить квиз");
    }
  };


  const openResults = async () => {
    const id = await handleSave();
    if (id) window.open(`/quiz/${id}/results`, "_blank", "noopener");
  };

  const handleImport = async (file: File) => {
    try {
      const imported = await importQuizXlsx(file, config.defaultTime);
      if (imported.length) {
        setQuestions(imported);
        showToast(`Загружено вопросов: ${imported.length}`);
      }
    } catch (err) {
      console.error(err);
      showToast("Не удалось прочитать Excel");
    }
  };

  
  const sidebar = (
    <div className="space-y-1">
      <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Вопросы
      </p>
      <SortableQuestionList
        questions={questions}
        typeMeta={TYPE_META}
        onReorder={(newOrder) => {
          const reordered = newOrder.map(i => questions[i]);
          setQuestions(reordered);
        }}
        onSelect={(index) => {
          document.getElementById(`q-${questions[index].id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
        onRemove={(index) => removeQuestion(questions[index].id)}
      />
      <div className="my-2 border-t border-border" />
      <div className="grid grid-cols-2 gap-1">
        {(Object.keys(TYPE_META) as QuizQuestionType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => addQuestion(t)}
            className="rounded-md border border-dashed border-border-strong px-2 py-1.5 text-[11px] font-semibold text-muted-foreground hover:border-primary hover:text-primary"
          >
            + {TYPE_META[t].label}
          </button>
        ))}
      </div>
    </div>
  );


  const applyGeneratedQuiz = (result: { title: string; questions: import("@/lib/api").GeneratedQuizQuestion[] }) => {
    const generatedQuestions = Array.isArray(result.questions) ? result.questions : [];
    if (!generatedQuestions.length) {
      showToast("AI не вернул вопросы квиза");
      return;
    }
    const next: QuizQuestion[] = generatedQuestions.map((g) => {
      if (g.type === "choice") {
        const opts = g.options ?? ["", "", "", ""];
        const correctIdx = typeof g.correct === "number" ? g.correct : 0;
        return {
          id: newId(),
          type: "choice",
          q: g.question,
          image: "",
          options: opts,
          answer: opts[correctIdx] ?? opts[0] ?? "",
          points: 100,
          time: config.defaultTime,
        };
      }
      if (g.type === "bool") {
        return {
          id: newId(),
          type: "bool",
          q: g.question,
          image: "",
          options: [],
          answer: g.correct === true ? "true" : "false",
          points: 100,
          time: config.defaultTime,
        };
      }
      if (g.type === "text") {
        return {
          id: newId(),
          type: "text",
          q: g.question,
          image: "",
          options: [],
          answer: g.correctAnswer ?? "",
          points: 100,
          time: config.defaultTime,
        };
      }
      if (g.type === "matching") {
        return {
          id: newId(),
          type: "matching",
          q: g.question,
          image: "",
          options: [],
          answer: JSON.stringify(g.pairs ?? [{ left: "", right: "" }]),
          points: 100,
          time: config.defaultTime,
        };
      }
      if (g.type === "close") {
        return {
          id: newId(),
          type: "close",
          q: g.question,
          image: "",
          options: [],
          answer: g.correctAnswer ?? "[]",
          points: 100,
          time: config.defaultTime,
        };
      }
      if (g.type === "ordering") {
        return {
          id: newId(),
          type: "ordering",
          q: g.question,
          image: "",
          options: [],
          answer: g.correctAnswer ?? "[]",
          points: 100,
          time: config.defaultTime,
        };
      }
      // fallback
      return {
        id: newId(),
        type: "choice",
        q: g.question,
        image: "",
        options: g.options ?? ["", "", "", ""],
        answer: g.options?.[typeof g.correct === "number" ? g.correct : 0] ?? "",
        points: 100,
        time: config.defaultTime,
      };
    });
    setQuestions(next);
    if (!config.title.trim() || config.title === "Новый квиз") {
      setConfig({ ...config, title: result.title });
    }
    showToast(`AI сгенерировал вопросов: ${next.length}`);
  };

  const settingsPanel = (
    <div className="space-y-4">
      <h3 className="font-display font-bold">Настройки квиза</h3>
      <div className="grid gap-4">
        <div>
          <span className="mb-2 block text-xs font-semibold text-muted-foreground">Тема плеера</span>
          <ThemeSelect
            value={config.theme}
            onChange={(theme: PlayerTheme) => setConfig({ ...config, theme })}
          />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">
            {config.orderMode === "free" ? "Общее время (мин)" : "Таймер на вопрос (сек)"}
          </span>
          <input
            type="number"
            className="input-base"
            value={config.orderMode === "free" ? config.totalTime : config.defaultTime}
            onChange={(e) =>
              config.orderMode === "free"
                ? setConfig({ ...config, totalTime: parseInt(e.target.value) || 10 })
                : setConfig({ ...config, defaultTime: parseInt(e.target.value) || 30 })
            }
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.shuffleQuestions}
            onChange={(e) => setConfig({ ...config, shuffleQuestions: e.target.checked })}
          />
          Перемешивать вопросы
        </label>
      </div>
    </div>
  );

  const advancedSettingsPanel = (
    <div className="grid gap-4">
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Порядок вопросов</span>
        <select
          className="input-base"
          value={config.orderMode}
          onChange={(e) =>
            setConfig({ ...config, orderMode: e.target.value as QuizConfig["orderMode"] })
          }
        >
          <option value="sequential">Последовательно</option>
          <option value="free">В любом порядке</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Показывать результат</span>
        <select
          className="input-base"
          value={config.showResult}
          onChange={(e) => setConfig({ ...config, showResult: e.target.value as "each" | "end" })}
        >
          <option value="end">В конце</option>
          <option value="each">После каждого</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={printAnswers}
          onChange={(e) => setPrintAnswers(e.target.checked)}
        />
        Печатать с ответами (иначе — только вопросы)
      </label>
    </div>
  );

  const resultsButton = (
    <button
      className="btn-ghost"
      onClick={openResults}
      aria-label="Результаты"
      title="Результаты"
    >
      <BarChart3 className="h-4 w-4 shrink-0" />
      <span className="hidden md:inline">Результаты</span>
    </button>
  );

  const toolbar = (
    <div className="flex w-full flex-col gap-2 md:flex-row md:items-stretch">
      <div className="hidden flex-1 md:flex">
        <BuilderToolbar
          kind="quiz"
          onImportFile={handleImport}
          onDownloadTemplate={() => downloadExcelTemplate("quiz")}
          onExportExcel={() => exportQuizExcel({ config, questions })}
          onPrint={(withAnswers) => printQuiz({ config, questions }, { withAnswers })}
          printAnswers={printAnswers}
          onToggleSettings={() => setShowSettings((s) => !s)}
          settingsOpen={showSettings}
          settingsPanel={settingsPanel}
          advancedSettingsPanel={advancedSettingsPanel}
          extraButtons={resultsButton}
        />
      </div>
      <div className="hidden md:flex">
        <AIGenerateQuizButton currentTitle={config.title} onGenerated={applyGeneratedQuiz} />
      </div>
    </div>
  );


  if (loadState === "loading") {
    return (
      <div className="min-h-screen grid place-items-center bg-surface text-muted-foreground">
        Загружаем квиз…
      </div>
    );
  }
  if (loadState === "error") {
    return (
      <div className="min-h-screen grid place-items-center bg-surface p-6 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold">Квиз не найден</h1>
          <p className="mt-2 text-sm text-muted-foreground">Возможно, он был удалён.</p>
          <a href="/library" className="btn-accent mt-4 inline-flex">В библиотеку</a>
        </div>
      </div>
    );
  }

  return (
    <BuilderShell
      title="Квиз"
      subtitle="Тест из вопросов разного типа: выбор ответа, правда/ложь, открытый вопрос, сопоставление"
      icon={<FileText className="h-5 w-5" />}
      toolbar={toolbar}
      sidebar={sidebar}
      theme={config.theme}
      extraFabs={
        <>
          <BuilderFabs
            kind="quiz"
            savedId={savedId}
            title={config.title || "Квиз"}
            visibility={visibility}
            saveState={saveState}
            onVisibilityChange={setVisibility}
            onSave={handleSave}
            onSaveAsCopy={handleSaveAsCopy}
            onSettings={() => setShowSettings((s) => !s)}
            mobilePrimaryAction={<AIGenerateQuizButton compact currentTitle={config.title} onGenerated={applyGeneratedQuiz} />}
            onBack={handleBack}
            onImportFile={handleImport}
            onDownloadTemplate={() => downloadExcelTemplate("quiz")}
            onExportExcel={() => exportQuizExcel({ config, questions })}
            onPrint={(withAnswers) => printQuiz({ config, questions }, { withAnswers })}
            printAnswers={printAnswers}
            onResults={openResults}
            onDelete={handleDelete}
            helpTitle="Как пользоваться конструктором квиза"
            helpContent={
              <>
                <p><b>Типы вопросов:</b> ABCD — 4 варианта. Да/Нет — бинарный вопрос. Текст — несколько вариантов через запятую. Пары — сопоставление. Пропуски и Порядок — специальные типы.</p>
                <p><b>Картинка:</b> перетащите файл в зону или вставьте URL.</p>
                <p><b>Играть:</b> для квиза доступен выбор онлайн-комнаты или офлайн-режима.</p>
              </>
            }
          />
        </>
      }
    >
      {draftPrompt.draft && (
        <DraftBanner
          updatedAt={draftPrompt.draft.updatedAt}
          onRestore={restoreDraft}
          onDiscard={() => {
            draftPrompt.dismiss();
            showToast("Черновик удалён");
          }}
        />
      )}
      {showSettings && (
        <BuilderSettingsSection
          panel={settingsPanel}
          advancedPanel={advancedSettingsPanel}
          onClose={() => setShowSettings(false)}
        />
      )}
      <MobileQuestionNavigator
        questions={questions}
        activeQuestionId={activeQuestionId}
        onSelect={scrollToQuestion}
        onAddQuestion={addQuestion}
      />
      <BuilderGameInfoSection title={config.title}>
        <label className="block">
          <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-muted-foreground">
            Название
            <CharCounter value={config.title} max={LIMITS.title} />
          </span>
          <input
            className="input-base text-lg font-display font-bold"
            maxLength={LIMITS.title}
            placeholder="Название квиза"
            value={config.title}
            onChange={(e) => setConfig({ ...config, title: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-muted-foreground">
            Описание
            <CharCounter value={config.description} max={LIMITS.question} />
          </span>
          <input
            className="input-base"
            maxLength={LIMITS.question}
            placeholder="Краткое описание или инструкция..."
            value={config.description}
            onChange={(e) => setConfig({ ...config, description: e.target.value })}
          />
        </label>
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Теги</span>
          <TagInput value={tags} onChange={setTags} />
        </div>
      </BuilderGameInfoSection>


      <div ref={listRef} className="space-y-4">
        <SortableQuestionCards
          items={questions}
          onReorder={(newOrder) => {
            const reordered = newOrder.map(i => questions[i]);
            setQuestions(reordered);
          }}
          renderItem={(q, idx, dragHandleProps) => (
            <QuestionCard
              key={q.id}
              index={idx}
              question={q}
              topic={config.title}
              onPatch={(p) => patchQuestion(q.id, p)}
              onRemove={() => removeQuestion(q.id)}
              dragHandleProps={dragHandleProps}
            />
          )}
        />
      </div>

      <div className="flex flex-wrap justify-center gap-2 py-4">
        {(Object.keys(TYPE_META) as QuizQuestionType[]).map((t) => {
          const Icon = TYPE_META[t].icon;
          return (
            <button key={t} onClick={() => addQuestion(t)} className="btn-ghost">
              <Plus className="h-4 w-4" />
              <Icon className={`h-4 w-4 ${TYPE_META[t].tone}`} />
              {TYPE_META[t].label}
            </button>
          );
        })}
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-white shadow-lift">
          {toast}
        </div>
      )}
    </BuilderShell>
  );
}

function MobileQuestionNavigator({
  questions,
  activeQuestionId,
  onSelect,
  onAddQuestion,
}: {
  questions: QuizQuestion[];
  activeQuestionId: string | null;
  onSelect: (index: number) => void;
  onAddQuestion: (type: QuizQuestionType) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  if (!questions.length) return null;
  const activeIndex = Math.max(0, questions.findIndex((question) => question.id === activeQuestionId));
  const activeQuestion = questions[activeIndex];

  return (
    <div className="builder-mobile-question-nav sticky z-30 -mx-1 mb-3 rounded-2xl border border-border bg-surface/95 p-2.5 shadow-soft backdrop-blur-md md:hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-foreground">
            Вопрос {activeIndex + 1} из {questions.length}
          </p>
          <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
            {TYPE_META[activeQuestion.type].label}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={activeIndex === 0}
            onClick={() => onSelect(activeIndex - 1)}
            aria-label="Предыдущий вопрос"
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-surface-muted disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={activeIndex === questions.length - 1}
            onClick={() => onSelect(activeIndex + 1)}
            aria-label="Следующий вопрос"
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-surface-muted disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-1">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto py-0.5">
          {questions.map((question, index) => {
            const current = index === activeIndex;
            const completed = question.q.trim().length > 0;
            return (
              <button
                key={question.id}
                type="button"
                onClick={() => onSelect(index)}
                aria-label={`Перейти к вопросу ${index + 1}${completed ? ", заполнен" : ", пустой"}`}
                aria-current={current ? "step" : undefined}
                className={`relative grid h-8 min-w-8 shrink-0 place-items-center rounded-lg px-2 text-xs font-bold tabular-nums transition-colors ${
                  current
                    ? "bg-primary text-white shadow-sm"
                    : "bg-surface-muted text-muted-foreground hover:bg-primary-soft hover:text-primary"
                }`}
              >
                {index + 1}
                <span
                  aria-hidden
                  className={`absolute bottom-0.5 h-1 w-1 rounded-full ${
                    completed ? "bg-success" : "bg-border-strong"
                  }`}
                />
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setAddOpen((open) => !open)}
            aria-label="Добавить вопрос"
            aria-expanded={addOpen}
            className={`grid h-8 min-w-8 shrink-0 place-items-center rounded-lg border border-dashed px-2 text-xs font-bold text-primary transition-colors hover:bg-primary-soft ${addOpen ? "bg-primary-soft" : ""}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      {addOpen && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-border pt-2">
          {(Object.keys(TYPE_META) as QuizQuestionType[]).map((type) => {
            const Icon = TYPE_META[type].icon;
            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  onAddQuestion(type);
                  setAddOpen(false);
                }}
                className="flex min-h-9 items-center gap-1.5 rounded-lg bg-surface-muted px-2 text-left text-xs font-semibold hover:bg-primary-soft hover:text-primary"
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${TYPE_META[type].tone}`} />
                <span className="truncate">{TYPE_META[type].label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  index,
  question,
  topic,
  onPatch,
  onRemove,
  dragHandleProps,
}: {
  index: number;
  question: QuizQuestion;
  topic: string;
  onPatch: (p: Partial<QuizQuestion>) => void;
  onRemove: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
}) {
  const Icon = TYPE_META[question.type].icon;
  const qRef = useRef<HTMLTextAreaElement>(null);
  const optRefs = useRef<(HTMLInputElement | null)[]>([]);
  const aiType: "choice" | "bool" | "text" | undefined =
    question.type === "choice" || question.type === "bool" || question.type === "text"
      ? question.type
      : undefined;
  const aiFormat = `quiz-${question.type}`;
  return (
    <div id={`q-${question.id}`} className="surface-card space-y-4 p-4 scroll-mt-24 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {dragHandleProps && (
            <button
              type="button"
              className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
              aria-label="Перетащить вопрос"
              {...dragHandleProps}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}
          <Icon className={`h-4 w-4 ${TYPE_META[question.type].tone}`} />
          Вопрос {index + 1} · {TYPE_META[question.type].label}
        </div>
        <button
          onClick={onRemove}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger"
          aria-label="Удалить"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="relative">
        <textarea
          ref={qRef}
          rows={2}
          maxLength={LIMITS.question}
          className="input-base pr-20"
          placeholder="Текст вопроса... (можно \\(x^2\\))"
          value={question.q}
          onChange={(e) => onPatch({ q: e.target.value })}
        />
        <div className="absolute right-2 top-2 flex items-center gap-1">
          <AIHelperButton
            currentValue={question.q}
            topic={topic}
            type={aiType}
            format={aiFormat}
            onPick={(v) => {
              const patch: Partial<QuizQuestion> = { q: v.question };
              if (question.type === "choice" && v.options) {
                patch.options = v.options;
                const correctIdx = typeof v.correct === "number" ? v.correct : 0;
                patch.answer = v.options[correctIdx] ?? "";
              }
              if (question.type === "bool") {
                patch.answer = v.correct === true ? "true" : "false";
              }
              if (question.type === "text" && v.correctAnswer) {
                patch.answer = v.correctAnswer;
              }
              if (question.type === "matching" && v.pairs) {
                patch.answer = JSON.stringify(v.pairs);
              }
              if (question.type === "close" && v.correctAnswer) {
                const arr = v.correctAnswer.split("|").map((s) => s.trim()).filter(Boolean);
                patch.answer = JSON.stringify(arr.length ? arr : [v.correctAnswer]);
              }
              if (question.type === "ordering" && v.options) {
                patch.answer = JSON.stringify(v.options);
              }
              onPatch(patch);
            }}
          />
          <FormulaButton inputRef={qRef} value={question.q} onChange={(v) => onPatch({ q: v })} />
        </div>
        <div className="mt-1 flex justify-end">
          <CharCounter value={question.q} max={LIMITS.question} />
        </div>
      </div>

      <ImageDrop value={question.image} onChange={(image) => onPatch({ image })} />

      {question.type === "choice" && (
        <div className="space-y-2">
          {question.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onPatch({ answer: opt })}
                className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-full border-2 text-xs font-bold ${
                  question.answer && question.answer === opt && opt
                    ? "border-success bg-success text-white"
                    : "border-border-strong text-muted-foreground hover:border-primary"
                }`}
                aria-label="Отметить верным"
              >
                {String.fromCharCode(65 + i)}
              </button>
              <div className="relative flex-1">
                <input
                  ref={(el) => {
                    optRefs.current[i] = el;
                  }}
                  className="input-base pr-16"
                  maxLength={LIMITS.option}
                  placeholder={`Вариант ${String.fromCharCode(65 + i)}`}
                  value={opt}
                  onChange={(e) => {
                    const options = [...question.options];
                    const old = options[i];
                    options[i] = e.target.value;
                    const answer = question.answer === old ? e.target.value : question.answer;
                    onPatch({ options, answer });
                  }}
                />
                <div className="pointer-events-none absolute right-9 top-1/2 -translate-y-1/2">
                  <CharCounter value={opt} max={LIMITS.option} />
                </div>
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                  <FormulaButton
                    inputRef={{ current: optRefs.current[i] } as React.RefObject<HTMLInputElement | null>}
                    value={opt}
                    onChange={(v) => {
                      const options = [...question.options];
                      const old = options[i];
                      options[i] = v;
                      const answer = question.answer === old ? v : question.answer;
                      onPatch({ options, answer });
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Кликните по букве, чтобы отметить верный вариант. Кнопка ƒx — вставить LaTeX-формулу.</p>
        </div>
      )}

      {question.type === "bool" && (
        <div className="flex gap-2">
          {(["true", "false"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onPatch({ answer: v })}
              className={`flex-1 rounded-xl border-2 px-4 py-3 text-sm font-bold transition-all ${
                question.answer === v
                  ? v === "true"
                    ? "border-success bg-success-soft text-success"
                    : "border-danger bg-danger-soft text-danger"
                  : "border-border-strong text-muted-foreground hover:border-primary"
              }`}
            >
              {v === "true" ? "✓ Правда" : "✕ Ложь"}
            </button>
          ))}
        </div>
      )}

      {question.type === "text" && (
        <input
          className="input-base"
          placeholder="Правильный ответ (или несколько через запятую)"
          value={question.answer}
          onChange={(e) => onPatch({ answer: e.target.value })}
        />
      )}

      {question.type === "matching" && <MatchingEditor question={question} onPatch={onPatch} />}

      {question.type === "close" && (
        <CloseEditor question={question} qRef={qRef} onPatch={onPatch} />
      )}

      {question.type === "ordering" && <OrderingEditor question={question} onPatch={onPatch} />}

      <div className="flex flex-wrap gap-3">
        <label className="text-xs text-muted-foreground">
          Баллы
          <input
            type="number"
            className="input-base ml-2 inline-block w-20 py-1 text-sm"
            value={question.points}
            onChange={(e) => onPatch({ points: parseInt(e.target.value) || 0 })}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Время (сек)
          <input
            type="number"
            className="input-base ml-2 inline-block w-20 py-1 text-sm"
            value={question.time}
            onChange={(e) => onPatch({ time: parseInt(e.target.value) || 30 })}
          />
        </label>
      </div>
    </div>
  );
}

function MatchingEditor({
  question,
  onPatch,
}: {
  question: QuizQuestion;
  onPatch: (p: Partial<QuizQuestion>) => void;
}) {
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});
  let pairs: { left: string; right: string }[] = [];
  try {
    pairs = JSON.parse(question.answer || "[]");
  } catch {
    pairs = [];
  }
  const setPairs = (next: { left: string; right: string }[]) =>
    onPatch({ answer: JSON.stringify(next) });
  return (
    <div className="space-y-2">
      {pairs.map((p, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface-muted/40 p-2.5 sm:border-0 sm:bg-transparent sm:p-0">
          <div className="mb-2 flex items-center justify-between sm:hidden">
            <span className="text-xs font-semibold text-muted-foreground">Пара {i + 1}</span>
            <button
              onClick={() => setPairs(pairs.filter((_, k) => k !== i))}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger"
              aria-label="Удалить пару"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="grid min-w-0 gap-2 sm:flex sm:items-center">
          <div className="relative min-w-0 flex-1">
            <input
              ref={(el) => { fieldRefs.current[`left-${i}`] = el; }}
              className="input-base min-w-0 pr-12"
              placeholder="Слева"
              value={p.left}
              onChange={(e) => {
                const next = [...pairs];
                next[i] = { ...next[i], left: e.target.value };
                setPairs(next);
              }}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <FormulaButton
                inputRef={{ current: fieldRefs.current[`left-${i}`] } as React.RefObject<HTMLInputElement | null>}
                value={p.left}
                onChange={(value) => {
                  const next = [...pairs];
                  next[i] = { ...next[i], left: value };
                  setPairs(next);
                }}
              />
            </div>
          </div>
          <span className="text-center text-muted-foreground sm:shrink-0">↕</span>
          <div className="relative min-w-0 flex-1">
            <input
              ref={(el) => { fieldRefs.current[`right-${i}`] = el; }}
              className="input-base min-w-0 pr-12"
              placeholder="Справа"
              value={p.right}
              onChange={(e) => {
                const next = [...pairs];
                next[i] = { ...next[i], right: e.target.value };
                setPairs(next);
              }}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <FormulaButton
                inputRef={{ current: fieldRefs.current[`right-${i}`] } as React.RefObject<HTMLInputElement | null>}
                value={p.right}
                onChange={(value) => {
                  const next = [...pairs];
                  next[i] = { ...next[i], right: value };
                  setPairs(next);
                }}
              />
            </div>
          </div>
          </div>
          <button
            onClick={() => setPairs(pairs.filter((_, k) => k !== i))}
            className="hidden rounded-lg p-2 text-muted-foreground hover:bg-danger-soft hover:text-danger sm:block"
            aria-label="Удалить пару"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        onClick={() => setPairs([...pairs, { left: "", right: "" }])}
        className="btn-ghost"
      >
        <Plus className="h-4 w-4" /> Добавить пару
      </button>
    </div>
  );
}

function CloseEditor({
  question,
  qRef,
  onPatch,
}: {
  question: QuizQuestion;
  qRef: React.RefObject<HTMLTextAreaElement | null>;
  onPatch: (p: Partial<QuizQuestion>) => void;
}) {
  let answers: string[] = [];
  try {
    const raw = JSON.parse(question.answer || "[]");
    if (Array.isArray(raw)) answers = raw.map((x) => String(x ?? ""));
  } catch {
    answers = [];
  }
  const blanks = (question.q.match(/___/g) ?? []).length;
  // Синхронизируем длину answers с числом пропусков.
  const setAnswers = (next: string[]) => onPatch({ answer: JSON.stringify(next) });
  const normalized = (() => {
    const a = [...answers];
    while (a.length < blanks) a.push("");
    if (a.length > blanks) a.length = blanks;
    return a;
  })();

  const insertBlank = () => {
    const el = qRef.current;
    const text = question.q;
    let pos = text.length;
    if (el) pos = el.selectionStart ?? text.length;
    const next = text.slice(0, pos) + "___" + text.slice(pos);
    onPatch({ q: next, answer: JSON.stringify([...normalized, ""]) });
    setTimeout(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(pos + 3, pos + 3);
      }
    }, 0);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Используйте <code className="rounded bg-surface-muted px-1">___</code> — на месте пропуска в тексте.
        </p>
        <button type="button" onClick={insertBlank} className="btn-ghost text-xs">
          <Plus className="h-3.5 w-3.5" /> Пропуск
        </button>
      </div>
      {blanks === 0 && (
        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          В тексте пока нет пропусков. Нажмите «+ Пропуск».
        </p>
      )}
      {normalized.map((a, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">
            {i + 1}
          </span>
          <input
            className="input-base"
            placeholder={`Ответ для пропуска ${i + 1}`}
            value={a}
            onChange={(e) => {
              const next = [...normalized];
              next[i] = e.target.value;
              setAnswers(next);
            }}
          />
        </div>
      ))}
    </div>
  );
}

function OrderingEditor({
  question,
  onPatch,
}: {
  question: QuizQuestion;
  onPatch: (p: Partial<QuizQuestion>) => void;
}) {
  let items: string[] = [];
  try {
    const raw = JSON.parse(question.answer || "[]");
    if (Array.isArray(raw)) items = raw.map((x) => String(x ?? ""));
  } catch {
    items = [];
  }
  const setItems = (next: string[]) => onPatch({ answer: JSON.stringify(next) });
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Список сохраняется в правильном порядке. Игроку он покажется перемешанным.
      </p>
      {items.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">
            {i + 1}
          </span>
          <input
            className="input-base"
            placeholder={`Пункт ${i + 1}`}
            value={v}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              setItems(next);
            }}
          />
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="rounded p-1 text-muted-foreground hover:text-primary disabled:opacity-30"
              aria-label="Вверх"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === items.length - 1}
              className="rounded p-1 text-muted-foreground hover:text-primary disabled:opacity-30"
              aria-label="Вниз"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={() => setItems(items.filter((_, k) => k !== i))}
            className="rounded-lg p-2 text-muted-foreground hover:bg-danger-soft hover:text-danger"
            aria-label="Удалить"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button onClick={() => setItems([...items, ""])} className="btn-ghost">
        <Plus className="h-4 w-4" /> Пункт
      </button>
    </div>
  );
}
