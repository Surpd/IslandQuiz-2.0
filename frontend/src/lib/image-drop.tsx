// Reusable image picker (TZ v2.0 §3 — унификация картинок).
// Компактная иконка 🖼️ открывает модальное окно с двумя способами:
// "Перетащить файл" и "Вставить URL". Хранит результат как data URL или URL.
// API совместим с прежним <ImageDrop>: props { value, onChange, maxKB, compact }.

import { useRef, useState, useEffect } from "react";
import { ImageIcon, ImagePlus, Link2, Upload, X } from "lucide-react";

interface Props {
  value?: string;
  onChange: (value: string) => void;
  maxKB?: number;
  compact?: boolean;
}

export function ImageDrop({ value, onChange, maxKB = 500 }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs font-semibold transition-colors ${
          value
            ? "border-primary/50 bg-primary-soft text-primary"
            : "border-border-strong bg-surface-muted text-muted-foreground hover:border-primary/50 hover:text-primary"
        }`}
        aria-label="Добавить изображение"
      >
        <ImageIcon className="h-4 w-4" />
        {value ? "Изменить картинку" : "Картинка"}
      </button>

      {value && (
        <div className="relative">
          <img
            src={value}
            alt="Предпросмотр"
            className="h-10 w-10 rounded-lg border border-border object-cover"
          />
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Удалить изображение"
            className="absolute -top-1.5 -right-1.5 grid h-4 w-4 place-items-center rounded-full bg-foreground text-white shadow-sm"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      )}

      {open && (
        <ImagePickerModal
          value={value}
          onChange={onChange}
          maxKB={maxKB}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function ImagePickerModal({
  value,
  onChange,
  maxKB,
  onClose,
}: {
  value?: string;
  onChange: (v: string) => void;
  maxKB: number;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"file" | "url">("file");
  const [url, setUrl] = useState(value && !value.startsWith("data:") ? value : "");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const readFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Только изображения");
      return;
    }
    if (file.size > maxKB * 1024) {
      setError(`Файл больше ${maxKB} КБ`);
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      onChange(String(e.target?.result ?? ""));
      onClose();
    };
    reader.onerror = () => setError("Не удалось прочитать файл");
    reader.readAsDataURL(file);
  };

  const applyUrl = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Введите URL");
      return;
    }
    onChange(trimmed);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md animate-fade-up rounded-3xl bg-surface p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Изображение</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 rounded-xl bg-surface-muted p-1 text-sm font-semibold">
          <button
            onClick={() => setTab("file")}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 transition-colors ${
              tab === "file" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <Upload className="h-3.5 w-3.5" /> Файл
          </button>
          <button
            onClick={() => setTab("url")}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 transition-colors ${
              tab === "url" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <Link2 className="h-3.5 w-3.5" /> URL
          </button>
        </div>

        {tab === "file" ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) readFile(f);
            }}
            onClick={() => fileRef.current?.click()}
            className={`cursor-pointer rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all ${
              dragging
                ? "border-primary bg-primary-soft"
                : "border-border-strong bg-surface-muted hover:border-primary/50"
            }`}
          >
            <ImagePlus className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">
              Перетащите файл или нажмите
            </p>
            <p className="mt-1 text-xs text-muted-foreground">до {maxKB} КБ</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="url"
              autoFocus
              className="input-base"
              placeholder="https://…/image.jpg"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyUrl()}
            />
            <button onClick={applyUrl} className="btn-primary w-full justify-center">
              Вставить URL
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-xs font-semibold text-danger">{error}</p>}
      </div>
    </div>
  );
}
