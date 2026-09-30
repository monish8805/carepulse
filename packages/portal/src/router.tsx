import { QueryClient } from "@tanstack/react-query";
import { onSessionLost } from "@carepulse/api";
import { LoadingState, RouteError } from "@carepulse/ui";

// The Query client every portal uses — create one per router (src/router.tsx).
export function createQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Most failures here are 401/403/404 from the backend, which a retry
        // can't fix — it would only delay showing the error by several seconds.
        retry: false,
        // Data a hover-preload fetched stays fresh long enough to still be
        // used when the click lands. Access-deciding queries (session, me, the
        // hospital access gate) override this back to 0.
        staleTime: 20_000,
      },
    },
  });

  // apiFetch couldn't renew an expired access token (refresh cookie gone or
  // revoked): show the logged-out state rather than an error.
  onSessionLost(() => queryClient.setQueryData(["session"], null));

  return queryClient;
}

// Spread into every portal's createRouter({ ... }).
export const routerDefaults = {
  scrollRestoration: true,
  // Hovering (or focusing) a link for 350ms loads that page's code and runs
  // its loader, which prefetches its data into the Query cache.
  defaultPreload: "intent",
  defaultPreloadDelay: 350,
  // Freshness is Query's job (staleTime above) — the router re-runs a loader
  // every time, and the loader's prefetch is a no-op while the data is fresh.
  defaultPreloadStaleTime: 0,
  defaultErrorComponent: RouteError,
  defaultPendingComponent: () => <LoadingState />,
} as const;
