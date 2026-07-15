import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Coins, Plus, Trash2 } from "lucide-react";
import { BuilderShell } from "@/components/builder-shell";
import { HelpButton } from "@/components/help-modal";
import { ImageDrop } from "@/lib/image-drop";
import { ThemeSelect } from "@/components/theme-select";
import { FormulaButton } from "@/components/formula-popover";
import { AIHelperButton } from "@/components/ai-helper";
import { CharCounter } from "@/components/char-counter";
import { TagInput } from "@/components/tag-input";

import { LIMITS } from "@/lib/limits";
import { newId, saveGame, loadGame } from "@/lib/storage";
import { useAutoDraft, useDraftPrompt, clearDraft } from "@/hooks/use-draft";
import { DraftBanner } from "@/components/draft-banner";
import { BuilderToolbar, BuilderFabs, BuilderSettingsSection } from "@/components/builder-actions";
import {
  downloadExcelTemplate,
  exportMillionaireExcel,
  importMillionaireXlsx,
  printMillionaire,
} from "@/lib/exports";
import type {
  MilestoneMode,
  MillionaireConfig,
  MillionaireData,
  MillionaireQuestion,
  MoneyScale,
  PlayerTheme,
  PointsMode,
} from "@/lib/types";

export const Route = createFileRoute("/builder/millionaire")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Миллионер — конструктор — IslandQuiz" },
      { name: "description", content: "Создайте лестницу вопросов с несгораемыми суммами и 50:50." },
    ],
  }),
  component: BuilderMillionaire,
});

const LADDERS: Record<MoneyScale, number[]> = {
  easy: [100, 200, 300, 500, 1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 125_000, 250_000, 500_000, 1_000_000].map((n) => n / 10),
  normal: [500, 1_000, 2_000, 3_000, 5_000, 7_500, 10_000, 15_000, 25_000, 50_000, 100_000, 200_000, 400_000, 750_000, 1_000_000],
  hard: [10_000, 25_000, 50_000, 100_000, 200_000, 400_000, 750_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 75_000_000, 100_000_000],
};

function makeQuestion(money: number): MillionaireQuestion {
  return {
    q: "",
    image: "",
    money,
    options: [
      { text: "", correct: true },
      { text: "", correct: false },
      { text: "", correct: false },
      { text: "", correct: false },
    ],
  };
}

