import { Link } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { Children, cloneElement, isValidElement, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Save,
  Play,
  ChevronDown,
  Upload,
  FileSpreadsheet,
  Printer,
  Settings2,
  FileText,
  X,
  Copy,
  Lock,
  Link2,
  Globe,
  LoaderCircle,
  MoreHorizontal,
  BarChart3,
  AlertTriangle,
} from "lucide-react";
import { findGame, setGameVisibility as apiSetGameVisibility } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { PlayModal } from "@/components/play-modal";
import { HelpButton } from "@/components/help-modal";
import { cn } from "@/lib/utils";
import type { GameKind, GameVisibility } from "@/lib/types";

// ---------- Toolbar (Import / Export / Settings) ----------

interface ToolbarProps {
  kind: GameKind;
  onImportFile: (file: File) => void;
  onDownloadTemplate: () => void;
  onExportExcel: () => void;
  onPrint: (withAnswers: boolean) => void;
  printAnswers: boolean;
  onToggleSettings: () => void;
  settingsOpen?: boolean;
  settingsPanel?: ReactNode;
  /** Optional advanced settings; shown behind an "Ещё" toggle on desktop. Hidden on mobile. */
  advancedSettingsPanel?: ReactNode;
  /** Additional buttons rendered inside the toolbar row. On mobile they stretch with the main buttons; on desktop they sit at the right end of the deck. */
  extraButtons?: ReactNode;
  className?: string;
}

export function BuilderToolbar({
  kind: _kind,
  onImportFile,
  onDownloadTemplate,
  onExportExcel,
  onPrint,
  printAnswers,
  onToggleSettings,
  settingsOpen,
  settingsPanel,
  advancedSettingsPanel,
  extraButtons,
  className,
}: ToolbarProps) {
  // settingsPanel / advancedSettingsPanel are intentionally unused here; settings render as a section under the toolbar, not as a dropdown.
  void settingsPanel;
  void advancedSettingsPanel;
  const [openImport, setOpenImport] = useState(false);
  const [openExport, setOpenExport] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setOpenExport(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className={cn("relative hidden w-full flex-nowrap items-stretch gap-1 md:flex", className)}>
      <button
        className="btn-ghost hidden flex-1 items-center justify-center gap-2 md:flex md:justify-start"
        onClick={() => setOpenImport(true)}
        aria-label="Импорт"
        title="Импорт"
      >
        <Upload className="h-4 w-4 shrink-0" />
        <span className="hidden md:inline">Импорт</span>
      </button>

      <div ref={exportRef} className="relative flex flex-1">
        <button
          className="btn-ghost flex w-full items-center justify-center gap-2 md:justify-start"
          onClick={() => setOpenExport((v) => !v)}
          aria-label="Экспорт"
          title="Экспорт"
        >
          <FileSpreadsheet className="h-4 w-4 shrink-0" />
          <span className="hidden md:inline">Экспорт</span>
          <ChevronDown className="hidden h-3.5 w-3.5 md:inline" />
        </button>
        {openExport && (
          <div className="absolute right-0 top-full z-[90] mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-lift">
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted"
              onClick={() => {
                setOpenExport(false);
                onExportExcel();
              }}
            >
              <FileSpreadsheet className="h-4 w-4 text-primary" /> Скачать Excel (.xlsx)
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted"
              onClick={() => {
                setOpenExport(false);
                onPrint(printAnswers);
              }}
            >
              <Printer className="h-4 w-4 text-primary" /> Печать / PDF (
              {printAnswers ? "с ответами" : "без ответов"})
            </button>
          </div>
        )}
      </div>

      <button
        className="btn-ghost flex flex-1 items-center justify-center gap-2 md:justify-start"
        onClick={onToggleSettings}
        aria-label="Настройки"
        title="Настройки"
        aria-expanded={!!settingsOpen}
      >
        <Settings2 className="h-4 w-4 shrink-0" />
        <span className="hidden md:inline">Настройки</span>
      </button>


      {extraButtons && (
        <div className="flex flex-1 items-stretch justify-center gap-1 md:flex-initial">
          {Children.map(extraButtons, (child) =>
            isValidElement(child)
              ? cloneElement(child as ReactElement<{ className?: string }>, {
                  className: cn(
                    "flex-1 md:flex-initial justify-center md:justify-start",
                    (child as ReactElement<{ className?: string }>).props.className
                  ),
                })
              : child
          )}
        </div>
      )}

      {openImport && (
        <ImportModal
          onClose={() => setOpenImport(false)}
          onFile={(f) => {
            onImportFile(f);
            setOpenImport(false);
          }}
          onDownloadTemplate={onDownloadTemplate}
        />
      )}
    </div>
  );
}

