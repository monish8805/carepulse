import { queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { HospitalContext, SessionUser } from "@carepulse/api/types";
import {
  getBackendHealth,
  listAccessRoles,
  listPendingAccessRequests,
  listStaff,
  listGrantedPatients,
} from "@/lib/api";

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