function BuilderMillionaire() {
  const { id: urlId } = Route.useSearch();
  const [config, setConfig] = useState<MillionaireConfig>({
    theme: "amber",
    timePerQuestion: 30,
    moneyScale: "normal",
    milestones: "three",
    pointsMode: "classic",
  });
  const [questions, setQuestions] = useState<MillionaireQuestion[]>(
    LADDERS.normal.slice(0, 5).map((m) => makeQuestion(m)),
  );
  const [tags, setTags] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [printAnswers, setPrintAnswers] = useState(true);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">(urlId ? "loading" : "idle");


  useEffect(() => {
    if (!urlId) return;
    try {
      const rec = loadGame<MillionaireData>("millionaire", urlId);
      if (rec) {
        setConfig(rec.data.config);
        setQuestions(rec.data.questions);
        setTags(rec.tags ?? []);
        setSavedId(urlId);
        setLoadState("idle");
      } else setLoadState("error");

    } catch (err) {
      console.error(err);
      setLoadState("error");
    }
  }, [urlId]);

  const draftEnabled = !urlId;
  const draftPrompt = useDraftPrompt<{
    config: MillionaireConfig;
    questions: MillionaireQuestion[];
    tags: string[];
  }>("millionaire", draftEnabled);
  const draftPaused = !draftEnabled || !draftPrompt.checked || !!draftPrompt.draft || !!savedId;
  useAutoDraft("millionaire", { config, questions, tags }, { paused: draftPaused });

  const restoreDraft = () => {
    const d = draftPrompt.draft;
    if (!d) return;
    setConfig(d.data.config);
    setQuestions(d.data.questions);
    setTags(d.data.tags ?? []);
    draftPrompt.accept();
    showToast("Черновик восстановлен");
  };

  const moneyForIndex = (idx: number, scale: MoneyScale, mode: PointsMode): number => {
    const base = LADDERS[scale][idx] ?? LADDERS[scale].at(-1)!;
    if (mode === "double") return base * 2;
    return base;
  };

  const applyScaleAndMode = (scale: MoneyScale, mode: PointsMode) => {
    if (mode === "custom") return;
    setQuestions((prev) => prev.map((q, i) => ({ ...q, money: moneyForIndex(i, scale, mode) })));
  };


  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const addQuestion = () => {
    const nextIdx = questions.length;
    const money = moneyForIndex(nextIdx, config.moneyScale, config.pointsMode ?? "classic");
    setQuestions([...questions, makeQuestion(money)]);
    setTimeout(() => {
      document.getElementById(`mq-${nextIdx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const patchQuestion = (idx: number, patch: Partial<MillionaireQuestion>) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const patchOption = (qIdx: number, oIdx: number, patch: Partial<{ text: string; correct: boolean }>) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i !== qIdx
          ? q
          : {
              ...q,
              options: q.options.map((o, oi) => (oi === oIdx ? { ...o, ...patch } : o)),
            },
      ),
    );
  };

  const markCorrect = (qIdx: number, oIdx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i !== qIdx ? q : { ...q, options: q.options.map((o, oi) => ({ ...o, correct: oi === oIdx })) },
      ),
    );
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if ((config.pointsMode ?? "classic") === "custom") return next;
      return next.map((q, i) => ({ ...q, money: moneyForIndex(i, config.moneyScale, config.pointsMode ?? "classic") }));
    });
  };

  const validate = (): boolean => {
    if (questions.some((q) => !q.q.trim() || !q.options.some((o) => o.correct && o.text.trim()))) {
      showToast("В каждом вопросе укажите текст и верный ответ");
      return false;
    }
    return true;
  };

  const handleSave = (): string | null => {
    if (!validate()) return null;
    const id = savedId ?? newId();
    saveGame<MillionaireData>("millionaire", id, { config, questions }, { tags });

    setSavedId(id);
    clearDraft("millionaire");
    showToast(savedId ? "Изменения сохранены" : "Игра сохранена!");
    return id;
  };

  const handleSaveAsCopy = (): string | null => {
    if (!validate()) return null;
    const id = newId();
    saveGame<MillionaireData>("millionaire", id, { config, questions }, { tags });
    setSavedId(id);
    clearDraft("millionaire");
    showToast("Создана копия");
    return id;
  };

  const handleImport = async (file: File) => {
    try {
      const imported = await importMillionaireXlsx(file);
      if (imported.length) {
        setQuestions(imported);
        showToast(`Загружено вопросов: ${imported.length}`);
      }
    } catch (err) {
      console.error(err);
      showToast("Не удалось прочитать Excel");
    }
  };

  const scrollToQ = (idx: number) => {
    document.getElementById(`mq-${idx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const sidebar = (
    <div className="space-y-1">
      <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Лестница
      </p>
      {questions.map((q, i) => {
        const filled = q.q.trim() && q.options.some((o) => o.correct && o.text.trim());
        return (
          <button
            key={i}
            onClick={() => scrollToQ(i)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface-muted ${
              filled ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <span
              className={`grid h-6 w-6 place-items-center rounded-md font-mono text-[10px] font-bold ${
                filled ? "bg-success-soft text-success" : "bg-surface-muted"
              }`}
            >
              {i + 1}
            </span>
            <span className="truncate">{q.money.toLocaleString("ru-RU")} ₽</span>
          </button>
        );
      })}
      <div className="my-2 border-t border-border" />
      <button onClick={addQuestion} className="btn-ghost w-full justify-center text-xs">
        <Plus className="h-3.5 w-3.5" /> Вопрос
      </button>
    </div>
  );

  const settingsPanel = (
    <div className="space-y-4">
      <h3 className="font-display font-bold">Настройки</h3>
      <div className="grid gap-4">
        <div>
          <span className="mb-2 block text-xs font-semibold text-muted-foreground">Тема плеера</span>
          <ThemeSelect
            value={config.theme}
            onChange={(theme: PlayerTheme) => setConfig({ ...config, theme })}
          />
        </div>
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Время на вопрос (сек)</span>
          <input
            type="number"
            className="input-base"
            value={config.timePerQuestion}
            onChange={(e) => setConfig({ ...config, timePerQuestion: parseInt(e.target.value) || 30 })}
          />
        </label>
      </div>
    </div>
  );

  const advancedSettingsPanel = (
    <div className="grid gap-4">
      <label>
        <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Шкала призов</span>
        <select
          className="input-base"
          value={config.moneyScale}
          onChange={(e) => {
            const scale = e.target.value as MoneyScale;
            setConfig({ ...config, moneyScale: scale });
            applyScaleAndMode(scale, config.pointsMode ?? "classic");
          }}
        >
          <option value="easy">Лёгкая (10-100 000)</option>
          <option value="normal">Средняя (500-1 000 000)</option>
          <option value="hard">Хард (10 000-100 млн)</option>
        </select>
      </label>
      <label>
        <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Режим очков</span>
        <select
          className="input-base"
          value={config.pointsMode ?? "classic"}
          onChange={(e) => {
            const mode = e.target.value as PointsMode;
            setConfig({ ...config, pointsMode: mode });
            applyScaleAndMode(config.moneyScale, mode);
          }}
        >
          <option value="classic">Классический</option>
          <option value="double">Удвоенный (×2)</option>
          <option value="custom">Произвольный (задать вручную)</option>
        </select>
      </label>
      <label>
        <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Несгораемые</span>
        <select
          className="input-base"
          value={config.milestones}
          onChange={(e) => setConfig({ ...config, milestones: e.target.value as MilestoneMode })}
        >
          <option value="classic">Классика (5-я, 10-я)</option>
          <option value="three">Три точки (5-я, 10-я, 15-я)</option>
          <option value="none">Без несгораемых</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={printAnswers}
          onChange={(e) => setPrintAnswers(e.target.checked)}
        />
        Печатать верные ответы (иначе — только вопросы)
      </label>
    </div>
  );

  const toolbar = (
    <div className="flex w-full items-stretch">
      <BuilderToolbar
        kind="millionaire"
        onImportFile={handleImport}
        onDownloadTemplate={() => downloadExcelTemplate("millionaire")}
        onExportExcel={() => exportMillionaireExcel({ config, questions })}
        onPrint={(withAnswers) => printMillionaire({ config, questions }, { withAnswers })}
        printAnswers={printAnswers}
        onToggleSettings={() => setShowSettings((s) => !s)}
        settingsOpen={showSettings}
        settingsPanel={settingsPanel}
        advancedSettingsPanel={advancedSettingsPanel}
      />
    </div>
  );


  if (loadState === "loading") {
    return <div className="min-h-screen grid place-items-center bg-surface text-muted-foreground">Загружаем игру…</div>;
  }
  if (loadState === "error") {
    return (
      <div className="min-h-screen grid place-items-center bg-surface p-6 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold">Игра не найдена</h1>
          <a href="/library" className="btn-accent mt-4 inline-flex">В библиотеку</a>
        </div>
      </div>
    );
  }

  return (
    <BuilderShell
      title="Миллионер"
      subtitle="Лестница вопросов с 4 вариантами, несгораемыми суммами и подсказкой 50:50"
      icon={<Coins className="h-5 w-5" />}
      toolbar={toolbar}
      sidebar={sidebar}
      theme={config.theme}
      extraFabs={
        <>
          <BuilderFabs
            kind="millionaire"
            savedId={savedId}
            onSave={handleSave}
            onSaveAsCopy={handleSaveAsCopy}
          />
          <HelpButton title="Как пользоваться конструктором «Миллионера»">
            <p><b>Лестница:</b> 15 вопросов от лёгких к сложным. Сумма растёт по выбранной шкале.</p>
            <p><b>Верный ответ:</b> кликните по букве A/B/C/D — она станет зелёной.</p>
            <p><b>Несгораемые:</b> в настройках — «Классика», «Три точки» или «Без».</p>
            <p><b>Играть:</b> открывает плеер в новой вкладке.</p>
          </HelpButton>
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
      <div className="surface-card space-y-3 p-6">
        <label className="block">
          <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-muted-foreground">
            Название игры
            <CharCounter value={config.title ?? ""} max={LIMITS.title} />
          </span>
          <input
            className="input-base text-lg font-display font-bold"
            maxLength={LIMITS.title}
            placeholder="Название игры «Миллионер»"
            value={config.title ?? ""}
            onChange={(e) => setConfig({ ...config, title: e.target.value })}
          />
        </label>
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Теги</span>
          <TagInput value={tags} onChange={setTags} />
        </div>
      </div>


      {questions.map((q, idx) => (
        <MillionaireQuestionCard
          key={idx}
          idx={idx}
          q={q}
          topic={config.title ?? ""}
          onRemove={() => removeQuestion(idx)}
          onPatch={(patch) => patchQuestion(idx, patch)}
          onPatchOption={(oi, patch) => patchOption(idx, oi, patch)}
          onMarkCorrect={(oi) => markCorrect(idx, oi)}
        />
      ))}

      <button onClick={addQuestion} className="btn-ghost w-full justify-center py-4">
        <Plus className="h-4 w-4" /> Добавить вопрос
      </button>

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-white shadow-lift">
          {toast}
        </div>
      )}
    </BuilderShell>
  );
}

function MillionaireQuestionCard({
  idx,
  q,
  topic,
  onRemove,
  onPatch,
  onPatchOption,
  onMarkCorrect,
}: {
  idx: number;
  q: MillionaireQuestion;
  topic: string;
  onRemove: () => void;
  onPatch: (patch: Partial<MillionaireQuestion>) => void;
  onPatchOption: (oi: number, patch: Partial<{ text: string; correct: boolean }>) => void;
  onMarkCorrect: (oi: number) => void;
}) {
  const qRef = useRef<HTMLTextAreaElement>(null);
  const optRefs = useRef<(HTMLInputElement | null)[]>([]);
  return (
    <div id={`mq-${idx}`} className="surface-card space-y-3 p-6 scroll-mt-24">
      <div className="flex items-center justify-between">
        <div className="rounded-full bg-amber-soft px-4 py-1.5 text-sm font-bold text-amber">
          Вопрос {idx + 1} · {q.money.toLocaleString("ru-RU")} ₽
        </div>
        <button
          onClick={onRemove}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger"
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
          placeholder="Текст вопроса..."
          value={q.q}
          onChange={(e) => onPatch({ q: e.target.value })}
        />
        <div className="absolute right-2 top-2 flex items-center gap-1">
          <AIHelperButton
            currentValue={q.q}
            topic={topic}
            type="choice"
            format="millionaire"
            onPick={(v) => {
              onPatch({ q: v.question });
              if (v.options && v.options.length === 4) {
                const correctIdx = typeof v.correct === "number" ? v.correct : 0;
                v.options.forEach((opt, oi) => {
                  onPatchOption(oi, { text: opt, correct: oi === correctIdx });
                });
              }
            }}
          />
          <FormulaButton inputRef={qRef} value={q.q} onChange={(v) => onPatch({ q: v })} />
        </div>
        <div className="mt-1 flex justify-end">
          <CharCounter value={q.q} max={LIMITS.question} />
        </div>
      </div>
      <ImageDrop value={q.image} onChange={(image) => onPatch({ image })} />
      <div className="grid gap-2 sm:grid-cols-2">
        {q.options.map((opt, oi) => (
          <div key={oi} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onMarkCorrect(oi)}
              className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-full border-2 text-sm font-bold ${
                opt.correct
                  ? "border-success bg-success text-white"
                  : "border-border-strong text-muted-foreground hover:border-primary"
              }`}
              aria-label="Отметить верным"
            >
              {String.fromCharCode(65 + oi)}
            </button>
            <div className="relative flex-1">
              <input
                ref={(el) => {
                  optRefs.current[oi] = el;
                }}
                className="input-base pr-16"
                maxLength={LIMITS.option}
                placeholder={`Вариант ${String.fromCharCode(65 + oi)}`}
                value={opt.text}
                onChange={(e) => onPatchOption(oi, { text: e.target.value })}
              />
              <div className="pointer-events-none absolute right-9 top-1/2 -translate-y-1/2">
                <CharCounter value={opt.text} max={LIMITS.option} />
              </div>
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                <FormulaButton
                  inputRef={{ current: optRefs.current[oi] } as React.RefObject<HTMLInputElement | null>}
                  value={opt.text}
                  onChange={(v) => onPatchOption(oi, { text: v })}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <label className="text-xs text-muted-foreground">
        Сумма
        <input
          type="number"
          className="input-base ml-2 inline-block w-32 py-1 text-sm"
          value={q.money}
          onChange={(e) => onPatch({ money: parseInt(e.target.value) || 0 })}
        />
      </label>
    </div>
  );
}