export function BuilderSettingsSection({
  panel,
  advancedPanel,
  onClose,
}: {
  panel: ReactNode;
  advancedPanel?: ReactNode;
  onClose?: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 767px)").matches) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const content = (
    <>
      {onClose && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
            aria-label="Закрыть настройки"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {panel}
      {advancedPanel && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
            />
            {showAdvanced ? "Скрыть расширенные" : "Ещё · расширенные настройки"}
          </button>
          {showAdvanced && <div className="mt-3 border-t border-border pt-3">{advancedPanel}</div>}
        </div>
      )}
    </>
  );

  return (
    <>
      <div className="surface-card animate-fade-up hidden space-y-4 p-4 sm:p-6 md:block md:max-h-none md:overflow-visible">{content}</div>
      <div className="fixed inset-0 z-[70] flex items-end bg-foreground/50 p-0 backdrop-blur-sm md:hidden" role="dialog" aria-modal="true" aria-label="Настройки игры">
        <div className="max-h-[calc(100dvh-4.5rem)] w-full overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lift">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />
          {content}
        </div>
      </div>
    </>
  );
}

export function BuilderGameInfoSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <section className="surface-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Об игре</span>
            <span className="mt-0.5 block truncate text-sm font-semibold">{title || "Без названия"}</span>
          </span>
        </button>
      </div>
      {open && <div className="space-y-3 p-4 sm:p-6">{children}</div>}
    </section>
  );
}




