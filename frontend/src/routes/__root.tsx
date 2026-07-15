import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "../hooks/use-auth";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-black text-primary">404</h1>
        <h2 className="mt-4 font-display text-xl font-bold">Такой страницы нет</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Возможно, ссылка устарела или страница ещё не создана.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90"
          >
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-bold">Что-то пошло не так</h1>
        <p className="mt-2 text-xs text-red-500 break-all">{error.message}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Попробуйте перезагрузить страницу или вернитесь на главную.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Попробовать снова
          </button>
          <a
            href="/"
            className="rounded-full border border-border-strong bg-surface px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-surface-muted"
          >
            На главную
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "IslandQuiz — конструктор квизов и викторин" },
      {
        name: "description",
        content:
          "Создавайте квизы, свою игру и миллионера. Пять тем, экспорт в Excel, LaTeX-формулы, drag-and-drop и всё локально в вашем браузере.",
      },
      { property: "og:title", content: "IslandQuiz — конструктор квизов и викторин" },
      {
        property: "og:description",
        content: "Создавайте квизы, свою игру и миллионера. Пять тем, экспорт в Excel, LaTeX-формулы, drag-and-drop и всё локально в вашем браузере.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "IslandQuiz — конструктор квизов и викторин" },
      { name: "twitter:description", content: "Создавайте квизы, свою игру и миллионера. Пять тем, экспорт в Excel, LaTeX-формулы, drag-and-drop и всё локально в вашем браузере." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/78583ab5-d93a-4ad7-b970-7841af0df6d4/id-preview-8d6a3115--6d712a97-ead2-4134-ac65-6680e230aa38.lovable.app-1783779517790.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/78583ab5-d93a-4ad7-b970-7841af0df6d4/id-preview-8d6a3115--6d712a97-ead2-4134-ac65-6680e230aa38.lovable.app-1783779517790.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@700;800;900&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}
