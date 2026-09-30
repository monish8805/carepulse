import { useQuery } from "@tanstack/react-query";
import { useSession } from "@carepulse/portal";
import { getMe } from "@/lib/api";

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
