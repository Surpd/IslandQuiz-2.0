import { useCallback, useEffect, useMemo, useState } from "react";
import { GitMerge, Pencil, Plus, Shield, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { normalizeTag, sameTag } from "@/lib/tags";

type AdminTag = {
  id: string;
  name: string;
  canonical_name: string;
  is_system: boolean;
  usage_count: number;
  created_at?: string;
};
type DuplicatePair = { source: AdminTag; target: AdminTag };
type Preview = {
  create: string[];
  existing: string[];
  invalid: Array<{ value: string; reason: string }>;
  create_count: number;
};

export function AdminTagsWorkspace() {
  const [tags, setTags] = useState<AdminTag[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"name" | "popularity">("name");
  const [kind, setKind] = useState<"all" | "system" | "user">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mergeSource, setMergeSource] = useState<AdminTag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch(
        `/api/admin/tags?search=${encodeURIComponent(search)}&sort=${sort}&kind=${kind}`,
      );
      setTags(response.tags ?? []);
      setDuplicates(response.possible_duplicates ?? []);
      setSelected([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить теги.");
    } finally {
      setLoading(false);
    }
  }, [kind, search, sort]);
  useEffect(() => {
    void load();
  }, [load]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const runBulkAction = async (action: "system" | "user" | "delete_unused") => {
    if (!selected.length) return;
    if (action === "delete_unused" && !confirm("Удалить выбранные неиспользуемые теги?")) return;
    try {
      await apiFetch("/api/admin/tags/bulk-action", {
        method: "POST",
        body: JSON.stringify({ ids: selected, action }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Операция не выполнена.");
    }
  };
  const previewBulk = async () => {
    try {
      setPreview(
        await apiFetch("/api/admin/tags/bulk-preview", {
          method: "POST",
          body: JSON.stringify({ text: bulkText }),
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось проверить список.");
    }
  };
  const createBulk = async () => {
    if (!preview?.create_count) return;
    try {
      await apiFetch("/api/admin/tags/bulk", {
        method: "POST",
        body: JSON.stringify({ names: preview.create, is_system: true }),
      });
      setBulkOpen(false);
      setBulkText("");
      setPreview(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось создать теги.");
    }
  };
  const rename = async (tag: AdminTag) => {
    const name = prompt("Новое название тега", tag.name);
    if (!name || name === tag.name) return;
    try {
      normalizeTag(name);
      await apiFetch(`/api/admin/tags/${tag.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось переименовать тег.");
    }
  };
  const remove = async (tag: AdminTag) => {
    let replacementId: string | undefined;
    if (tag.usage_count > 0) {
      const replacementName = prompt(
        `Тег используется в ${tag.usage_count} играх. Введите существующий replacement tag:`,
      );
      if (!replacementName) return;
      replacementId = tags.find((item) => sameTag(item.name, replacementName))?.id;
      if (!replacementId) {
        setError("Replacement tag не найден.");
        return;
      }
    } else if (!confirm(`Удалить тег «${tag.name}»?`)) return;
    try {
      await apiFetch(
        `/api/admin/tags/${tag.id}${replacementId ? `?replacement_id=${replacementId}` : ""}`,
        { method: "DELETE" },
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось удалить тег.");
    }
  };
  const merge = async (targetId: string) => {
    if (!mergeSource || !confirm(`Объединить «${mergeSource.name}» с выбранным тегом?`)) return;
    try {
      await apiFetch(`/api/admin/tags/${mergeSource.id}/merge`, {
        method: "POST",
        body: JSON.stringify({ target_id: targetId }),
      });
      setMergeSource(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось объединить теги.");
    }
  };
  const normalizeLegacy = async () => {
    try {
      const preview = await apiFetch("/api/admin/tags/normalize-legacy", {
        method: "POST",
        body: JSON.stringify({ apply: false }),
      });
      if (!preview.changed) {
        setNotice(
          preview.skipped?.length
            ? `Пропущено игр: ${preview.skipped.length}.`
            : "Legacy-теги уже нормализованы.",
        );
        return;
      }
      if (
        !confirm(
          `Нормализовать теги в ${preview.changed} играх? Игры с >5 или некорректными тегами будут пропущены.`,
        )
      )
        return;
      const result = await apiFetch("/api/admin/tags/normalize-legacy", {
        method: "POST",
        body: JSON.stringify({ apply: true }),
      });
      setNotice(`Нормализовано игр: ${result.changed}. Пропущено: ${result.skipped?.length ?? 0}.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось нормализовать legacy-теги.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Теги</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Единый словарь: максимум 20 символов на тег и 5 тегов на игру.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => void normalizeLegacy()}>
            Проверить legacy
          </button>
          <button type="button" className="btn-accent" onClick={() => setBulkOpen(true)}>
            <Plus className="h-4 w-4" />
            Добавить теги
          </button>
        </div>
      </div>
      {notice && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl bg-success-soft px-3 py-2 text-sm text-success"
        >
          {notice}
          <button type="button" aria-label="Закрыть уведомление" onClick={() => setNotice(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {error}
          <button type="button" aria-label="Закрыть ошибку" onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="surface-card grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_12rem_12rem]">
        <input
          aria-label="Поиск тегов"
          className="input-base"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void load();
          }}
          placeholder="Поиск по названию"
        />
        <select
          aria-label="Сортировка тегов"
          className="input-base"
          value={sort}
          onChange={(event) => setSort(event.target.value as "name" | "popularity")}
        >
          <option value="name">По названию</option>
          <option value="popularity">По популярности</option>
        </select>
        <select
          aria-label="Фильтр типов тегов"
          className="input-base"
          value={kind}
          onChange={(event) => setKind(event.target.value as "all" | "system" | "user")}
        >
          <option value="all">Все теги</option>
          <option value="system">Системные</option>
          <option value="user">Пользовательские</option>
        </select>
      </div>
      {selected.length > 0 && (
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] z-30 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/20 bg-white p-3 shadow-lift">
          <strong className="text-sm">Выбрано: {selected.length}</strong>
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => void runBulkAction("system")}
          >
            <Shield className="h-3.5 w-3.5" />
            Сделать системными
          </button>
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => void runBulkAction("user")}
          >
            Сделать пользовательскими
          </button>
          <button
            type="button"
            className="btn-ghost text-xs text-danger"
            onClick={() => void runBulkAction("delete_unused")}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Удалить неиспользуемые
          </button>
          <button
            type="button"
            className="ml-auto btn-ghost p-2"
            aria-label="Снять выбор"
            onClick={() => setSelected([])}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {duplicates.length > 0 && (
        <div className="surface-card p-4">
          <h2 className="font-display font-bold">Возможные дубли</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Похожие теги не объединяются автоматически.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {duplicates.map((pair) => (
              <button
                key={`${pair.source.id}-${pair.target.id}`}
                type="button"
                onClick={() => setMergeSource(pair.source)}
                className="rounded-full bg-amber-soft px-3 py-1 text-xs font-semibold"
              >
                {pair.source.name} + {pair.target.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {loading ? (
        <div className="surface-card p-6 text-sm text-muted-foreground">Загрузка…</div>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-primary-soft text-left text-xs font-bold uppercase tracking-wider text-primary">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      aria-label="Выбрать все теги"
                      type="checkbox"
                      checked={tags.length > 0 && selected.length === tags.length}
                      onChange={(event) =>
                        setSelected(event.target.checked ? tags.map((tag) => tag.id) : [])
                      }
                    />
                  </th>
                  <th className="px-3 py-3">Название</th>
                  <th className="px-3 py-3">Использований</th>
                  <th className="px-3 py-3">Тип</th>
                  <th className="px-3 py-3">Создан</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {tags.map((tag) => (
                  <tr key={tag.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <input
                        aria-label={`Выбрать тег ${tag.name}`}
                        type="checkbox"
                        checked={selectedSet.has(tag.id)}
                        onChange={() =>
                          setSelected((items) =>
                            items.includes(tag.id)
                              ? items.filter((id) => id !== tag.id)
                              : [...items, tag.id],
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-3 font-semibold">{tag.name}</td>
                    <td className="px-3 py-3">{tag.usage_count}</td>
                    <td className="px-3 py-3">
                      {tag.is_system ? "Системный" : "Пользовательский"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {tag.created_at ? new Date(tag.created_at).toLocaleDateString("ru-RU") : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="btn-ghost p-2"
                          aria-label={`Переименовать ${tag.name}`}
                          onClick={() => void rename(tag)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost p-2"
                          aria-label={`Объединить ${tag.name}`}
                          onClick={() => setMergeSource(tag)}
                        >
                          <GitMerge className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost p-2 text-danger"
                          aria-label={`Удалить ${tag.name}`}
                          onClick={() => void remove(tag)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!tags.length && <p className="p-6 text-sm text-muted-foreground">Теги не найдены.</p>}
          </div>
          <div className="space-y-3 p-3 md:hidden">
            {tags.map((tag) => (
              <article key={tag.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start gap-3">
                  <input
                    aria-label={`Выбрать тег ${tag.name}`}
                    type="checkbox"
                    checked={selectedSet.has(tag.id)}
                    onChange={() =>
                      setSelected((items) =>
                        items.includes(tag.id)
                          ? items.filter((id) => id !== tag.id)
                          : [...items, tag.id],
                      )
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{tag.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tag.usage_count} игр · {tag.is_system ? "Системный" : "Пользовательский"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost p-2"
                    aria-label={`Переименовать ${tag.name}`}
                    onClick={() => void rename(tag)}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
            {!tags.length && <p className="p-3 text-sm text-muted-foreground">Теги не найдены.</p>}
          </div>
        </div>
      )}
      {bulkOpen && (
        <BulkTagDialog
          text={bulkText}
          setText={setBulkText}
          preview={preview}
          onPreview={() => void previewBulk()}
          onCreate={() => void createBulk()}
          onClose={() => {
            setBulkOpen(false);
            setPreview(null);
          }}
        />
      )}
      {mergeSource && (
        <MergeDialog
          source={mergeSource}
          tags={tags}
          onMerge={(id) => void merge(id)}
          onClose={() => setMergeSource(null)}
        />
      )}
    </div>
  );
}

function BulkTagDialog({
  text,
  setText,
  preview,
  onPreview,
  onCreate,
  onClose,
}: {
  text: string;
  setText: (value: string) => void;
  preview: Preview | null;
  onPreview: () => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] bg-foreground/30 p-4 sm:flex sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Добавить теги"
        onClick={(event) => event.stopPropagation()}
        className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-auto rounded-t-3xl bg-surface p-5 shadow-lift sm:static sm:w-full sm:max-w-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Добавить теги</h2>
          <button type="button" aria-label="Закрыть" className="btn-ghost p-2" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          По одному в строке, также можно разделять запятой или точкой с запятой.
        </p>
        <textarea
          aria-label="Список тегов"
          className="input-base mt-4 min-h-40"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Математика\nИстория\n5 класс"
        />
        {preview && (
          <div className="mt-4 space-y-3 rounded-xl bg-surface-muted p-4 text-sm">
            <div className="flex flex-wrap gap-3 font-semibold">
              <span>Будет создано: {preview.create_count}</span>
              <span>Уже существуют: {preview.existing.length}</span>
              <span>Ошибки: {preview.invalid.length}</span>
            </div>
            {preview.create.length > 0 && (
              <div>
                <p className="font-semibold text-success">Создать:</p>
                <p className="mt-1">{preview.create.join(" · ")}</p>
              </div>
            )}
            {preview.existing.length > 0 && (
              <div>
                <p className="font-semibold">Уже существуют:</p>
                <p className="mt-1">{preview.existing.join(" · ")}</p>
              </div>
            )}
            {preview.invalid.length > 0 && (
              <div>
                <p className="font-semibold text-danger">Не будут созданы:</p>
                {preview.invalid.map((item) => (
                  <p key={`${item.value}-${item.reason}`} className="mt-1 text-danger">
                    {item.value} — {item.reason}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onPreview}>
            Проверить список
          </button>
          <button
            type="button"
            className="btn-accent"
            disabled={!preview?.create_count}
            onClick={onCreate}
          >
            Добавить {preview?.create_count ?? 0} тегов
          </button>
        </div>
      </section>
    </div>
  );
}

function MergeDialog({
  source,
  tags,
  onMerge,
  onClose,
}: {
  source: AdminTag;
  tags: AdminTag[];
  onMerge: (targetId: string) => void;
  onClose: () => void;
}) {
  const [targetId, setTargetId] = useState("");
  const target = tags.find((tag) => tag.id === targetId);
  return (
    <div
      className="fixed inset-0 z-[70] bg-foreground/30 p-4 sm:flex sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Объединить теги"
        onClick={(event) => event.stopPropagation()}
        className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-surface p-5 shadow-lift sm:static sm:w-full sm:max-w-md sm:rounded-2xl"
      >
        <h2 className="font-display text-xl font-bold">Объединить тег</h2>
        <p className="mt-2 text-sm">
          Объединить «<strong>{source.name}</strong>» с выбранным тегом? Затронуто игр:{" "}
          {source.usage_count}.
        </p>
        <select
          aria-label="Целевой тег"
          className="input-base mt-4"
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
        >
          <option value="">Выберите target tag</option>
          {tags
            .filter((tag) => tag.id !== source.id)
            .map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name} · {tag.usage_count} игр
              </option>
            ))}
        </select>
        {target && (
          <p className="mt-3 text-sm text-muted-foreground">
            Все игры источника получат «{target.name}», дубли внутри игры будут удалены.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn-accent"
            disabled={!targetId}
            onClick={() => onMerge(targetId)}
          >
            Объединить
          </button>
        </div>
      </section>
    </div>
  );
}
