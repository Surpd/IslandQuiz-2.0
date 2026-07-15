import { AlertCircle, RotateCcw, Trash2 } from "lucide-react";

interface Props {
  updatedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
}

export function DraftBanner({ updatedAt, onRestore, onDiscard }: Props) {
  const rel = formatRelative(updatedAt);
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber/40 bg-amber-soft/60 p-4 shadow-sm sm:flex-row sm:items-center">
      <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          У вас есть несохранённый черновик
        </p>
        <p className="text-xs text-muted-foreground">Автосохранён {rel}</p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRestore}
          className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-xs font-bold text-white transition-transform hover:scale-[1.02] active:scale-95"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Восстановить
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-muted-foreground hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" /> Удалить
        </button>
      </div>
    </div>
  );
}

function formatRelative(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return `${d} дн назад`;
}
