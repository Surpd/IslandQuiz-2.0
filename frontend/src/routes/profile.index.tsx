import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { Avatar, AVATAR_COLORS } from "@/components/avatar";
import { useAuth } from "@/hooks/use-auth";
import { deleteAccount, linkEmailPassword, listGames, startTelegramLink } from "@/lib/api";
import type { StoredGame } from "@/lib/types";
import { Upload, Trash2 } from "lucide-react";

export const Route = createFileRoute("/profile/")({
  head: () => ({ meta: [{ title: "Профиль — IslandQuiz" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, isLoading, updateProfile, logout } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [subject, setSubject] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mine, setMine] = useState<StoredGame[]>([]);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);


  useEffect(() => {
    if (!isLoading && !user) nav({ to: "/login" });
  }, [isLoading, user, nav]);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setBio(user.bio ?? "");
      setSubject(user.subject ?? "");
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    listGames().then((data) => setMine(data.games.filter((g) => g.ownerId === user.id)));
  }, [user]);

  if (!user) {
    return (
      <div className="min-h-screen bg-surface">
        <SiteHeader />
      </div>
    );
  }

  const onSave = async () => {
    setSaving(true);
    await updateProfile({
      name: name.trim() || user.name,
      bio: bio.trim(),
      subject: subject.trim(),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };


  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-6 flex min-w-0 items-center gap-4">
          <Avatar name={user.name} avatar={user.avatar} size={64} />
          <div className="min-w-0">
            <h1 className="truncate font-display text-3xl font-black">{user.name}</h1>
            <p className="truncate text-sm text-muted-foreground">{user.email ?? "Telegram-аккаунт"}</p>
          </div>
        </div>

        <AvatarPicker />

        <div className="surface-card mb-6 p-6">
          <h2 className="font-display text-lg font-bold">Способы входа</h2>
          <p className="mt-1 text-sm text-muted-foreground">Добавьте запасной способ входа в аккаунт.</p>
          {!user.email && (
            <div className="mt-4 flex flex-col gap-3">
              <input className="input-base" type="email" placeholder="Email" value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} />
              <input className="input-base" type="password" placeholder="Пароль" value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} />
              <button className="btn-accent" disabled={accountBusy || !accountEmail || accountPassword.length < 6} onClick={async () => {
                setAccountBusy(true);
                try {
                  await linkEmailPassword(accountEmail, accountPassword);
                  window.location.reload();
                } finally {
                  setAccountBusy(false);
                }
              }}>Добавить email и пароль</button>
            </div>
          )}
          {!user.telegramId && (
            <button className="btn-ghost mt-4" onClick={async () => {
              const result = await startTelegramLink();
              if (result.url) window.location.href = result.url;
            }}>Привязать Telegram</button>
          )}
          {user.email && <p className="mt-3 text-sm text-success">Email подключён</p>}
          {user.telegramId && <p className="mt-1 text-sm text-success">Telegram подключён</p>}
        </div>


        <div className="surface-card mb-6 flex flex-col gap-3 p-6">
          <label className="text-sm font-semibold">
            Имя
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-base mt-1 w-full"
            />
          </label>
          <label className="text-sm font-semibold">
            Предмет / направление
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={60}
              placeholder="Математика, история…"
              className="input-base mt-1 w-full"
            />
          </label>
          <label className="text-sm font-semibold">
            О себе
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={280}
              placeholder="Пара слов о себе — видно на публичном профиле."
              className="input-base mt-1 w-full resize-none"
            />
          </label>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <button onClick={onSave} disabled={saving} className="btn-accent justify-center sm:justify-start">
              {saving ? "Сохраняем…" : "Сохранить"}
            </button>
            {saved && <span className="text-sm text-success">Сохранено</span>}
            <Link
              to="/profile/$userId"
              params={{ userId: user.id }}
              className="btn-ghost justify-center sm:justify-start"
            >
              Открыть публичный профиль
            </Link>
          </div>
        </div>

        <div className="surface-card p-6">
          <h2 className="font-display text-lg font-bold">Статистика</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ваших игр: <b className="text-foreground">{mine.length}</b>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Публичных: <b className="text-foreground">{mine.filter((g) => g.visibility === "public").length}</b>
          </p>
          <Link to="/library" className="btn-ghost mt-4 inline-flex">
            Открыть библиотеку
          </Link>
        </div>

        <div className="surface-card mt-6 flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold">Аккаунт</h2>
            <p className="mt-1 text-sm text-muted-foreground">Управление входом и доступом к разделам.</p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            {user.role === "admin" && (
              <Link to="/admin" className="btn-ghost justify-center sm:justify-start">
                Администрирование
              </Link>
            )}
            <button
              onClick={async () => {
                await logout();
                nav({ to: "/" });
              }}
              className="btn-ghost justify-center sm:justify-start"
            >
              Выйти
            </button>
          </div>
        </div>

        <div className="surface-card mt-6 border border-danger/30 p-6">
          <h2 className="font-display text-lg font-bold text-danger">Удаление аккаунта</h2>
          <p className="mt-2 text-sm text-muted-foreground">Удалятся аккаунт и созданные игры.</p>
          <div className="mt-4 flex">
            <button className="btn-ghost justify-center text-danger hover:bg-danger-soft" onClick={async () => {
              if (!window.confirm("Удалить аккаунт и все созданные игры?")) return;
              await deleteAccount();
              await logout();
              nav({ to: "/" });
            }}>Удалить аккаунт</button>
          </div>
        </div>
      </main>
    </div>
  );
}

function AvatarPicker() {
  const { user, updateProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  const currentAvatar = user.avatar;

  const pickColor = async (hex: string) => {
    setBusy(true);
    await updateProfile({ avatar: `color:${hex}` });
    setBusy(false);
  };

  const clearAvatar = async () => {
    setBusy(true);
    await updateProfile({ avatar: "" });
    setBusy(false);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 400 * 1024) {
      alert("Изображение слишком большое (макс. 400 КБ).");
      return;
    }
    setBusy(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const url = String(reader.result || "");
      if (url) await updateProfile({ avatar: url });
      setBusy(false);
    };
    reader.onerror = () => setBusy(false);
    reader.readAsDataURL(file);
  };

  return (
    <div className="surface-card mb-6 flex flex-col gap-3 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-bold">Аватар</h2>
        {currentAvatar && (
          <button
            onClick={clearAvatar}
            disabled={busy}
            className="inline-flex items-center gap-1 text-xs font-semibold text-danger hover:underline"
          >
            <Trash2 className="h-3.5 w-3.5" /> Сбросить
          </button>
        )}
      </div>
      <div className="flex items-center gap-4">
        <Avatar name={user.name} avatar={currentAvatar} size={64} />
        <p className="text-xs text-muted-foreground">
          Выберите цветной кружок с первой буквой имени — или загрузите картинку.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {AVATAR_COLORS.map((c) => {
          const active = currentAvatar === `color:${c}`;
          return (
            <button
              key={c}
              onClick={() => pickColor(c)}
              disabled={busy}
              aria-label={`Цвет ${c}`}
              className={`h-9 w-9 rounded-full ring-offset-2 transition-all ${
                active ? "ring-2 ring-foreground" : "hover:scale-110"
              }`}
              style={{ background: c }}
            />
          );
        })}
      </div>
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onFile}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="btn-ghost"
        >
          <Upload className="h-4 w-4" /> Загрузить своё изображение
        </button>
      </div>
    </div>
  );
}