function ImportModal({
  onClose,
  onFile,
  onDownloadTemplate,
}: {
  onClose: () => void;
  onFile: (f: File) => void;
  onDownloadTemplate: () => void;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-fade-up rounded-3xl bg-surface p-6 shadow-lift">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Импорт из Excel</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
            drag ? "border-primary bg-primary-soft" : "border-border-strong bg-surface-muted"
          }`}
        >
          <Upload className="h-8 w-8 text-primary" />
          <p className="text-sm font-semibold">Перетащите Excel сюда</p>
          <p className="text-xs text-muted-foreground">или кликните, чтобы выбрать файл</p>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.currentTarget.value = "";
            }}
          />
        </label>

        <button
          className="mt-4 flex w-full items-center justify-center gap-2 text-sm text-primary hover:underline"
          onClick={onDownloadTemplate}
        >
          <FileText className="h-4 w-4" /> Нет шаблона? Скачать шаблон
        </button>
      </div>
    </div>
  );
}

// ---------- FABs: Save (split) + Visibility + Play ----------

interface FabsProps {
  kind: GameKind;
  savedId: string | null;
  title: string;
  visibility: GameVisibility;
  saveState?: BuilderSaveState;
  onVisibilityChange: (visibility: GameVisibility) => void;
  onSave: () => string | null | Promise<string | null>;
  onSaveAsCopy: () => string | null | Promise<string | null>;
  onSettings: () => void;
  onBack?: () => void;
  onImportFile?: (file: File) => void;
  onDownloadTemplate?: () => void;
  onExportExcel?: () => void;
  onPrint?: (withAnswers: boolean) => void;
  printAnswers?: boolean;
  onResults?: () => void;
  onViewToggle?: () => void;
  viewLabel?: string;
  onDelete?: () => void;
  helpTitle?: string;
  helpContent?: ReactNode;
  themeAccent?: string;
}

export type BuilderSaveState = "saved" | "dirty" | "saving" | "error";

export function BuilderFabs({
  kind,
  savedId,
  title,
  visibility,
  saveState = "dirty",
  onVisibilityChange,
  onSave,
  onSaveAsCopy,
  onSettings,
  onBack,
  onImportFile,
  onDownloadTemplate,
  onExportExcel,
  onPrint,
  printAnswers = true,
  onResults,
  onViewToggle,
  viewLabel,
  onDelete,
  helpTitle,
  helpContent,
  themeAccent,
}: FabsProps) {
  const { user } = useAuth();
  const [openSaveMenu, setOpenSaveMenu] = useState(false);
  const [openPlay, setOpenPlay] = useState(false);
  const [visOpen, setVisOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [mobileImportOpen, setMobileImportOpen] = useState(false);
  const [actionState, setActionState] = useState<BuilderSaveState>(saveState);
  const saveRef = useRef<HTMLDivElement>(null);
  const visRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (saveState !== "dirty" || actionState !== "error") setActionState(saveState);
  }, [saveState]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (saveRef.current && !saveRef.current.contains(e.target as Node)) setOpenSaveMenu(false);
      if (visRef.current && !visRef.current.contains(e.target as Node)) setVisOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Load current visibility from saved game
  useEffect(() => {
    if (savedId) {
      findGame(savedId).then(g => {
        if (g?.visibility) {
          onVisibilityChange(g.visibility);
        }
      });
    }
  }, [savedId, onVisibilityChange]);

  const changeVisibility = async (v: GameVisibility) => {
    if (!user && v !== "private") return;
    onVisibilityChange(v);
    setVisOpen(false);
    if (savedId && user) await apiSetGameVisibility(savedId, v);
  };

  const performSave = async (save: typeof onSave = onSave) => {
    setActionState("saving");
    try {
      const id = await save();
      setActionState(id ? "saved" : "error");
      return id;
    } catch {
      setActionState("error");
      return null;
    }
  };

  const handlePlay = async () => {
    const id = await performSave();
    if (id) setOpenPlay(true);
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      window.history.back();
    }
  };

  const visOptions: Array<{ v: GameVisibility; label: string; Icon: typeof Lock; disabled?: boolean }> = [
    { v: "private", label: "Только я", Icon: Lock },
    { v: "link", label: "По ссылке", Icon: Link2, disabled: !user },
    { v: "public", label: "Публичная", Icon: Globe, disabled: !user },
  ];
  const current = visOptions.find((o) => o.v === visibility) ?? visOptions[0];
  const CurrentIcon = current.Icon;
  const mobilePublic = visibility !== "private";
  const status = {
    saved: { label: "Сохранено", Icon: Check, className: "text-success" },
    dirty: { label: "Не сохранено", Icon: AlertCircle, className: "text-amber" },
    saving: { label: "Сохранение…", Icon: LoaderCircle, className: "animate-spin text-primary" },
    error: { label: "Ошибка сохранения", Icon: AlertCircle, className: "text-danger" },
  }[actionState];
  const StatusIcon = status.Icon;

  return (
    <>
      <div className="builder-mobile-header fixed inset-x-0 top-16 z-40 border-b border-border bg-surface/95 px-3 py-2 shadow-soft backdrop-blur-md md:hidden">
        <div className="mx-auto flex h-10 max-w-7xl items-center gap-1.5">
          <Link
            to="/library"
            onClick={(event) => {
              if (!onBack) return;
              event.preventDefault();
              handleBack();
            }}
            aria-label="Назад"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-surface-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{title}</p>
            <span className={`flex items-center gap-1 text-[10px] font-semibold ${status.className}`}>
              <StatusIcon className="h-3 w-3" /> {status.label}
            </span>
          </div>
          <div className="flex shrink-0 rounded-lg border border-border bg-background p-0.5" role="group" aria-label="Видимость игры">
            <button
              type="button"
              onClick={() => void changeVisibility("private")}
              aria-label="Приватная"
              aria-pressed={!mobilePublic}
              className={`grid h-8 w-8 place-items-center rounded-md ${!mobilePublic ? "bg-primary-soft text-primary" : "text-muted-foreground"}`}
            >
              <Lock className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void changeVisibility("public")}
              disabled={!user}
              aria-label="Публичная"
              aria-pressed={mobilePublic}
              className={`grid h-8 w-8 place-items-center rounded-md ${mobilePublic ? "bg-primary-soft text-primary" : "text-muted-foreground"} ${!user ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <Globe className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => void performSave()}
            aria-label="Сохранить"
            title={status.label}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-foreground text-white hover:opacity-90"
          >
            <Save className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void handlePlay()}
            aria-label="Играть"
            title="Играть"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground hover:opacity-90"
          >
            <Play className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onSettings}
            aria-label="Настройки"
            title="Настройки"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-surface-muted"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setMobileMoreOpen((v) => !v)}
            aria-label="Дополнительные действия"
            aria-expanded={mobileMoreOpen}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground hover:bg-surface-muted"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
        {mobileMoreOpen && (
          <div className="mx-auto mt-2 max-w-7xl overflow-hidden rounded-xl border border-border bg-background shadow-soft">
            {onImportFile && (
              <button
                type="button"
                onClick={() => {
                  setMobileMoreOpen(false);
                  setMobileImportOpen(true);
                }}
                className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface-muted"
              >
                <Upload className="h-4 w-4 text-primary" /> Импорт
              </button>
            )}
            {onExportExcel && (
              <button type="button" onClick={() => { setMobileMoreOpen(false); onExportExcel(); }} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface-muted">
                <FileSpreadsheet className="h-4 w-4 text-primary" /> Экспорт в Excel
              </button>
            )}
            {onPrint && (
              <button type="button" onClick={() => { setMobileMoreOpen(false); onPrint(printAnswers); }} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface-muted">
                <Printer className="h-4 w-4 text-primary" /> Печать / PDF
              </button>
            )}
            {onResults && savedId && (
              <button type="button" onClick={() => { setMobileMoreOpen(false); onResults(); }} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface-muted">
                <BarChart3 className="h-4 w-4 text-primary" /> Результаты
              </button>
            )}
            {onViewToggle && viewLabel && (
              <button type="button" onClick={() => { setMobileMoreOpen(false); onViewToggle(); }} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface-muted">
                <MoreHorizontal className="h-4 w-4 text-primary" /> Вид: {viewLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMobileMoreOpen(false);
                void performSave(onSaveAsCopy);
              }}
              className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface-muted"
            >
              <Copy className="h-4 w-4 text-primary" /> Создать копию
            </button>
            {helpContent && (
              <HelpButton inline title={helpTitle}>
                {helpContent}
              </HelpButton>
            )}
            {onDelete && savedId && (
              <button type="button" onClick={() => { setMobileMoreOpen(false); onDelete(); }} className="flex min-h-11 w-full items-center gap-2 border-t border-border px-3 text-left text-sm text-danger hover:bg-danger-soft">
                <AlertTriangle className="h-4 w-4" /> Удалить игру
              </button>
            )}
          </div>
        )}
      </div>
      <div className="fixed bottom-20 right-4 left-4 z-40 hidden items-center justify-end gap-1.5 sm:bottom-6 sm:right-6 sm:left-auto sm:gap-2 md:flex">
        {/* Visibility */}
        <div ref={visRef} className="relative" data-visibility={visibility}>
          <button
            type="button"
            onClick={() => setVisOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-2 text-xs font-semibold shadow-lift hover:bg-surface-muted sm:px-3"
            title="Видимость игры"
          >
            <CurrentIcon className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">{current.label}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
          {visOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-48 overflow-hidden rounded-xl border border-border bg-surface shadow-lift">
              {visOptions.map(({ v, label, Icon, disabled }) => (
                <button
                  key={v}
                  disabled={disabled}
                  onClick={() => changeVisibility(v)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                    disabled
                      ? "cursor-not-allowed opacity-50"
                      : "hover:bg-surface-muted"
                  } ${visibility === v ? "bg-primary-soft/40" : ""}`}
                >
                  <Icon className="h-4 w-4 text-primary" /> {label}
                  {disabled && <span className="ml-auto text-[10px] opacity-60">войдите</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Split Save */}
        <div ref={saveRef} className="relative flex items-stretch rounded-full shadow-lift">
          <button
            type="button"
            onClick={() => void performSave()}
            className="inline-flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-white transition-transform hover:scale-[1.02] active:scale-95 sm:px-5 sm:py-3"
            style={{ background: "var(--foreground)" }}
          >
            <Save className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Сохранить</span>
          </button>
          <button
            type="button"
            onClick={() => setOpenSaveMenu((v) => !v)}
            aria-label="Ещё"
            className="grid place-items-center border-l border-white/20 px-2 text-white hover:bg-white/10 sm:px-3"
            style={{ background: "var(--foreground)" }}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          {openSaveMenu && (
            <div className="absolute bottom-full right-0 mb-2 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-lift">
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted"
                onClick={() => {
                  setOpenSaveMenu(false);
                  void performSave(onSaveAsCopy);
                }}
              >
                <Copy className="h-4 w-4 text-primary" /> Сохранить как копию
              </button>
            </div>
          )}
        </div>

        {/* Play */}
        <button
          type="button"
          onClick={() => void handlePlay()}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold shadow-lift transition-transform hover:scale-[1.03] active:scale-95 sm:px-6 sm:py-3"
          style={{ background: themeAccent ?? "var(--primary)", color: themeAccent ? "#000" : "#fff" }}
        >
          <Play className="h-4 w-4" /> Играть
        </button>
      </div>


      {helpContent && (
        <div className="hidden md:block">
          <HelpButton title={helpTitle}>{helpContent}</HelpButton>
        </div>
      )}
      {mobileImportOpen && onImportFile && (
        <ImportModal
          onClose={() => setMobileImportOpen(false)}
          onFile={(file) => {
            onImportFile(file);
            setMobileImportOpen(false);
          }}
          onDownloadTemplate={onDownloadTemplate ?? (() => undefined)}
        />
      )}
      {openPlay && savedId && (
        <PlayModal gameId={savedId} kind={kind} onClose={() => setOpenPlay(false)} />
      )}
    </>
  );
}
