import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Grid3x3,
  Plus,
  Trash2,
  LayoutGrid,
  List,
  Pencil,
} from "lucide-react";
import { BuilderShell } from "@/components/builder-shell";
import { HelpButton } from "@/components/help-modal";
import { FormulaButton } from "@/components/formula-popover";
import { AIHelperButton } from "@/components/ai-helper";
import { AIJeopardyCategoryButton } from "@/components/ai-jeopardy-category";
import { CharCounter } from "@/components/char-counter";
import { TagInput } from "@/components/tag-input";

import { LIMITS } from "@/lib/limits";
import { ImageDrop } from "@/lib/image-drop";
import { ThemeSelect } from "@/components/theme-select";
import { newId, saveGame, loadGame } from "@/lib/storage";
import { useAutoDraft, useDraftPrompt, clearDraft } from "@/hooks/use-draft";
import { DraftBanner } from "@/components/draft-banner";
import { BuilderToolbar, BuilderFabs, BuilderSettingsSection } from "@/components/builder-actions";
import {
  downloadExcelTemplate,
  exportJeopardyExcel,
  importJeopardyXlsx,
  printJeopardy,
} from "@/lib/exports";
import type {
  JeopardyCategory,
  JeopardyConfig,
  JeopardyData,
  JeopardyFinal,
  JeopardyQuestion,
  PlayerTheme,
} from "@/lib/types";

export const Route = createFileRoute("/builder/jeopardy")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Своя игра — конструктор — IslandQuiz" },
      { name: "description", content: "Создавайте раунды, категории и финал для «Своей игры»." },
    ],
  }),
  component: BuilderJeopardy,
});

const DEFAULT_POINTS = [100, 200, 300, 400, 500];

function makeCategory(round: number): JeopardyCategory {
  const step = round === 1 ? 100 : round === 2 ? 200 : 300;
  return {
    category: "",
    questions: DEFAULT_POINTS.map((p) => ({ points: p * (step / 100), q: "", a: "", image: "" })),
  };
}

interface ModalTarget {
  roundIdx: number;
  catIdx: number;
  qIdx: number;
}

