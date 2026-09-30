import { useQuery } from "@tanstack/react-query";
import { restoreSession } from "@/lib/api";

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
