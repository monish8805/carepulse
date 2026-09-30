import { queryOptions } from "@tanstack/react-query";
import type { QueryClient, FetchQueryOptions, QueryKey } from "@tanstack/react-query";
import type { HospitalContext, SessionUser } from "@shared/types";
import { getAccessToken } from "@shared/api";
import {
  getBackendHealth,
  listAccessRoles,
  listPendingAccessRequests,
  listStaff,
  listGrantedPatients,
} from "@/lib/api";

// Route loaders call this on hover-preload and on navigation. Skipped while
// there is no access token yet (a fresh page load, before the page's own
// restoreSession() has run) — the request would only 401; the page fetches the
// data itself once its session is back.
export function prefetch<T, TKey extends QueryKey>(queryClient: QueryClient, options: FetchQueryOptions<T, Error, T, TKey>) {
  if (!getAccessToken()) return;
  queryClient.prefetchQuery(options);
}

export const healthQuery = queryOptions({ queryKey: ["health"], queryFn: getBackendHealth });

export const accessRolesQuery = queryOptions({ queryKey: ["accessRoles"], queryFn: listAccessRoles });

export const pendingRequestsQuery = queryOptions({
  queryKey: ["accessRequests", "pending"],
  queryFn: listPendingAccessRequests,
});

export const staffQuery = queryOptions({ queryKey: ["staff"], queryFn: listStaff });

export const grantedPatientsQuery = queryOptions({ queryKey: ["grantedPatients"], queryFn: listGrantedPatients });

// What HospitalLayout's access gate last resolved (it stays mounted around every
// portal page), so a loader only prefetches lists this user can actually load.
// Only decides what to prefetch — every page still checks its own fresh useMe(),
// and the backend enforces every request regardless.
export function cachedHospitalContext(queryClient: QueryClient): HospitalContext | null {
  return queryClient.getQueryData<{ user: SessionUser }>(["hospitalAccess"])?.user.hospital ?? null;
}
