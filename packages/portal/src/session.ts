import { useQuery } from "@tanstack/react-query";
import { restoreRegisteredSession } from "@carepulse/api";

// The current user (`data`), or null when logged out. Never errors —
// restoreSession() resolves to null instead of throwing.
//
// Restores the portal the app registered with setRefreshPortal (its
// src/lib/api.ts). Restored once per page load, then cached for the whole visit: an expired
// access token is renewed by apiFetch itself (refresh-and-retry on 401), so
// nothing needs to re-run restoreSession() on every page. Login writes the
// new user in here; logout clears the whole cache; a refresh that fails
// inside apiFetch sets it to null (see onSessionLost in src/router.tsx).
export function useSession() {
  const query = useQuery({
    queryKey: ["session"],
    queryFn: restoreRegisteredSession,
    staleTime: Infinity,
  });
  return { isPending: query.isPending, data: query.data };
}
