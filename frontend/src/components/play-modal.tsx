// Shared "Как играем?" modal used by builders and the game dashboard.
import { useState } from "react";
import { Copy, Monitor, Radio, X } from "lucide-react";
import { createRoom } from "@/lib/api";
import type { GameKind } from "@/lib/types";

export function PlayModal({
  gameId,
  kind,
  onClose,
}: {
  gameId: string;
  kind: GameKind;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hostView, setHostView] = useState(kind === "millionaire");


  const startOnline = async () => {
    setError(null);
    setLoading(true);
    try {
      const { code } = await createRoom(kind, gameId);
      window.open(`/room/${code}`, "_blank", "noopener");
      onClose();
    } catch (err) {
      console.error(err);
      setError("Не удалось создать комнату");
    } finally {
      setLoading(false);
    }
  };

  if (hostView) {
    return <OfflineHostView gameId={gameId} kind={kind} onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg animate-fade-up rounded-3xl bg-surface p-6 shadow-lift">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl font-bold">Как играем?</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={startOnline}
            disabled={loading}
            className="group flex flex-col items-start gap-2 rounded-2xl border-2 border-border p-5 text-left transition-all hover:border-primary hover:bg-primary-soft disabled:opacity-60"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
              <Radio className="h-5 w-5" />
            </span>
            <span className="font-display text-base font-bold">Онлайн-комната</span>
            <span className="text-xs text-muted-foreground">
              {loading ? "Создаём…" : "Ученики заходят по коду со своих устройств"}
            </span>
          </button>

          <button
            onClick={() => setHostView(true)}
            className="group flex flex-col items-start gap-2 rounded-2xl border-2 border-border p-5 text-left transition-all hover:border-amber hover:bg-amber-soft"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-soft text-amber">
              <Monitor className="h-5 w-5" />
            </span>
            <span className="font-display text-base font-bold">Офлайн</span>
            <span className="text-xs text-muted-foreground">
              Плеер на проекторе, ссылка + QR для учеников
            </span>
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
        )}
      </div>
    </div>
  );
}

function OfflineHostView({
  gameId,
  kind,
  onClose,
}: {
  gameId: string;
  kind: GameKind;
  onClose: () => void;
}) {
  const playUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/play/${kind}/${gameId}`
      : `/play/${kind}/${gameId}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(playUrl)}`;
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(playUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg animate-fade-up rounded-3xl bg-surface p-6 shadow-lift">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl font-bold">Офлайн-режим</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ссылка для учеников
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                className="input-base flex-1 font-mono text-xs"
                value={playUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button className="btn-ghost" onClick={copy}>
                <Copy className="h-4 w-4" /> {copied ? "Ок" : "Копировать"}
              </button>
            </div>
            <button
              onClick={() => window.open(playUrl, "_blank", "noopener")}
              className="btn-accent mt-4 w-full justify-center py-3"
            >
              <Monitor className="h-4 w-4" /> Открыть плеер на проекторе
            </button>
          </div>
          <div className="grid place-items-center rounded-2xl border border-border bg-surface-muted p-3">
            <img src={qrUrl} alt="QR" className="h-40 w-40 rounded-lg" />
            <p className="mt-2 text-[11px] text-muted-foreground">QR к плееру</p>
          </div>
        </div>
      </div>
    </div>
  );
}
