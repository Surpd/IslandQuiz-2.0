import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogIn, Users, Palette } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Avatar, AVATAR_COLORS } from "@/components/avatar";
import { joinRoom } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { LIMITS } from "@/lib/limits";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: "Присоединиться — IslandQuiz" },
      { name: "description", content: "Введите код комнаты и играйте вместе." },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState<string>("");
  const [showPicker, setShowPicker] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Prefill from profile once, if logged in.
  useEffect(() => {
    if (user && !prefilled) {
      setNickname((n) => n || user.name);
      setAvatar((a) => a || user.avatar || "");
      setPrefilled(true);
    }
  }, [user, prefilled]);

  const effectiveAvatar = avatar || nickname;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (code.length !== 4 || !nickname.trim()) {
      setError("Введите 4-значный код и имя");
      return;
    }
    setLoading(true);
    const res = await joinRoom(code, nickname.trim(), effectiveAvatar);
    setLoading(false);
    if (!res.success) {
      setError(res.error ?? "Не удалось присоединиться");
      return;
    }
    try {
      sessionStorage.setItem(
        `islandquiz.me.${code}`,
        JSON.stringify({ playerId: res.player_id, nickname, avatar: effectiveAvatar }),
      );
    } catch {
      /* ignore */
    }
    navigate({ to: "/room/$code/play", params: { code } });
  };

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-lg px-6 py-16">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
          <Users className="h-3.5 w-3.5" /> Онлайн-комната
        </div>
        <h1 className="mb-2 font-display text-4xl font-bold tracking-tight">Присоединиться</h1>
        <p className="mb-8 text-muted-foreground">
          {user ? "Имя и аватарка взяты из профиля — можно изменить." : "Введите код с экрана учителя."}
        </p>

        <form onSubmit={submit} className="surface-card space-y-5 p-6">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Код комнаты
            </span>
            <input
              inputMode="numeric"
              maxLength={4}
              className="input-base text-center font-display text-3xl font-bold tracking-[0.5em]"
              placeholder="0000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ваше имя{" "}
              <span className="text-muted-foreground/70">
                ({nickname.length}/{LIMITS.nickname})
              </span>
            </span>
            <input
              className="input-base"
              placeholder="Как вас называть?"
              maxLength={LIMITS.nickname}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </label>
          {nickname.trim() && (
            <div className="rounded-xl bg-surface-muted px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={nickname} avatar={effectiveAvatar} size={40} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-semibold">{nickname}</p>
                  <p className="text-xs text-muted-foreground">
                    {avatar.startsWith("color:")
                      ? "Свой цвет аватарки"
                      : avatar.startsWith("data:") || avatar.startsWith("http")
                        ? "Аватарка из профиля"
                        : "Цвет создан автоматически"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPicker((s) => !s)}
                  className="btn-ghost inline-flex items-center gap-1.5 text-xs"
                >
                  <Palette className="h-3.5 w-3.5" />
                  Цвет
                </button>
              </div>
              {showPicker && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {AVATAR_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Цвет ${c}`}
                      onClick={() => setAvatar(`color:${c}`)}
                      className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                        avatar === `color:${c}` ? "border-foreground" : "border-transparent"
                      }`}
                      style={{ background: c }}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setAvatar("")}
                    className="rounded-full border border-border px-3 text-xs font-semibold hover:bg-surface-muted"
                  >
                    Авто
                  </button>
                </div>
              )}
            </div>
          )}
          {error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn-accent w-full justify-center py-3 text-base"
          >
            <LogIn className="h-4 w-4" /> {loading ? "Подключаемся..." : "Присоединиться"}
          </button>
        </form>
      </main>
    </div>
  );
}
