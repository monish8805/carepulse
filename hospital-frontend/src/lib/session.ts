import { useQuery } from "@tanstack/react-query";
import { getMe, restoreSession } from "@/lib/api";

// The current user (`data`), or null when logged out. Never errors —
// restoreSession() resolves to null instead of throwing.
export function useSession() {
  const query = useQuery({
    queryKey: ["session"],
    queryFn: restoreSession,
    // Never "fresh": the refetch on every page mount is what refreshes the token.
    staleTime: 0,
    gcTime: 0,
  });
  // Every page mount re-runs restoreSession(), which is also what hands the
  // page a fresh 15-minute access token — so a page stays pending until its
  // OWN restore finishes, rather than rendering from whatever an earlier page
  // cached. Otherwise its data queries could fire with an expired token, and a
  // cached user/`null` from before a login/logout could flash first.
  const ready = query.isFetchedAfterMount;
  return {
    isPending: !ready,
    data: ready ? (query.data ?? null) : undefined,
  };
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
  // Same reasoning as useSession: wait for this mount's own fetch, never
  // render permission flags an earlier page cached.
  const ready = me.isFetchedAfterMount;
  return {
    isPending: session.isPending || (!!session.data && !ready),
    user: ready ? (me.data ?? null) : null,
    error: me.error,
  };
}