function BuilderJeopardy() {
  const { id: urlId } = Route.useSearch();
  const [config, setConfig] = useState<JeopardyConfig>({
    theme: "amber",
    timeBase: 30,
    timeStep: 15,
    timeFinal: 90,
  });
  const [rounds, setRounds] = useState<JeopardyCategory[][]>([
    [makeCategory(1), makeCategory(1), makeCategory(1)],
  ]);
  const [final, setFinal] = useState<JeopardyFinal>({ category: "", q: "", a: "", image: "" });
  const [tags, setTags] = useState<string[]>([]);
  const [mode, setMode] = useState<"list" | "grid">("list");
  const [showSettings, setShowSettings] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalTarget | null>(null);
  const [printAnswers, setPrintAnswers] = useState(true);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">(urlId ? "loading" : "idle");


  useEffect(() => {
    if (!urlId) return;
    try {
      const rec = loadGame<JeopardyData>("jeopardy", urlId);
      if (rec) {
        setConfig(rec.data.config);
        setRounds(rec.data.rounds);
        setFinal(rec.data.final);
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
    config: JeopardyConfig;
    rounds: JeopardyCategory[][];
    final: JeopardyFinal;
    tags: string[];
  }>("jeopardy", draftEnabled);
  const draftPaused = !draftEnabled || !draftPrompt.checked || !!draftPrompt.draft || !!savedId;
  useAutoDraft("jeopardy", { config, rounds, final, tags }, { paused: draftPaused });

  const restoreDraft = () => {
    const d = draftPrompt.draft;
    if (!d) return;
    setConfig(d.data.config);
    setRounds(d.data.rounds);
    setFinal(d.data.final);
    setTags(d.data.tags ?? []);
    draftPrompt.accept();
    showToast("Черновик восстановлен");
  };


  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const addRound = () => {
    setRounds((prev) => [...prev, [makeCategory(prev.length + 1), makeCategory(prev.length + 1)]]);
  };

  const addCategory = (roundIdx: number) => {
    setRounds((prev) =>
      prev.map((r, ri) => {
        if (ri !== roundIdx) return r;
        if (r.length >= LIMITS.jeopardyCategoriesPerRound) {
          showToast(`Максимум ${LIMITS.jeopardyCategoriesPerRound} категорий в раунде`);
          return r;
        }
        return [...r, makeCategory(roundIdx + 1)];
      }),
    );
  };

  const addQuestion = (roundIdx: number, catIdx: number) => {
    setRounds((prev) =>
      prev.map((r, ri) => {
        if (ri !== roundIdx) return r;
        return r.map((c, ci) => {
          if (ci !== catIdx) return c;
          if (c.questions.length >= LIMITS.jeopardyQuestionsPerCategory) {
            showToast(`Максимум ${LIMITS.jeopardyQuestionsPerCategory} вопросов в категории`);
            return c;
          }
          const step = roundIdx === 0 ? 100 : roundIdx === 1 ? 200 : 300;
          const usedPoints = new Set(c.questions.map((q) => q.points));
          const nextPts =
            DEFAULT_POINTS.map((p) => p * (step / 100)).find((p) => !usedPoints.has(p)) ??
            (c.questions.reduce((m, q) => Math.max(m, q.points), 0) + step);
          return {
            ...c,
            questions: [...c.questions, { points: nextPts, q: "", a: "", image: "" }],
          };
        });
      }),
    );
  };

  const removeQuestion = (roundIdx: number, catIdx: number, qIdx: number) => {
    setRounds((prev) =>
      prev.map((r, ri) => {
        if (ri !== roundIdx) return r;
        return r.map((c, ci) => {
          if (ci !== catIdx) return c;
          if (c.questions.length <= 1) return c;
          return { ...c, questions: c.questions.filter((_, qi) => qi !== qIdx) };
        });
      }),
    );
  };

  const updateCategory = (roundIdx: number, catIdx: number, patch: Partial<JeopardyCategory>) => {
    setRounds((prev) =>
      prev.map((r, ri) =>
        ri !== roundIdx ? r : r.map((c, ci) => (ci === catIdx ? { ...c, ...patch } : c)),
      ),
    );
  };

  const updateQuestion = (
    roundIdx: number,
    catIdx: number,
    qIdx: number,
    patch: Partial<JeopardyQuestion>,
  ) => {
    setRounds((prev) =>
      prev.map((r, ri) =>
        ri !== roundIdx
          ? r
          : r.map((c, ci) =>
              ci !== catIdx
                ? c
                : {
                    ...c,
                    questions: c.questions.map((q, qi) => (qi === qIdx ? { ...q, ...patch } : q)),
                  },
            ),
      ),
    );
  };

  const removeCategory = (roundIdx: number, catIdx: number) => {
    setRounds((prev) => prev.map((r, ri) => (ri === roundIdx ? r.filter((_, ci) => ci !== catIdx) : r)));
  };

  const removeRound = (roundIdx: number) => {
    setRounds((prev) => prev.filter((_, ri) => ri !== roundIdx));
  };

  const handleSave = (): string | null => {
    const id = savedId ?? newId();
    const data: JeopardyData = { config, rounds, final };
    saveGame<JeopardyData>("jeopardy", id, data, { tags });
    setSavedId(id);
    clearDraft("jeopardy");
    showToast(savedId ? "Изменения сохранены" : "Игра сохранена!");
    return id;
  };

  const handleSaveAsCopy = (): string | null => {
    const id = newId();
    saveGame<JeopardyData>("jeopardy", id, { config, rounds, final }, { tags });
    setSavedId(id);
    clearDraft("jeopardy");
    showToast("Создана копия");
    return id;
  };


  const handleImport = async (file: File) => {
    try {
      const { rounds: nextRounds, final: nextFinal } = await importJeopardyXlsx(file);
      if (nextRounds.length) setRounds(nextRounds);
      if (nextFinal) setFinal(nextFinal);
      showToast(`Загружено раундов: ${nextRounds.length}`);
    } catch (err) {
      console.error(err);
      showToast("Не удалось прочитать Excel");
    }
  };

  const sidebar = useMemo(
    () => (
      <div className="space-y-2">
        {rounds.map((round, ri) => (
          <div key={ri}>
            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  document
                    .getElementById(`round-${ri}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                className="flex-1 truncate rounded-lg bg-primary px-3 py-2 text-left text-xs font-bold text-primary-foreground"
              >
                {config.roundTitles?.[ri]?.trim() || `Раунд ${ri + 1}`}
              </button>
              <button
                onClick={() => addCategory(ri)}
                disabled={round.length >= LIMITS.jeopardyCategoriesPerRound}
                aria-label="Добавить категорию"
                title={
                  round.length >= LIMITS.jeopardyCategoriesPerRound
                    ? `Максимум ${LIMITS.jeopardyCategoriesPerRound} категорий`
                    : "Добавить категорию"
                }
                className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md border border-border-strong bg-surface text-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-1 space-y-0.5 pl-2">
              {round.map((cat, ci) => (
                <button
                  key={ci}
                  onClick={() =>
                    document
                      .getElementById(`cat-${ri}-${ci}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                  className="block w-full truncate rounded px-2 py-1 text-left text-[11px] text-muted-foreground hover:bg-surface-muted"
                >
                  {cat.category || `Категория ${ci + 1}`}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button
          onClick={addRound}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-primary/40 bg-primary-soft px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10"
        >
          <Plus className="h-3.5 w-3.5" /> Раунд
        </button>
        <button
          onClick={() => document.getElementById("final-block")?.scrollIntoView({ behavior: "smooth" })}
          className="w-full rounded-lg border border-amber/30 bg-amber-soft px-3 py-2 text-center text-xs font-bold text-amber"
        >
          Финал
        </button>
      </div>
    ),
    [rounds, config.roundTitles],
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
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Базовое время (сек)</span>
          <input
            type="number"
            className="input-base"
            value={config.timeBase}
            onChange={(e) => setConfig({ ...config, timeBase: parseInt(e.target.value) || 30 })}
          />
        </label>
      </div>
    </div>
  );

  const advancedSettingsPanel = (
    <div className="grid gap-4">
      <label>
        <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Шаг времени (сек)</span>
        <input
          type="number"
          className="input-base"
          value={config.timeStep}
          onChange={(e) => setConfig({ ...config, timeStep: parseInt(e.target.value) || 0 })}
        />
      </label>
      <label>
        <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Таймер финала (сек)</span>
        <input
          type="number"
          className="input-base"
          value={config.timeFinal}
          onChange={(e) => setConfig({ ...config, timeFinal: parseInt(e.target.value) || 90 })}
        />
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

  const modeButton = (
    <button
      className="btn-ghost"
      onClick={() => setMode((m) => (m === "list" ? "grid" : "list"))}
      aria-label={mode === "list" ? "Плитки" : "Список"}
      title={mode === "list" ? "Плитки" : "Список"}
    >
      {mode === "list" ? <LayoutGrid className="h-4 w-4 shrink-0" /> : <List className="h-4 w-4 shrink-0" />}
      <span className="hidden md:inline">{mode === "list" ? "Плитки" : "Список"}</span>
    </button>
  );

  const toolbar = (
    <div className="flex w-full items-stretch">
      <BuilderToolbar
        kind="jeopardy"
        onImportFile={handleImport}
        onDownloadTemplate={() => downloadExcelTemplate("jeopardy")}
        onExportExcel={() => exportJeopardyExcel({ config, rounds, final })}
        onPrint={(withAnswers) => printJeopardy({ config, rounds, final }, { withAnswers })}
        printAnswers={printAnswers}
        onToggleSettings={() => setShowSettings((s) => !s)}
        settingsOpen={showSettings}
        settingsPanel={settingsPanel}
        advancedSettingsPanel={advancedSettingsPanel}
        extraButtons={modeButton}
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
      title="Своя игра"
      subtitle="Раунды, категории, стоимость вопросов и финальный вопрос со ставками"
      icon={<Grid3x3 className="h-5 w-5" />}
      toolbar={toolbar}
      sidebar={mode === "list" ? sidebar : undefined}
      theme={config.theme}
      extraFabs={
        <>
          <BuilderFabs
            kind="jeopardy"
            savedId={savedId}
            onSave={handleSave}
            onSaveAsCopy={handleSaveAsCopy}
          />
          <HelpButton title="Как пользоваться конструктором Своей игры">
            <p><b>Раунды и категории:</b> в раунде — несколько категорий, в каждой 5 вопросов разной стоимости.</p>
            <p><b>Плитки / Список:</b> переключайте вид кнопкой в тулбаре.</p>
            <p><b>Финал:</b> отдельный вопрос со ставками команд.</p>
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
            placeholder="Название «Своей игры»"
            value={config.title ?? ""}
            onChange={(e) => setConfig({ ...config, title: e.target.value })}
          />
        </label>
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Теги</span>
          <TagInput value={tags} onChange={setTags} />
        </div>
      </div>



      {rounds.map((round, ri) => (
        <section key={ri} id={`round-${ri}`} className="surface-card space-y-4 p-6 scroll-mt-24">
          <div className="flex items-center gap-2">
            <input
              className="input-base flex-1 font-display text-xl font-black text-primary"
              placeholder={`Раунд ${ri + 1}`}
              maxLength={LIMITS.title}
              value={config.roundTitles?.[ri] ?? ""}
              onChange={(e) => {
                const next = [...(config.roundTitles ?? [])];
                while (next.length < rounds.length) next.push("");
                next[ri] = e.target.value;
                setConfig({ ...config, roundTitles: next });
              }}
            />
            {rounds.length > 1 && (
              <button
                onClick={() => removeRound(ri)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger"
                aria-label="Удалить раунд"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>


          {mode === "grid" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {round.map((cat, ci) => (
                <div key={ci} id={`cat-${ri}-${ci}`} className="rounded-2xl border border-border bg-surface-muted p-3">
                  <div className="mb-1 flex items-center gap-1">
                    <input
                      className="input-base bg-white text-center font-bold"
                      placeholder={`Категория ${ci + 1}`}
                      maxLength={LIMITS.category}
                      value={cat.category}
                      onChange={(e) => updateCategory(ri, ci, { category: e.target.value })}
                    />
                    <AIJeopardyCategoryButton
                      categoryName={cat.category}
                      gameTopic={config.title}
                      emptySlots={cat.questions.filter((q) => !q.q.trim()).map((q) => q.points)}
                      onPickCategory={(name) => updateCategory(ri, ci, { category: name })}
                      onFillQuestions={(items) => {
                        items.forEach((it) => {
                          const qi = cat.questions.findIndex((q) => q.points === it.points && !q.q.trim());
                          if (qi >= 0) updateQuestion(ri, ci, qi, { q: it.q, a: it.a });
                        });
                      }}
                    />
                  </div>
                  <div className="mb-2 flex justify-end">
                    <CharCounter value={cat.category} max={LIMITS.category} />
                  </div>
                  <div
                    className="grid gap-1"
                    style={{ gridTemplateRows: `repeat(${LIMITS.jeopardyQuestionsPerCategory}, minmax(0, 1fr))` }}
                  >
                    {Array.from({ length: LIMITS.jeopardyQuestionsPerCategory }).map((_, qi) => {
                      const q = cat.questions[qi];
                      if (!q) {
                        return (
                          <div
                            key={`empty-${qi}`}
                            className="rounded-lg border-2 border-dashed border-border/40 py-2 opacity-30"
                          />
                        );
                      }
                      return (
                        <div key={qi} className="group relative">
                          <button
                            onClick={() => setModal({ roundIdx: ri, catIdx: ci, qIdx: qi })}
                            className={`w-full rounded-lg border-2 py-2 text-sm font-bold transition-all ${
                              q.q
                                ? "border-success bg-success-soft text-success"
                                : "border-border-strong bg-white text-primary hover:border-primary"
                            }`}
                          >
                            {q.points}
                          </button>
                          {cat.questions.length > 1 && (
                            <button
                              onClick={() => removeQuestion(ri, ci, qi)}
                              className="absolute right-1 top-1 hidden rounded p-0.5 text-muted-foreground hover:bg-danger-soft hover:text-danger group-hover:block"
                              aria-label="Удалить вопрос"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => addQuestion(ri, ci)}
                    disabled={cat.questions.length >= LIMITS.jeopardyQuestionsPerCategory}
                    className="mt-1 w-full rounded p-1 text-[11px] text-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    + вопрос
                  </button>
                  <button
                    onClick={() => removeCategory(ri, ci)}
                    className="mt-2 w-full rounded p-1 text-[11px] text-muted-foreground hover:text-danger"
                  >
                    Удалить категорию
                  </button>
                </div>
              ))}
            </div>

          ) : (
            <div className="space-y-4">
              {round.map((cat, ci) => (
                <div key={ci} id={`cat-${ri}-${ci}`} className="rounded-2xl border border-border p-4 scroll-mt-24">
                  <div className="mb-3 flex gap-2">
                    <div className="flex-1">
                      <input
                        className="input-base font-bold"
                        placeholder={`Категория ${ci + 1}`}
                        maxLength={LIMITS.category}
                        value={cat.category}
                        onChange={(e) => updateCategory(ri, ci, { category: e.target.value })}
                      />
                      <div className="mt-1 flex justify-end">
                        <CharCounter value={cat.category} max={LIMITS.category} />
                      </div>
                    </div>
                    <div className="flex h-10 items-center">
                      <AIJeopardyCategoryButton
                        categoryName={cat.category}
                        gameTopic={config.title}
                        emptySlots={cat.questions.filter((q) => !q.q.trim()).map((q) => q.points)}
                        onPickCategory={(name) => updateCategory(ri, ci, { category: name })}
                        onFillQuestions={(items) => {
                          items.forEach((it) => {
                            const qi = cat.questions.findIndex((q) => q.points === it.points && !q.q.trim());
                            if (qi >= 0) updateQuestion(ri, ci, qi, { q: it.q, a: it.a });
                          });
                        }}
                      />
                    </div>
                    <button
                      onClick={() => removeCategory(ri, ci)}
                      className="h-10 rounded-lg p-2 text-muted-foreground hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {cat.questions.map((q, qi) => (
                      <div key={qi} className="flex flex-wrap items-center gap-2">
                        <span className="grid h-10 w-16 flex-shrink-0 place-items-center rounded-lg bg-primary font-bold text-primary-foreground">
                          {q.points}
                        </span>
                        <div className="flex-1">
                          <input
                            className="input-base"
                            placeholder="Вопрос"
                            maxLength={LIMITS.question}
                            value={q.q}
                            onChange={(e) => updateQuestion(ri, ci, qi, { q: e.target.value })}
                          />
                          <div className="mt-0.5 flex justify-end">
                            <CharCounter value={q.q} max={LIMITS.question} />
                          </div>
                        </div>
                        <input
                          className="input-base flex-1"
                          placeholder="Ответ"
                          maxLength={LIMITS.option}
                          value={q.a}
                          onChange={(e) => updateQuestion(ri, ci, qi, { a: e.target.value })}
                        />
                        <button
                          onClick={() => setModal({ roundIdx: ri, catIdx: ci, qIdx: qi })}
                          className="rounded-lg border border-border-strong bg-white p-2 hover:border-primary"
                          aria-label="Подробно"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {cat.questions.length > 1 && (
                          <button
                            onClick={() => removeQuestion(ri, ci, qi)}
                            className="rounded-lg p-2 text-muted-foreground hover:bg-danger-soft hover:text-danger"
                            aria-label="Удалить вопрос"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => addQuestion(ri, ci)}
                      disabled={cat.questions.length >= LIMITS.jeopardyQuestionsPerCategory}
                      className="btn-ghost w-full justify-center text-xs disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" /> Вопрос
                      {cat.questions.length >= LIMITS.jeopardyQuestionsPerCategory
                        ? ` (макс ${LIMITS.jeopardyQuestionsPerCategory})`
                        : ""}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => addCategory(ri)}
            disabled={round.length >= LIMITS.jeopardyCategoriesPerRound}
            className="btn-ghost w-full justify-center disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Категория
            {round.length >= LIMITS.jeopardyCategoriesPerRound
              ? ` (макс ${LIMITS.jeopardyCategoriesPerRound})`
              : ""}
          </button>
        </section>
      ))}

      <button onClick={addRound} className="btn-ghost w-full justify-center py-4">
        <Plus className="h-4 w-4" /> Добавить раунд
      </button>

      <section id="final-block" className="surface-card space-y-3 border-2 border-amber/30 p-6 scroll-mt-24">
        <h2 className="font-display text-xl font-black text-amber">Финал</h2>
        <div>
          <input
            className="input-base"
            placeholder="Категория финала"
            maxLength={LIMITS.category}
            value={final.category}
            onChange={(e) => setFinal({ ...final, category: e.target.value })}
          />
          <div className="mt-1 flex justify-end">
            <CharCounter value={final.category} max={LIMITS.category} />
          </div>
        </div>
        <div>
          <textarea
            rows={2}
            className="input-base"
            placeholder="Финальный вопрос"
            maxLength={LIMITS.question}
            value={final.q}
            onChange={(e) => setFinal({ ...final, q: e.target.value })}
          />
          <div className="mt-1 flex justify-end">
            <CharCounter value={final.q} max={LIMITS.question} />
          </div>
        </div>
        <input
          className="input-base"
          placeholder="Правильный ответ"
          maxLength={LIMITS.option}
          value={final.a}
          onChange={(e) => setFinal({ ...final, a: e.target.value })}
        />
        <ImageDrop value={final.image} onChange={(image) => setFinal({ ...final, image })} />
      </section>

      {modal && (
        <QuestionModal
          data={rounds[modal.roundIdx][modal.catIdx].questions[modal.qIdx]}
          topic={rounds[modal.roundIdx][modal.catIdx].category || config.title || ""}
          onClose={() => setModal(null)}
          onSave={(patch) => {
            updateQuestion(modal.roundIdx, modal.catIdx, modal.qIdx, patch);
            setModal(null);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-white shadow-lift">
          {toast}
        </div>
      )}
    </BuilderShell>
  );
}

function QuestionModal({
  data,
  topic,
  onClose,
  onSave,
}: {
  data: JeopardyQuestion;
  topic: string;
  onClose: () => void;
  onSave: (patch: Partial<JeopardyQuestion>) => void;
}) {
  const [q, setQ] = useState(data.q);
  const [a, setA] = useState(data.a);
  const [image, setImage] = useState(data.image ?? "");
  const qRef = useRef<HTMLTextAreaElement>(null);
  const aRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg animate-fade-up rounded-3xl bg-surface p-6 shadow-lift">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Вопрос за {data.points}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
        <div className="space-y-3">
          <div className="relative">
            <textarea
              ref={qRef}
              rows={3}
              maxLength={LIMITS.question}
              className="input-base pr-20"
              placeholder="Текст вопроса"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="absolute right-2 top-2 flex items-center gap-1">
              <AIHelperButton
                currentValue={q}
                topic={topic}
                format="jeopardy"
                onPick={(v) => setQ(v.question)}
              />
              <FormulaButton inputRef={qRef} value={q} onChange={setQ} />
            </div>
            <div className="mt-1 flex justify-end">
              <CharCounter value={q} max={LIMITS.question} />
            </div>
          </div>
          <div className="relative">
            <input
              ref={aRef}
              className="input-base pr-20"
              maxLength={LIMITS.option}
              placeholder="Ответ"
              value={a}
              onChange={(e) => setA(e.target.value)}
            />
            <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
              <AIHelperButton
                currentValue={a}
                topic={topic}
                format="jeopardy-answer"
                onPick={(v) => setA(v.correctAnswer ?? v.question)}
              />
              <FormulaButton inputRef={aRef} value={a} onChange={setA} />
            </div>
          </div>
          <ImageDrop value={image} onChange={setImage} />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">
            Отмена
          </button>
          <button onClick={() => onSave({ q, a, image })} className="btn-primary bg-primary">
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
