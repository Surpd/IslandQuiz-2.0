import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sparkles, Users, Gamepad2, BarChart3, Shield, ScrollText, Trash2, Ban, UserCheck, Play,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Админ-панель — IslandQuiz" }] }),
  component: AdminPage,
});

type AdminTab = "ai" | "users" | "games" | "stats" | "limits" | "logs";

function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<AdminTab>("ai");

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-surface">
        <SiteHeader />
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <Shield className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h1 className="font-display text-2xl font-bold">Доступ запрещён</h1>
          <p className="mt-2 text-muted-foreground">Только для администраторов.</p>
          <Link to="/" className="btn-accent mt-4 inline-flex">На главную</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="font-display text-4xl font-bold tracking-tight">Админ-панель</h1>

        {/* Tabs */}
        <div className="mb-8 mt-6 flex flex-wrap gap-2">
          {([
            { key: "ai", label: "AI-лаборатория", icon: Sparkles },
            { key: "users", label: "Пользователи", icon: Users },
            { key: "games", label: "Игры", icon: Gamepad2 },
            { key: "stats", label: "Статистика", icon: BarChart3 },
            { key: "limits", label: "Лимиты", icon: Shield },
            { key: "logs", label: "Логи", icon: ScrollText },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                tab === t.key
                  ? "bg-foreground text-white"
                  : "bg-surface-muted text-muted-foreground hover:bg-border"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === "ai" && <AILab />}
        {tab === "users" && <UsersTab />}
        {tab === "games" && <GamesTab />}
        {tab === "stats" && <StatsTab />}
        {tab === "limits" && <LimitsTab />}
        {tab === "logs" && <LogsTab />}
      </main>
    </div>
  );
}

// ==================== AI LAB ====================

function AILab() {
  const [topic, setTopic] = useState("Древний Рим");
  const [type, setType] = useState("choice");
  const [wishes, setWishes] = useState("");
  const [model, setModel] = useState("llama-3.1-8b-instant");
  const [temperature, setTemperature] = useState(0.8);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const test = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await apiFetch("/api/admin/ai/test", {
        method: "POST",
        body: JSON.stringify({ topic, type, wishes, model, temperature }),
      });
      setResult(res);
    } catch (e: any) {
      setResult({ error: e.message });
    }
    setLoading(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="surface-card p-6 space-y-4">
        <h2 className="font-display text-lg font-bold">Тестовый запрос</h2>
        <label className="block">
          <span className="text-xs font-semibold text-muted-foreground">Тема</span>
          <input className="input-base mt-1" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-muted-foreground">Тип</span>
          <select className="input-base mt-1" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="choice">ABCD</option>
            <option value="bool">Да/Нет</option>
            <option value="text">Текст</option>
            <option value="matching">Пары</option>
            <option value="close">Пропуски</option>
            <option value="ordering">Порядок</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-muted-foreground">Пожелания</span>
          <input className="input-base mt-1" value={wishes} onChange={(e) => setWishes(e.target.value)} placeholder="для 5 класса, сложные..." />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-muted-foreground">Модель</span>
          <select className="input-base mt-1" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="llama-3.1-8b-instant">Llama 3.1 8B</option>
            <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
            <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
            <option value="gemma-2-9b-it">Gemma 2 9B</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-muted-foreground">Temperature: {temperature}</span>
          <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setTemperature(+e.target.value)} className="w-full mt-1" />
        </label>
        <button onClick={test} disabled={loading} className="btn-accent w-full justify-center">
          <Sparkles className="h-4 w-4" /> {loading ? "Генерируем..." : "Тест"}
        </button>
      </div>

      <div className="surface-card p-6 space-y-4 overflow-auto max-h-[80vh]">
        <h2 className="font-display text-lg font-bold">Результат</h2>
        {result ? (
          <>
            {result.error && <p className="text-danger text-sm">{result.error}</p>}
            {result.raw && (
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-primary">Raw ответ</summary>
                <pre className="mt-2 rounded-lg bg-surface-muted p-3 text-xs overflow-auto max-h-60">{result.raw}</pre>
              </details>
            )}
            {result.parsed && (
              <details open>
                <summary className="cursor-pointer text-sm font-semibold text-success">Парсированный ответ</summary>
                <pre className="mt-2 rounded-lg bg-surface-muted p-3 text-xs overflow-auto max-h-60">{JSON.stringify(result.parsed, null, 2)}</pre>
              </details>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Нажмите «Тест» чтобы увидеть ответ от AI.</p>
        )}
      </div>
    </div>
  );
}

// ==================== USERS ====================

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/users");
      setUsers(res || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const action = async (path: string) => {
    await apiFetch(path, { method: "POST" });
    load();
  };

  if (loading) return <div className="surface-card p-6 text-sm text-muted-foreground">Загрузка...</div>;

  return (
    <div className="surface-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary-soft text-left text-xs font-bold uppercase tracking-wider text-primary">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Имя</th>
              <th className="px-4 py-3">Роль</th>
              <th className="px-4 py-3">Бан</th>
              <th className="px-4 py-3">Дата</th>
              <th className="px-4 py-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-4 py-3 font-mono text-xs">{u.id}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3 font-semibold">{u.name}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${u.role === "admin" ? "bg-amber-soft text-amber" : "bg-surface-muted text-muted-foreground"}`}>
                    {u.role || "user"}
                  </span>
                </td>
                <td className="px-4 py-3">{u.banned ? "🚫" : "✅"}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(u.created_at).toLocaleDateString("ru-RU")}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => action(`/api/admin/users/${u.id}/ban`)} className="btn-ghost p-1.5" title="Бан/разбан"><Ban className="h-3.5 w-3.5" /></button>
                    <button onClick={() => action(`/api/admin/users/${u.id}/make-admin`)} className="btn-ghost p-1.5" title="Сделать админом"><UserCheck className="h-3.5 w-3.5" /></button>
                    <button onClick={() => { if (confirm("Удалить пользователя?")) action(`/api/admin/users/${u.id}`); }} className="btn-ghost p-1.5 text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== GAMES ====================

