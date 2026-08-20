import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  Bot,
  ChevronDown,
  CircleAlert,
  Download,
  FileJson,
  Gamepad2,
  Loader2,
  Lock,
  MoreHorizontal,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Tags as TagsIcon,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { AdminTagsWorkspace } from "@/components/admin-tags";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Админ-панель — IslandQuiz" }] }),
  component: AdminPage,
});

type Section = "overview" | "games" | "tags" | "users" | "ai" | "prompts" | "errors" | "settings";
type Period = "7d" | "30d" | "90d" | "all";
type Game = Record<string, unknown> & {
  id: string;
  title: string;
  kind?: string;
  visibility?: string;
  owner_name?: string;
  rating?: number | null;
  created_at?: string;
};
type WorkspaceUser = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  banned?: boolean;
  created_at?: string;
  games_count?: number;
};
type ActivityRow = {
  date: string;
  users?: number;
  games?: number;
  plays?: number;
  ai?: number;
  requests?: number;
};
type TopGame = { id: string; title: string; plays: number };
type DashboardData = {
  error?: boolean;
  kpis?: Record<string, number | null>;
  activity?: ActivityRow[];
  distribution?: { types?: Record<string, number>; visibility?: Record<string, number> };
  top_games?: TopGame[];
};
type AIData = {
  error?: boolean;
  requests?: number;
  success_rate?: number | null;
  errors?: number;
  total_tokens?: number;
  daily?: ActivityRow[];
  by_type?: Record<string, number>;
  by_model?: Record<string, number>;
  recent_errors?: Array<{ id?: number; error?: string }>;
};
type PromptResult = {
  error?: string;
  model?: string;
  duration_ms?: number;
  prompt?: string;
  raw?: string;
  parsed?: unknown;
};
type ErrorRecord = {
  id: number;
  created_at?: string;
  source?: string;
  message?: string;
  path?: string;
  details?: string;
  request_id?: string;
};
type LimitSettings = {
  error?: boolean;
  user: Record<string, number | null>;
  admin: Record<string, number | null>;
};

const sectionGroups: Array<{
  title?: string;
  items: Array<{ key: Section; label: string; icon: typeof BarChart3 }>;
}> = [
  { items: [{ key: "overview", label: "Обзор", icon: BarChart3 }] },
  {
    title: "Контент",
    items: [
      { key: "games", label: "Игры", icon: Gamepad2 },
      { key: "tags", label: "Теги", icon: TagsIcon },
    ],
  },
  { title: "Пользователи", items: [{ key: "users", label: "Пользователи", icon: Users }] },
  {
    title: "AI",
    items: [
      { key: "ai", label: "AI", icon: Bot },
      { key: "prompts", label: "Тестер промптов", icon: Sparkles },
    ],
  },
  {
    title: "Система",
    items: [
      { key: "errors", label: "Ошибки", icon: CircleAlert },
      { key: "settings", label: "Настройки", icon: Settings2 },
    ],
  },
];
const sectionLabel = (section: Section) =>
  sectionGroups.flatMap((group) => group.items).find((item) => item.key === section)?.label ??
  "Обзор";
const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("ru-RU") : "—";
const kindLabel = (kind?: string) =>
  ({ quiz: "Квиз", jeopardy: "Своя игра", millionaire: "Миллионер" })[kind ?? ""] ?? kind ?? "—";
const visibilityLabel = (value?: string) =>
  ({ public: "public", private: "private", link: "link" })[value ?? ""] ?? "private";

