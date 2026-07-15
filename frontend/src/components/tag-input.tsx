import { useEffect, useMemo, useRef, useState } from "react";
import { X, Tag as TagIcon } from "lucide-react";

export const TAG_PRESETS = [
  // Предметы
  "Математика", "История", "Биология", "Физика", "Химия", "Литература",
  "География", "Языки", "Информатика", "Обществознание", "Искусство", "Музыка",
  // Классы
  "1 класс", "2 класс", "3 класс", "4 класс", "5 класс", "6 класс", "7 класс",
  "8 класс", "9 класс", "10 класс", "11 класс", "ВУЗ", "Взрослые",
  // Сложность
  "Лёгкий", "Средний", "Сложный",
  // Форматы
  "Тест", "Экзамен", "Повторение", "Разминка",
];

const SUGGESTED = ["Математика", "История", "5 класс", "Лёгкий", "Разминка", "Тест"];

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

export function TagInput({ value, onChange, placeholder = "Добавьте тег и нажмите Enter" }: Props) {
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setFocus(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const add = (raw: string) => {
    const t = raw.trim().slice(0, 30);
    if (!t) return;
    if (value.some((v) => v.toLowerCase() === t.toLowerCase())) return;
    onChange([...value, t]);
    setText("");
  };

  const remove = (t: string) => onChange(value.filter((v) => v !== t));

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    const base = q
      ? TAG_PRESETS.filter((p) => p.toLowerCase().includes(q))
      : SUGGESTED;
    return base.filter((p) => !value.some((v) => v.toLowerCase() === p.toLowerCase())).slice(0, 10);
  }, [text, value]);

  return (
    <div ref={boxRef} className="relative">
      <div className="input-base flex flex-wrap items-center gap-1.5 py-2">
        <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary"
          >
            {t}
            <button
              type="button"
              onClick={() => remove(t)}
              className="rounded-full opacity-60 hover:opacity-100"
              aria-label={`Убрать тег ${t}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocus(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && value.length) {
              remove(value[value.length - 1]);
            }
          }}
          placeholder={value.length ? "" : placeholder}
          className="min-w-[10ch] flex-1 border-0 bg-transparent p-0 text-sm outline-none focus:ring-0"
        />
      </div>
      {focus && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-xl border border-border bg-surface p-2 shadow-lift">
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {text.trim() ? "Подсказки" : "Часто используемые"}
          </p>
          <div className="flex flex-wrap gap-1">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(s);
                }}
                className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-primary-soft hover:text-primary"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