function GamesTab() {
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/games");
      setGames(res || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const action = async (path: string) => {
    await apiFetch(path, { method: "PATCH" });
    load();
  };

  const deleteGame = async (id: string) => {
    if (!confirm("Удалить игру?")) return;
    await apiFetch(`/api/admin/games/${id}`, { method: "DELETE" });
    load();
  };

  if (loading) return <div className="surface-card p-6 text-sm text-muted-foreground">Загрузка...</div>;

  return (
    <div className="surface-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary-soft text-left text-xs font-bold uppercase tracking-wider text-primary">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Название</th>
              <th className="px-4 py-3">Тип</th>
              <th className="px-4 py-3">Владелец</th>
              <th className="px-4 py-3">Видимость</th>
              <th className="px-4 py-3">Действия</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g: any) => (
              <tr key={g.id} className="border-t border-border">
                <td className="px-4 py-3 font-mono text-xs">{g.id}</td>
                <td className="px-4 py-3 font-semibold">{g.data?.config?.title || "—"}</td>
                <td className="px-4 py-3">{g.kind}</td>
                <td className="px-4 py-3">{g.owner_name || "—"}</td>
                <td className="px-4 py-3">{g.visibility}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => action(`/api/admin/games/${g.id}/visibility?visibility=public`)} className="btn-ghost p-1.5 text-xs" title="Публичная">🌐</button>
                    <button onClick={() => action(`/api/admin/games/${g.id}/visibility?visibility=private`)} className="btn-ghost p-1.5 text-xs" title="Приватная">🔒</button>
                    <button onClick={() => deleteGame(g.id)} className="btn-ghost p-1.5 text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== STATS ====================

function StatsTab() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    apiFetch("/api/admin/stats").then(setStats).catch(console.error);
  }, []);

  if (!stats) return <div className="surface-card p-6 text-sm text-muted-foreground">Загрузка...</div>;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="surface-card p-6 text-center">
        <div className="font-display text-4xl font-black text-primary">{stats.users}</div>
        <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">Пользователей</div>
      </div>
      <div className="surface-card p-6 text-center">
        <div className="font-display text-4xl font-black text-primary">{stats.games}</div>
        <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">Игр</div>
      </div>
      <div className="surface-card p-6 text-center">
        <div className="font-display text-4xl font-black text-primary">{stats.quizResults}</div>
        <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">Прохождений</div>
      </div>
      <div className="surface-card p-6 text-center">
        <div className="font-display text-4xl font-black text-primary">{stats.onlineResults}</div>
        <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">Онлайн-игр</div>
      </div>
    </div>
  );
}

// ==================== LIMITS ====================

function LimitsTab() {
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  const load = async () => {
    const res = await apiFetch("/api/admin/limits");
    setLimits(res || {});
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!key || !value) return;
    await apiFetch(`/api/admin/limits?key=${key}&value=${value}`, { method: "POST" });
    setKey("");
    setValue("");
    load();
  };

  return (
    <div className="surface-card p-6 space-y-4">
      <h2 className="font-display text-lg font-bold">Лимиты</h2>
      <div className="flex gap-2">
        <input className="input-base flex-1" placeholder="Ключ" value={key} onChange={(e) => setKey(e.target.value)} />
        <input className="input-base flex-1" placeholder="Значение" value={value} onChange={(e) => setValue(e.target.value)} />
        <button onClick={save} className="btn-accent">Сохранить</button>
      </div>
      <div className="space-y-2">
        {Object.entries(limits).map(([k, v]) => (
          <div key={k} className="flex justify-between rounded-lg bg-surface-muted px-4 py-2 text-sm">
            <span className="font-semibold">{k}</span>
            <span className="font-mono">{v}</span>
          </div>
        ))}
        {Object.keys(limits).length === 0 && <p className="text-sm text-muted-foreground">Нет установленных лимитов.</p>}
      </div>
    </div>
  );
}

// ==================== LOGS ====================

function LogsTab() {
  const [errors, setErrors] = useState<any[]>([]);
  const [aiLogs, setAiLogs] = useState<any[]>([]);

  useEffect(() => {
    apiFetch("/api/admin/logs/errors").then(setErrors).catch(console.error);
    apiFetch("/api/admin/logs/ai").then(setAiLogs).catch(console.error);
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="surface-card p-6">
        <h2 className="font-display text-lg font-bold mb-4">Ошибки</h2>
        {errors.length === 0 ? <p className="text-sm text-muted-foreground">Нет ошибок.</p> : (
          <div className="space-y-2 max-h-96 overflow-auto">
            {errors.map((e, i) => (
              <div key={i} className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{e.message || JSON.stringify(e)}</div>
            ))}
          </div>
        )}
      </div>
      <div className="surface-card p-6">
        <h2 className="font-display text-lg font-bold mb-4">AI-запросы</h2>
        {aiLogs.length === 0 ? <p className="text-sm text-muted-foreground">Нет запросов.</p> : (
          <div className="space-y-2 max-h-96 overflow-auto">
            {aiLogs.map((l, i) => (
              <div key={i} className="rounded-lg bg-surface-muted px-3 py-2 text-xs">
                <span className="font-semibold">{l.model}</span> · {l.topic} · {l.success ? "✅" : "❌"}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}