import { HeadContent, Link, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import "@fontsource-variable/dm-sans";
// Weight must be listed explicitly — Space Mono only ships 400/700, it has no
// variable-weight axis.
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import appCss from "../styles.css?url";
import { ToastProvider } from "@/components/ui";

// Applies the right theme class before first paint, so there's no flash of
// the wrong theme while React renders. Reads a stored override (ThemeToggle
// writes "cp-theme": "light" | "dark" to localStorage) and falls back to the
// OS preference when nothing's been chosen yet. Must run synchronously,
// inline, as early in <body> as possible — it can't be a regular component,
// since it has to run before React does.
const NO_FLASH_THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("cp-theme");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CarePulse — Hospital" },
      { name: "description", content: "CarePulse hospital frontend" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="text-center">
        <p className="font-mono text-xs font-semibold tracking-wide text-cp-text-muted uppercase dark:text-cp-text-muted-dark">
          404
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-cp-text dark:text-cp-text-dark">Page not found</h1>
        <p className="mt-1 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
          <Link to="/" className="font-medium text-cp-primary hover:underline dark:text-cp-primary-dark">
            Go to home
          </Link>
        </p>
      </div>
    </main>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-cp-page font-sans text-cp-text antialiased dark:bg-cp-page-dark dark:text-cp-text-dark">
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
        <ToastProvider>{children}</ToastProvider>
        <TanStackDevtools
          config={{ position: "bottom-right" }}
          plugins={[
            { name: "TanStack Router", render: <TanStackRouterDevtoolsPanel /> },
            { name: "TanStack Query", render: <ReactQueryDevtoolsPanel /> },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
