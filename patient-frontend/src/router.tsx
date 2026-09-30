import { createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // The access token lives 15 minutes and apiFetch doesn't refresh it on a
        // 401 — a page only gets a fresh one by calling restoreSession() when it
        // mounts (see useSession). A background refetch on tab focus, after the
        // tab sat idle, would fail with an expired token and show an error.
        refetchOnWindowFocus: false,
        // Most failures here are 401/403/404 from the backend, which a retry
        // can't fix — it would only delay showing the error by several seconds.
        retry: false,
        // Data a hover-preload fetched stays fresh long enough to still be
        // used when the click lands. Access-deciding queries (session, me, the
        // hospital access gate) override this back to 0 — see session.ts.
        staleTime: 20_000,
      },
    },
  });

  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Hovering (or focusing) a link for 350ms loads that page's code and runs
    // its loader, which prefetches its data into the Query cache.
    defaultPreload: "intent",
    defaultPreloadDelay: 350,
    // Freshness is Query's job (staleTime above) — the router re-runs a loader
    // every time, and the loader's prefetch is a no-op while the data is fresh.
    defaultPreloadStaleTime: 0,
    Wrap: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
