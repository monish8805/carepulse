import { useQuery } from "@tanstack/react-query";
import { getMe, restoreSession } from "@/lib/api";

// The current user (`data`), or null when logged out. Never errors —
// restoreSession() resolves to null instead of throwing.
//
// Restored once per page load, then cached for the whole visit: an expired
// access token is renewed by apiFetch itself (refresh-and-retry on 401), so
// nothing needs to re-run restoreSession() on every page. Login writes the
// new user in here; logout clears the whole cache; a refresh that fails
// inside apiFetch sets it to null (see onSessionLost in src/router.tsx).
export function useSession() {
  const query = useQuery({
    queryKey: ["session"],
    queryFn: restoreSession,
    staleTime: Infinity,
  });
  return { isPending: query.isPending, data: query.data };
}

// The session user plus their current hospital context (role, canManageStaff,
// canViewPatients). Those flags decide what the page shows, so every page
// mount re-asks the backend — a permission change takes effect on the very
// next page visit, even a client-side navigation.
export function useMe() {
  const session = useSession();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    enabled: !!session.data,
    // Permission flags are never "fresh" — re-asked on every page mount.
    staleTime: 0,
    gcTime: 0,
  });
  // Wait for this mount's own fetch — never render permission flags an
  // earlier page cached. A failed refetch keeps the previous `data` next to
  // the error, so only a successful fetch counts as having a user.
  const ready = me.isFetchedAfterMount;
  return {
    isPending: session.isPending || (!!session.data && !ready),
    user: ready && me.isSuccess ? me.data : null,
    error: me.error,
  };
}
