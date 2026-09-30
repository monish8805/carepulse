import { queryOptions } from "@tanstack/react-query";
import type { QueryClient, FetchQueryOptions, QueryKey } from "@tanstack/react-query";
import { getAccessToken } from "@shared/api";
import { getBackendHealth, listHospitals } from "@/lib/api";

// Route loaders call this on hover-preload and on navigation. Skipped while
// there is no access token yet (a fresh page load, before the page's own
// restoreSession() has run) — the request would only 401; the page fetches the
// data itself once its session is back.
export function prefetch<T, TKey extends QueryKey>(queryClient: QueryClient, options: FetchQueryOptions<T, Error, T, TKey>) {
  if (!getAccessToken()) return;
  queryClient.prefetchQuery(options);
}

export const healthQuery = queryOptions({ queryKey: ["health"], queryFn: getBackendHealth });

export const hospitalsQuery = queryOptions({ queryKey: ["hospitals"], queryFn: listHospitals });
