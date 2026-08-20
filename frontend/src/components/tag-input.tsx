import { useEffect, useMemo, useRef, useState } from "react";
import { Tag as TagIcon, X } from "lucide-react";
import { getTagSuggestions } from "@/lib/api";
import {
  canonicalTag,
  MAX_GAME_TAGS,
  MAX_TAG_LENGTH,
  normalizeTag,
  sameTag,
  type TagSuggestion,
} from "@/lib/tags";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

export function TagInput({ value, onChange, placeholder = "Добавьте тег" }: Props) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focused) return;
    const controller = new AbortController();
    setLoading(true);
    getTagSuggestions(text.trim(), 12, controller.signal)
      .then(setSuggestions)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setSuggestions([]);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [focused, text]);

  const visibleSuggestions = useMemo(
    () => suggestions.filter((suggestion) => !value.some((tag) => sameTag(tag, suggestion.name))),
    [suggestions, value],
  );
  const tagValidationMessage = useMemo(() => {
    if (!text) return null;
    try {
      normalizeTag(text);
      return null;
    } catch (reason) {
      return reason instanceof Error ? reason.message : "Некорректный тег.";
    }
  }, [text]);
  const normalizedText = useMemo(() => {
    if (!text.trim() || tagValidationMessage) return null;
    return normalizeTag(text);
  }, [tagValidationMessage, text]);
  const hasExactSuggestion = normalizedText
    ? suggestions.some((suggestion) => sameTag(suggestion.name, normalizedText))
    : false;
  const canCreate = Boolean(normalizedText && !hasExactSuggestion && value.length < MAX_GAME_TAGS);
  const optionsCount = visibleSuggestions.length + (canCreate ? 1 : 0);

  const add = (raw: string) => {
    try {
      const tag = normalizeTag(raw);
      if (value.length >= MAX_GAME_TAGS) {
        setError("У игры может быть не больше 5 тегов.");
        return;
      }
      if (value.some((item) => canonicalTag(item) === canonicalTag(tag))) {
        setError("Этот тег уже выбран.");
        return;
      }
      onChange([...value, tag]);
      setText("");
      setError(null);
      setActiveIndex(-1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Некорректный тег.");
    }
  };

  const remove = (tag: string) => onChange(value.filter((item) => item !== tag));

  return (
    <div ref={boxRef} className="relative min-w-0">
      <div className="input-base flex min-w-0 flex-wrap items-center gap-1.5 py-2">
        <TagIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary"
          >
            <span className="truncate">{tag}</span>
            <button
              type="button"
              onClick={() => remove(tag)}
              className="shrink-0 rounded-full opacity-60 hover:opacity-100"
              aria-label={`Убрать тег ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setFocused(true);
            setError(null);
            setActiveIndex(-1);
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && optionsCount) {
              event.preventDefault();
              setActiveIndex((index) => (index + 1) % optionsCount);
            } else if (event.key === "ArrowUp" && optionsCount) {
              event.preventDefault();
              setActiveIndex((index) => (index <= 0 ? optionsCount - 1 : index - 1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (activeIndex >= 0 && activeIndex < visibleSuggestions.length)
                add(visibleSuggestions[activeIndex].name);
              else if (activeIndex === visibleSuggestions.length && canCreate) add(text);
              else add(text);
            } else if (event.key === "Escape") {
              setFocused(false);
              setActiveIndex(-1);
            } else if (event.key === "Backspace" && !text && value.length)
              remove(value[value.length - 1]);
          }}
          placeholder={value.length ? "" : placeholder}
          aria-label="Добавить тег"
          className="min-w-[10ch] flex-1 border-0 bg-transparent p-0 text-sm outline-none focus:ring-0"
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>
          {error ||
            tagValidationMessage ||
            (value.length >= MAX_GAME_TAGS ? "Достигнут максимум: 5 тегов." : "")}
        </span>
        {text.length > MAX_TAG_LENGTH && (
          <span>
            {text.length}/{MAX_TAG_LENGTH}
          </span>
        )}
      </div>
      {focused && (visibleSuggestions.length > 0 || canCreate || loading) && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 min-w-0 rounded-xl border border-border bg-surface p-2 shadow-lift">
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {text.trim() ? "Подсказки" : "Популярные теги"}
          </p>
          <div className="flex max-w-full flex-nowrap gap-1 overflow-x-auto pb-1">
            {visibleSuggestions.map((suggestion, index) => (
              <button
                key={suggestion.id ?? suggestion.name}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  add(suggestion.name);
                }}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${activeIndex === index ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted-foreground hover:bg-primary-soft hover:text-primary"}`}
              >
                {suggestion.name}
                {suggestion.is_system ? " ·" : ""}
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  add(text);
                }}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${activeIndex === visibleSuggestions.length ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary"}`}
              >
                + Создать «{normalizedText}»
              </button>
            )}
            {loading && (
              <span className="shrink-0 px-2 py-1 text-xs text-muted-foreground">Загрузка…</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