function AdminPage() {
  const { user } = useAuth();
  const [section, setSection] = useState<Section>("overview");
  if (!user || user.role !== "admin") return <AccessDenied />;
  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Админ-панель
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Управление IslandQuiz</p>
          </div>
          <AdminMobileSectionSelector section={section} onChange={setSection} />
        </div>
        <div className="grid gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
          <AdminNavigation section={section} onChange={setSection} />
          <section className="min-w-0">
            {section === "overview" && <Overview />}
            {section === "games" && <GamesWorkspace />}
            {section === "tags" && <AdminTagsWorkspace />}
            {section === "users" && <UsersWorkspace currentUserId={user.id} />}
            {section === "ai" && <AIDashboard />}
            {section === "prompts" && <PromptTester />}
            {section === "errors" && <ErrorCenter />}
            {section === "settings" && <SettingsWorkspace />}
          </section>
        </div>
      </main>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <Shield className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <h1 className="font-display text-2xl font-bold">Доступ запрещён</h1>
        <p className="mt-2 text-muted-foreground">Только для администраторов.</p>
        <Link to="/" className="btn-accent mt-4 inline-flex">
          На главную
        </Link>
      </div>
    </div>
  );
}
function AdminNavigation({
  section,
  onChange,
}: {
  section: Section;
  onChange: (section: Section) => void;
}) {
  return (
    <nav aria-label="Разделы админ-панели" className="surface-card hidden h-fit p-3 lg:block">
      {sectionGroups.map((group, index) => (
        <div
          key={group.title ?? "overview"}
          className={index ? "mt-4 border-t border-border pt-4" : ""}
        >
          {group.title && (
            <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </p>
          )}
          {group.items.map((item) => (
            <NavButton
              key={item.key}
              item={item}
              active={section === item.key}
              onClick={() => onChange(item.key)}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}
function NavButton({
  item,
  active,
  onClick,
}: {
  item: { label: string; icon: typeof BarChart3 };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"}`}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </button>
  );
}
function AdminMobileSectionSelector({
  section,
  onChange,
}: {
  section: Section;
  onChange: (section: Section) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm font-semibold shadow-sm lg:hidden"
      >
        {sectionLabel(section)}
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[70] bg-foreground/30 lg:hidden"
          onClick={() => setOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Разделы админ-панели"
            onClick={(event) => event.stopPropagation()}
            className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-auto rounded-t-3xl border-t border-border bg-surface px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 shadow-lift"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-strong" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Админ-панель</h2>
              <button
                type="button"
                aria-label="Закрыть выбор раздела"
                onClick={() => setOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-full border border-border"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {sectionGroups.map((group) => (
              <div key={group.title ?? "overview"} className="mt-4 first:mt-0">
                {group.title && (
                  <p className="mb-1 px-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {group.title}
                  </p>
                )}
                {group.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      onChange(item.key);
                      setOpen(false);
                    }}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold ${section === item.key ? "bg-primary-soft text-primary" : "text-foreground hover:bg-surface-muted"}`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </section>
        </div>
      )}
    </>
  );
}
function PeriodSelector({
  period,
  onChange,
}: {
  period: Period;
  onChange: (period: Period) => void;
}) {
  return (
    <div className="inline-flex rounded-xl bg-surface-muted p-1" aria-label="Период">
      {(["7d", "30d", "90d", "all"] as Period[]).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold sm:px-3 ${period === value ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}`}
        >
          {{ "7d": "7 дней", "30d": "30 дней", "90d": "90 дней", all: "Всё" }[value]}
        </button>
      ))}
    </div>
  );
}
function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="surface-card min-w-0 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 truncate font-display text-2xl font-black text-primary sm:text-3xl">
        {value ?? "—"}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Overview() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<DashboardData>();
  const [metric, setMetric] = useState<"users" | "games" | "plays" | "ai">("users");
  useEffect(() => {
    setData(undefined);
    apiFetch(`/api/admin/dashboard?period=${period}`)
      .then(setData)
      .catch(() => setData({ error: true }));
  }, [period]);
  if (!data) return <LoadingCard />;
  if (data.error) return <ErrorState />;
  const kpis = data.kpis ?? {};
  return (
    <div className="space-y-6">
      <SectionHeading
        title="Обзор"
        action={<PeriodSelector period={period} onChange={setPeriod} />}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Всего пользователей" value={kpis.users} />
        <StatCard label="Новые за период" value={kpis.new_users} />
        <StatCard label="Созданные игры" value={kpis.games} />
        <StatCard label="Прохождения" value={kpis.plays} />
        <StatCard label="Онлайн-сессии" value={kpis.online_sessions} />
        <StatCard label="AI-запросы" value={kpis.ai_requests} />
        <StatCard label="Ошибки" value={kpis.errors} />
        <StatCard
          label="Активные пользователи"
          value={kpis.active_users}
          hint="Нет достоверного поля активности"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="surface-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold">Активность</h2>
            <div className="flex gap-1">
              {(["users", "games", "plays", "ai"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMetric(key)}
                  className={`rounded-lg px-2 py-1 text-xs font-semibold ${metric === key ? "bg-primary-soft text-primary" : "text-muted-foreground"}`}
                >
                  {{ users: "Пользователи", games: "Игры", plays: "Прохождения", ai: "AI" }[key]}
                </button>
              ))}
            </div>
          </div>
          <ActivityChart data={data.activity ?? []} metric={metric} />
        </div>
        <div className="surface-card p-5">
          <h2 className="font-display text-lg font-bold">Топ игр по прохождениям</h2>
          <div className="mt-3 space-y-2">
            {(data.top_games ?? []).length ? (
              (data.top_games ?? []).map((game) => (
                <div
                  key={game.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-surface-muted px-3 py-2 text-sm"
                >
                  <span className="truncate font-semibold">{game.title}</span>
                  <span className="shrink-0 text-muted-foreground">{game.plays}</span>
                </div>
              ))
            ) : (
              <EmptyState text="Пока нет прохождений." />
            )}
          </div>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Distribution
          title="Игры по типам"
          values={data.distribution?.types ?? {}}
          labels={{ quiz: "Квиз", jeopardy: "Своя игра", millionaire: "Миллионер" }}
        />
        <Distribution
          title="Видимость"
          values={data.distribution?.visibility ?? {}}
          labels={{ public: "public", private: "private", link: "link" }}
        />
      </div>
    </div>
  );
}
function ActivityChart({ data, metric }: { data: ActivityRow[]; metric: keyof ActivityRow }) {
  const max = Math.max(1, ...data.map((item) => Number(item[metric]) || 0));
  return (
    <div className="mt-5 flex h-44 min-w-0 items-end gap-1 overflow-x-auto pb-5">
      {data.length ? (
        data.map((item) => (
          <div key={item.date} className="flex h-full min-w-8 flex-1 flex-col justify-end">
            <div
              title={`${item.date}: ${item[metric] ?? 0}`}
              className="min-h-1 rounded-t bg-primary"
              style={{ height: `${Math.max(2, ((Number(item[metric]) || 0) / max) * 100)}%` }}
            />
            <span className="mt-1 truncate text-center text-[10px] text-muted-foreground">
              {String(item.date).slice(5)}
            </span>
          </div>
        ))
      ) : (
        <EmptyState text="За выбранный период нет данных." />
      )}
    </div>
  );
}
function Distribution({
  title,
  values,
  labels,
}: {
  title: string;
  values: Record<string, number>;
  labels: Record<string, string>;
}) {
  const total = Math.max(
    1,
    Object.values(values).reduce((sum, value) => sum + value, 0),
  );
  return (
    <div className="surface-card p-5">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <div className="mt-4 space-y-3">
        {Object.entries(values).length ? (
          Object.entries(values).map(([key, value]) => (
            <div key={key}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{labels[key] ?? key}</span>
                <span className="text-muted-foreground">{value}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(value / total) * 100}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <EmptyState text="Нет данных." />
        )}
      </div>
    </div>
  );
}

function GamesWorkspace() {
  const [games, setGames] = useState<Game[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [visibility, setVisibility] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [showImport, setShowImport] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50", search });
      if (kind) params.set("kind", kind);
      if (visibility) params.set("visibility", visibility);
      const response = await apiFetch(`/api/admin/workspace/games?${params}`);
      setGames(response.games ?? []);
      setTotal(response.total ?? 0);
      setSelected([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // load intentionally follows filter values only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, visibility]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const toggle = (id: string) =>
    setSelected((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  const bulk = async (action: "visibility" | "delete", nextVisibility?: string) => {
    if (!selected.length) return;
    if (
      action === "delete" &&
      !confirm(`Удалить выбранные игры (${selected.length})? Это действие нельзя отменить.`)
    )
      return;
    if (action === "visibility")
      await apiFetch("/api/admin/workspace/games/bulk/visibility", {
        method: "PATCH",
        body: JSON.stringify({ ids: selected, visibility: nextVisibility }),
      });
    else
      await apiFetch("/api/admin/workspace/games/bulk", {
        method: "DELETE",
        body: JSON.stringify({ ids: selected }),
      });
    await load();
  };
  return (
    <div className="space-y-4">
      <SectionHeading
        title="Игры"
        action={
          <button type="button" className="btn-accent" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4" /> Импорт контента
          </button>
        }
      />
      <div className="surface-card p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              aria-label="Поиск игр"
              className="input-base pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Название игры"
            />
          </label>
          <select
            aria-label="Тип игры"
            className="input-base"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="">Все типы</option>
            <option value="quiz">Квиз</option>
            <option value="jeopardy">Своя игра</option>
            <option value="millionaire">Миллионер</option>
          </select>
          <select
            aria-label="Видимость игры"
            className="input-base"
            value={visibility}
            onChange={(event) => setVisibility(event.target.value)}
          >
            <option value="">Любая видимость</option>
            <option value="public">public</option>
            <option value="link">link</option>
            <option value="private">private</option>
          </select>
          <button type="button" className="btn-accent justify-center" onClick={() => void load()}>
            Найти
          </button>
        </div>
      </div>
      {selected.length > 0 && (
        <BulkActionBar
          count={selected.length}
          onClear={() => setSelected([])}
          onVisibility={(value) => void bulk("visibility", value)}
          onDelete={() => void bulk("delete")}
        />
      )}
      {loading ? (
        <LoadingCard />
      ) : (
        <>
          <div className="surface-card hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-primary-soft text-left text-xs font-bold uppercase tracking-wider text-primary">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      aria-label="Выбрать все игры на странице"
                      type="checkbox"
                      checked={games.length > 0 && selected.length === games.length}
                      onChange={(event) =>
                        setSelected(event.target.checked ? games.map((game) => game.id) : [])
                      }
                    />
                  </th>
                  <th className="px-3 py-3">Название</th>
                  <th className="px-3 py-3">Тип</th>
                  <th className="px-3 py-3">Автор</th>
                  <th className="px-3 py-3">Видимость</th>
                  <th className="px-3 py-3">Создана</th>
                  <th className="px-3 py-3">Рейтинг</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {games.map((game) => (
                  <tr key={game.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <input
                        aria-label={`Выбрать ${game.title}`}
                        type="checkbox"
                        checked={selectedSet.has(game.id)}
                        onChange={() => toggle(game.id)}
                      />
                    </td>
                    <td className="max-w-56 px-3 py-3 font-semibold">
                      <Link to="/game/$id" params={{ id: game.id }} className="hover:text-primary">
                        {game.title}
                      </Link>
                    </td>
                    <td className="px-3 py-3">{kindLabel(game.kind)}</td>
                    <td className="px-3 py-3">{game.owner_name ?? "—"}</td>
                    <td className="px-3 py-3">
                      <VisibilityBadge value={game.visibility} />
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {formatDate(game.created_at)}
                    </td>
                    <td className="px-3 py-3">{game.rating ?? "—"}</td>
                    <td className="px-3 py-3">
                      <Link
                        aria-label={`Открыть игру ${game.title}`}
                        to="/game/$id"
                        params={{ id: game.id }}
                        className="btn-ghost p-2"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!games.length && <EmptyState text="Игры не найдены." />}
          </div>
          <div className="space-y-3 md:hidden">
            {games.map((game) => (
              <article key={game.id} className="surface-card flex gap-3 p-4">
                <input
                  aria-label={`Выбрать ${game.title}`}
                  className="mt-1 h-4 w-4"
                  type="checkbox"
                  checked={selectedSet.has(game.id)}
                  onChange={() => toggle(game.id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to="/game/$id"
                      params={{ id: game.id }}
                      className="truncate font-display font-bold"
                    >
                      {game.title}
                    </Link>
                    <VisibilityBadge value={game.visibility} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {kindLabel(game.kind)} · {game.owner_name ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(game.created_at)} · рейтинг {game.rating ?? "—"}
                  </p>
                </div>
              </article>
            ))}
            {!games.length && <EmptyState text="Игры не найдены." />}
          </div>
        </>
      )}
      {showImport && (
        <OfficialContentImportModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            void load();
          }}
        />
      )}
      <p className="text-sm text-muted-foreground">Всего: {total}</p>
    </div>
  );
}
function BulkActionBar({
  count,
  onClear,
  onVisibility,
  onDelete,
}: {
  count: number;
  onClear: () => void;
  onVisibility: (value: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] z-30 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/20 bg-white p-3 shadow-lift md:bottom-4">
      <span className="mr-1 text-sm font-bold">Выбрано: {count}</span>
      <button type="button" className="btn-ghost text-xs" onClick={() => onVisibility("public")}>
        Сделать публичными
      </button>
      <button type="button" className="btn-ghost text-xs" onClick={() => onVisibility("private")}>
        Сделать приватными
      </button>
      <button type="button" className="btn-ghost text-xs" onClick={() => onVisibility("link")}>
        По ссылке
      </button>
      <button type="button" className="btn-ghost text-xs text-danger" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" />
        Удалить
      </button>
      <button
        type="button"
        className="ml-auto btn-ghost p-2"
        aria-label="Снять выделение"
        onClick={onClear}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function UsersWorkspace({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50", search });
      if (status) params.set("status", status);
      if (role) params.set("role", role);
      const response = await apiFetch(`/api/admin/workspace/users?${params}`);
      setUsers(response.users ?? []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // load intentionally follows filter values only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, role]);
  const action = async (target: WorkspaceUser, kind: "ban" | "unban" | "admin" | "user") => {
    const labels = {
      ban: "заблокировать",
      unban: "разблокировать",
      admin: "сделать администратором",
      user: "снять права администратора у",
    };
    if (
      !confirm(
        `Подтвердите действие: ${labels[kind]} ${target.name || target.email || "пользователя"}?`,
      )
    )
      return;
    const path =
      kind === "ban" || kind === "unban"
        ? `/api/admin/workspace/users/${target.id}/${kind}`
        : `/api/admin/workspace/users/${target.id}/role`;
    await apiFetch(path, {
      method: kind === "ban" || kind === "unban" ? "POST" : "PATCH",
      body: kind === "admin" || kind === "user" ? JSON.stringify({ role: kind }) : undefined,
    });
    await load();
  };
  return (
    <div className="space-y-4">
      <SectionHeading title="Пользователи" />
      <div className="surface-card p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]">
          <input
            aria-label="Поиск пользователей"
            className="input-base"
            placeholder="Имя или email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label="Роль"
            className="input-base"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="">Все роли</option>
            <option value="user">Пользователь</option>
            <option value="admin">Администратор</option>
          </select>
          <select
            aria-label="Статус"
            className="input-base"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Любой статус</option>
            <option value="active">Активен</option>
            <option value="banned">Заблокирован</option>
          </select>
          <button type="button" className="btn-accent justify-center" onClick={() => void load()}>
            Найти
          </button>
        </div>
      </div>
      {loading ? (
        <LoadingCard />
      ) : (
        <div className="space-y-3">
          {users.map((item) => (
            <article key={item.id} className="surface-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-display font-bold">{item.name || "Без имени"}</h2>
                  <p className="truncate text-sm text-muted-foreground">{item.email || "—"}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <StatusBadge active={!item.banned} />
                    <span className="rounded-full bg-surface-muted px-2 py-1">
                      {item.role === "admin" ? "Администратор" : "Пользователь"}
                    </span>
                    <span className="rounded-full bg-surface-muted px-2 py-1">
                      Игр: {item.games_count ?? "—"}
                    </span>
                    <span className="rounded-full bg-surface-muted px-2 py-1">
                      Регистрация: {formatDate(item.created_at)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.id !== currentUserId && (
                    <>
                      {item.banned ? (
                        <button
                          type="button"
                          className="btn-ghost text-xs"
                          onClick={() => void action(item, "unban")}
                        >
                          Разблокировать
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-ghost text-xs text-danger"
                          onClick={() => void action(item, "ban")}
                        >
                          Заблокировать
                        </button>
                      )}
                      {item.role === "admin" ? (
                        <button
                          type="button"
                          className="btn-ghost text-xs"
                          onClick={() => void action(item, "user")}
                        >
                          Снять админа
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-ghost text-xs"
                          onClick={() => void action(item, "admin")}
                        >
                          Сделать админом
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
          {!users.length && <EmptyState text="Пользователи не найдены." />}
        </div>
      )}
    </div>
  );
}

type OfficialImportPreview = {
  valid: boolean;
  counts?: Record<string, number>;
  owner?: { id: string; name: string } | null;
  games?: Array<{ content_id: string; kind?: string; title?: string; tags?: string[]; status?: string }>;
  errors?: Array<{ path: string; message: string }>;
  warnings?: Array<{ path: string; message: string }>;
};

function OfficialContentImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [raw, setRaw] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [owners, setOwners] = useState<WorkspaceUser[]>([]);
  const [preview, setPreview] = useState<OfficialImportPreview | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ownerError, setOwnerError] = useState("");

  useEffect(() => {
    apiFetch("/api/admin/workspace/users?limit=100")
      .then((response) => setOwners(response.users ?? []))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить авторов."));
  }, []);

  const readFile = async (file?: File) => {
    if (!file) return;
    setRaw(await file.text());
    setPreview(null);
    setResult(null);
    setError("");
    setOwnerError("");
  };

  const validate = async () => {
    setError("");
    setPreview(null);
    let pack: unknown;
    try {
      pack = JSON.parse(raw);
    } catch {
      setError("Файл не содержит валидный JSON.");
      return;
    }
    if (!ownerId) {
      setOwnerError("Выберите автора игр.");
      return;
    }
    setBusy(true);
    try {
      setPreview(
        await apiFetch("/api/admin/content/import/validate", {
          method: "POST",
          body: JSON.stringify({ owner_id: ownerId, pack }),
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось проверить pack.");
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!preview?.valid || !ownerId) return;
    let pack: unknown;
    try {
      pack = JSON.parse(raw);
    } catch {
      setError("Файл не содержит валидный JSON.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setResult(
        await apiFetch("/api/admin/content/import/apply", {
          method: "POST",
          body: JSON.stringify({ owner_id: ownerId, pack }),
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Импорт не выполнен.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-foreground/30 px-0 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] sm:flex sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Импорт контента"
        onClick={(event) => event.stopPropagation()}
        className="absolute inset-x-0 bottom-0 flex max-h-[calc(100dvh-env(safe-area-inset-top)-4rem-env(safe-area-inset-bottom))] flex-col overflow-hidden rounded-t-3xl bg-surface shadow-lift sm:static sm:max-h-[94dvh] sm:w-full sm:max-w-4xl sm:rounded-3xl"
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-border bg-surface p-5 sm:p-6">
          <div>
            <div className="flex items-center gap-2">
              <FileJson className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl font-bold">Импорт контента</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Проверка обязательна. Новые игры создаются private.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть импорт" className="btn-ghost p-2"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 space-y-5 overflow-y-auto p-5 sm:p-6">
          {result ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-success-soft p-5 text-success">
                <h3 className="font-display text-xl font-bold">Импорт завершён</h3>
                <p className="mt-2 text-sm">Создано: <b>{result.created}</b>. Уже импортировано и пропущено: <b>{result.skipped}</b>.</p>
              </div>
              <button type="button" className="btn-accent w-full justify-center" onClick={onImported}>Перейти к играм</button>
            </div>
          ) : (
            <>
              <div className="sticky top-0 z-10 -mx-5 -mt-5 bg-surface px-5 pb-3 pt-5 sm:-mx-6 sm:px-6 sm:pt-6">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
                  <label className="block text-sm font-semibold">
                  Автор игр
                  <select aria-label="Автор игр" aria-invalid={!!ownerError} className={`input-base mt-1 ${ownerError ? "border-danger ring-2 ring-danger/20" : ""}`} value={ownerId} onChange={(event) => { setOwnerId(event.target.value); setPreview(null); setOwnerError(""); }}>
                    <option value="">Выберите автора</option>
                    {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name || owner.email || owner.id}</option>)}
                  </select>
                  {ownerError && <span role="alert" className="mt-1 block text-xs font-semibold text-danger">{ownerError}</span>}
                  </label>
                  <a href="/content/library-v1.json" download className="btn-ghost self-end justify-center"><Download className="h-4 w-4" /> Скачать пример JSON</a>
                </div>
              </div>
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Источник JSON">
                <button type="button" role="tab" aria-selected={mode === "file"} className={mode === "file" ? "btn-accent" : "btn-ghost"} onClick={() => setMode("file")}>Загрузить .json</button>
                <button type="button" role="tab" aria-selected={mode === "paste"} className={mode === "paste" ? "btn-accent" : "btn-ghost"} onClick={() => setMode("paste")}>Вставить JSON</button>
              </div>
              {mode === "file" ? (
                <label className="block rounded-2xl border-2 border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                  <span className="mb-2 block font-semibold text-foreground">JSON-файл content pack</span>
                  <input aria-label="JSON-файл" type="file" accept=".json,application/json" onChange={(event) => void readFile(event.target.files?.[0])} />
                </label>
              ) : (
                <textarea aria-label="Вставить JSON" className="input-base min-h-48 font-mono text-xs" value={raw} onChange={(event) => { setRaw(event.target.value); setPreview(null); }} placeholder={'{"schema_version":1,"games":[]}'}/>
              )}
              {raw && <p className="break-all text-xs text-muted-foreground">Загружено символов: {raw.length}</p>}
              <button type="button" className="btn-accent w-full justify-center" disabled={busy || !raw.trim()} onClick={() => void validate()}>{busy ? "Проверяем…" : "Проверить и показать preview"}</button>
              {error && <div className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</div>}
              {preview && <OfficialImportPreviewCard preview={preview} />}
              {preview?.valid && <button type="button" className="btn-accent w-full justify-center" disabled={busy} onClick={() => void apply()}>{busy ? "Импортируем…" : "Создать новые игры"}</button>}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function OfficialImportPreviewCard({ preview }: { preview: OfficialImportPreview }) {
  const errors = preview.errors ?? [];
  const warnings = preview.warnings ?? [];
  return (
    <div className="space-y-4 rounded-2xl border border-border p-4 sm:p-5">
      <div className={`rounded-xl p-3 text-sm font-semibold ${preview.valid ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
        {preview.valid ? "Проверка пройдена. Импорт доступен." : "Импорт заблокирован: исправьте ошибки ниже."}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        {(["quiz", "jeopardy", "millionaire"] as const).map((kind) => <div key={kind} className="rounded-xl bg-surface-muted p-3"><b className="block text-lg">{preview.counts?.[kind] ?? 0}</b><span>{kindLabel(kind)}</span></div>)}
      </div>
      {preview.owner && <p className="text-sm">Автор: <b>{preview.owner.name}</b></p>}
      {errors.length > 0 && <div className="space-y-2"><h3 className="text-sm font-bold text-danger">Ошибки</h3>{errors.map((item, index) => <p key={`${item.path}-${index}`} className="break-words text-sm text-danger"><b>{item.path}</b>: {item.message}</p>)}</div>}
      {warnings.length > 0 && <div className="space-y-2"><h3 className="text-sm font-bold text-amber-700">Предупреждения</h3>{warnings.map((item, index) => <p key={`${item.path}-${index}`} className="break-words text-sm text-amber-700"><b>{item.path}</b>: {item.message}</p>)}</div>}
      <div className="grid max-h-[45dvh] gap-3 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-2">
        {(preview.games ?? []).map((game) => <div key={game.content_id} className="rounded-xl bg-surface-muted p-3 text-sm"><div className="flex items-start justify-between gap-2"><b className="break-words">{game.title}</b><span className="shrink-0 rounded-full bg-surface px-2 py-1 text-xs">{kindLabel(game.kind)}</span></div><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{game.content_id}</p><div className="mt-2 flex flex-wrap gap-1">{(game.tags ?? []).map((tag) => <span key={tag} className="rounded-full bg-primary-soft px-2 py-1 text-xs text-primary">#{tag}</span>)}{game.status === "already_imported" && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">будет пропущена</span>}</div></div>)}
      </div>
    </div>
  );
}

function AIDashboard() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<AIData>();
  useEffect(() => {
    setData(undefined);
    apiFetch(`/api/admin/analytics/ai?period=${period}`)
      .then(setData)
      .catch(() => setData({ error: true }));
  }, [period]);
  if (!data) return <LoadingCard />;
  if (data.error) return <ErrorState />;
  return (
    <div className="space-y-6">
      <SectionHeading title="AI" action={<PeriodSelector period={period} onChange={setPeriod} />} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="AI requests" value={data.requests} />
        <StatCard
          label="Success rate"
          value={data.success_rate == null ? "—" : `${data.success_rate}%`}
        />
        <StatCard label="Errors" value={data.errors} />
        <StatCard label="Всего токенов" value={data.total_tokens} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface-card p-5">
          <h2 className="font-display text-lg font-bold">Запросы по дням</h2>
          <ActivityChart data={data.daily ?? []} metric="requests" />
        </div>
        <KeyValueCard title="По операциям" values={data.by_type ?? {}} />
        <KeyValueCard title="По моделям" values={data.by_model ?? {}} />
        <div className="surface-card p-5">
          <h2 className="font-display text-lg font-bold">Последние AI ошибки</h2>
          <div className="mt-3 space-y-2">
            {(data.recent_errors ?? []).length ? (
              (data.recent_errors ?? []).map((row, index) => (
                <div
                  key={row.id ?? index}
                  className="rounded-lg bg-danger-soft p-3 text-sm text-danger"
                >
                  {row.error || "Ошибка AI"}
                </div>
              ))
            ) : (
              <EmptyState text="AI errors отсутствуют в доступных логах." />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
function PromptTester() {
  const [mode, setMode] = useState("question");
  const [topic, setTopic] = useState("Древний Рим");
  const [wishes, setWishes] = useState("");
  const [result, setResult] = useState<PromptResult>();
  const [loading, setLoading] = useState(false);
  const routes: Record<string, string> = {
    question: "/api/admin/ai/test",
    quiz: "/api/admin/ai/test-quiz",
    categories: "/api/admin/ai/test-jeopardy-categories",
    questions: "/api/admin/ai/test-jeopardy-questions",
  };
  const run = async () => {
    setLoading(true);
    setResult(undefined);
    try {
      const body =
        mode === "question"
          ? { topic, type: "choice", wishes }
          : mode === "quiz"
            ? { topic, count: 10, wishes }
            : mode === "categories"
              ? { topic, wishes }
              : { category: topic, empty_slots: [100, 200, 300, 400, 500], wishes };
      setResult(await apiFetch(routes[mode], { method: "POST", body: JSON.stringify(body) }));
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Ошибка запроса" });
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="space-y-6">
      <SectionHeading title="Тестер промптов" />
      <p className="text-sm text-muted-foreground">
        Использует production Groq-клиент и те же prompt generators, что AI generation.
      </p>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="surface-card space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            {[
              { key: "question", label: "Вопрос" },
              { key: "quiz", label: "Полный Quiz" },
              { key: "categories", label: "Категории Jeopardy" },
              { key: "questions", label: "Вопросы Jeopardy" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setMode(item.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${mode === item.key ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted-foreground"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="block text-sm font-semibold">
            {mode === "questions" ? "Категория" : "Тема"}
            <input
              className="input-base mt-1"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold">
            Пожелания
            <input
              className="input-base mt-1"
              value={wishes}
              onChange={(event) => setWishes(event.target.value)}
              placeholder="Необязательно"
            />
          </label>
          <button
            type="button"
            disabled={loading || !topic.trim()}
            onClick={() => void run()}
            className="btn-accent w-full justify-center"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Генерируем…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Запустить тест
              </>
            )}
          </button>
        </div>
        <div className="surface-card min-w-0 space-y-4 p-5">
          <h2 className="font-display text-lg font-bold">Результат</h2>
          {result ? (
            <>
              <ResultField
                title="Статус"
                value={result.error ? result.error : "Успешно"}
                danger={Boolean(result.error)}
              />
              <ResultField title="Модель" value={result.model ?? "Production default"} />
              <ResultField
                title="Время"
                value={result.duration_ms == null ? "—" : `${result.duration_ms} мс`}
              />
              <details open>
                <summary className="cursor-pointer text-sm font-semibold text-primary">
                  Фактический prompt
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-surface-muted p-3 text-xs whitespace-pre-wrap">
                  {result.prompt}
                </pre>
              </details>
              <details>
                <summary className="cursor-pointer text-sm font-semibold">Raw response</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-surface-muted p-3 text-xs whitespace-pre-wrap">
                  {result.raw}
                </pre>
              </details>
              {result.parsed && (
                <details open>
                  <summary className="cursor-pointer text-sm font-semibold text-success">
                    Parsed result
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-surface-muted p-3 text-xs whitespace-pre-wrap">
                    {JSON.stringify(result.parsed, null, 2)}
                  </pre>
                </details>
              )}
            </>
          ) : (
            <EmptyState text="Запустите тест, чтобы увидеть фактические prompt и response." />
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorCenter() {
  const [period, setPeriod] = useState<Period>("30d");
  const [errors, setErrors] = useState<ErrorRecord[]>([]);
  const [selected, setSelected] = useState<ErrorRecord>();
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      setErrors(await apiFetch(`/api/admin/errors?period=${period}`));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // load intentionally follows the selected period only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);
  return (
    <div className="space-y-6">
      <SectionHeading
        title="Ошибки"
        action={<PeriodSelector period={period} onChange={setPeriod} />}
      />
      <p className="text-sm text-muted-foreground">
        Показываются application errors; технические детали очищаются от токенов, ключей и паролей
        перед сохранением.
      </p>
      {loading ? (
        <LoadingCard />
      ) : (
        <div className="surface-card divide-y divide-border">
          {errors.length ? (
            errors.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className="flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-bold text-danger">
                      {item.source}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(item.created_at)}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold">{item.message}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{item.path || "—"}</p>
                </div>
                <ChevronDown className="mt-1 h-4 w-4 shrink-0 -rotate-90 text-muted-foreground" />
              </button>
            ))
          ) : (
            <EmptyState text="Ошибок за выбранный период нет." />
          )}
        </div>
      )}
      {selected && <ErrorDetails error={selected} onClose={() => setSelected(undefined)} />}
    </div>
  );
}
function ErrorDetails({ error, onClose }: { error: ErrorRecord; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[70] bg-foreground/30 p-4 sm:flex sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Детали ошибки"
        onClick={(event) => event.stopPropagation()}
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-auto rounded-t-3xl bg-surface p-5 shadow-lift sm:static sm:w-full sm:max-w-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Детали ошибки</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть детали ошибки"
            className="btn-ghost p-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <dl className="mt-5 space-y-3 text-sm">
          <Detail term="Время" value={error.created_at} />
          <Detail term="Источник" value={error.source} />
          <Detail term="Путь" value={error.path} />
          <Detail term="Request ID" value={error.request_id} />
          <Detail term="Сообщение" value={error.message} />
          <Detail term="Технические детали" value={error.details || "—"} />
        </dl>
      </section>
    </div>
  );
}

function SettingsWorkspace() {
  const [limits, setLimits] = useState<LimitSettings>();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    apiFetch("/api/admin/settings/limits")
      .then(setLimits)
      .catch(() => setLimits({ error: true, user: {}, admin: {} }));
  }, []);
  const change = (role: "user" | "admin", key: string, value: string) =>
    setLimits(
      (current) =>
        current && {
          ...current,
          [role]: { ...current[role], [key]: value === "" ? null : Number(value) },
        },
    );
  const save = async () => {
    setSaving(true);
    try {
      setLimits(
        await apiFetch("/api/admin/settings/limits", {
          method: "PUT",
          body: JSON.stringify(limits),
        }),
      );
    } finally {
      setSaving(false);
    }
  };
  if (!limits) return <LoadingCard />;
  if (limits.error) return <ErrorState />;
  const rows = [
    ["saved_games", "Всего сохранённых игр"],
    ["public_games", "Публичных игр"],
    ["ai_generations_per_day", "AI-генераций / день"],
    ["ai_file_generations_per_day", "AI из файла / день"],
    ["ai_upload_bytes", "Размер AI-upload файла (байты)"],
  ];
  return (
    <div className="space-y-6">
      <SectionHeading title="Настройки" />
      <div className="surface-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Lock className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-display text-lg font-bold">Ограничения</h2>
            <p className="text-sm text-muted-foreground">
              Проверяются сервером при сохранении игр и AI generation.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-3">Ограничение</th>
                <th className="pb-3">Пользователь</th>
                <th className="pb-3">Администратор</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([key, label]) => (
                <tr key={key} className="border-b border-border last:border-0">
                  <td className="py-3 font-semibold">{label}</td>
                  {(["user", "admin"] as const).map((role) => (
                    <td key={role} className="py-3 pr-3">
                      <label className="flex items-center gap-2">
                        <input
                          aria-label={`${label}: ${role}`}
                          type="number"
                          min="0"
                          className="input-base w-28"
                          disabled={limits[role][key] == null}
                          value={limits[role][key] ?? ""}
                          onChange={(event) => change(role, key, event.target.value)}
                        />
                        <span className="text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={limits[role][key] == null}
                            onChange={(event) =>
                              setLimits(
                                (current) =>
                                  current && {
                                    ...current,
                                    [role]: {
                                      ...current[role],
                                      [key]: event.target.checked ? null : 0,
                                    },
                                  },
                              )
                            }
                          />{" "}
                          Без ограничений
                        </span>
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="btn-accent mt-5"
        >
          {saving ? "Сохраняем…" : "Сохранить ограничения"}
        </button>
      </div>
      <div className="surface-card p-5">
        <h2 className="font-display text-lg font-bold">AI и система</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          В текущей архитектуре нет других безопасно конфигурируемых runtime-настроек. Декоративные
          controls не добавлены.
        </p>
      </div>
    </div>
  );
}

function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      {action}
    </div>
  );
}
function LoadingCard() {
  return (
    <div className="surface-card flex min-h-32 items-center justify-center p-6 text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Загрузка…
    </div>
  );
}
function ErrorState() {
  return (
    <div className="surface-card p-6 text-sm text-danger">
      Не удалось загрузить данные. Повторите попытку.
    </div>
  );
}
function EmptyState({ text }: { text: string }) {
  return <p className="p-4 text-sm text-muted-foreground">{text}</p>;
}
function VisibilityBadge({ value }: { value?: string }) {
  return (
    <span className="rounded-full bg-surface-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
      {visibilityLabel(value)}
    </span>
  );
}
function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-1 font-semibold ${active ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}
    >
      {active ? "Активен" : "Заблокирован"}
    </span>
  );
}
function KeyValueCard({ title, values }: { title: string; values: Record<string, number> }) {
  return (
    <div className="surface-card p-5">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <div className="mt-3 space-y-2">
        {Object.entries(values).length ? (
          Object.entries(values).map(([key, value]) => (
            <div
              key={key}
              className="flex justify-between rounded-lg bg-surface-muted px-3 py-2 text-sm"
            >
              <span>{key}</span>
              <span className="font-semibold">{value}</span>
            </div>
          ))
        ) : (
          <EmptyState text="Нет данных." />
        )}
      </div>
    </div>
  );
}
function ResultField({
  title,
  value,
  danger,
}: {
  title: string;
  value: ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 text-sm ${danger ? "bg-danger-soft text-danger" : "bg-surface-muted"}`}
    >
      <span className="font-semibold">{title}: </span>
      {value}
    </div>
  );
}
function Detail({ term, value }: { term: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{term}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words">{value || "—"}</dd>
    </div>
  );
}
