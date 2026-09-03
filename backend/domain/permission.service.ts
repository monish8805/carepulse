import { HospitalMembershipModel } from "../models/hospitalMembership.model";
import { AccessRoleModel } from "../models/accessRole.model";
import { HospitalModel } from "../models/hospital.model";
import { PERMISSIONS, Permission } from "../config/permissions";

// The one place that turns (user, hospital) into an actual permission set.
// Always queried fresh from the database — nothing here is cached, and nothing
// is ever read from the JWT. That's what makes a permission change in MongoDB
// take effect on the very next request, with no logout/login/refresh needed.
//
// Fails closed at every step: a missing/inactive membership, a missing/inactive
// AccessRole, or invalid permission data all resolve to an empty set. Missing
// role information is never treated as unrestricted access — the one
// deliberate exception is role: "admin" below, which is explicit information
// (not "missing"), not a fallback.
export async function resolvePermissions(
  userId: string | undefined,
  hospitalId: string | undefined
): Promise<Permission[]> {
  if (!userId || !hospitalId) return [];

  const membership = await HospitalMembershipModel.findOne({ userId, hospitalId, status: "active" });
  if (!membership) return [];

  // A disabled hospital resolves to zero permissions too, even mid-session —
  // same fail-closed treatment as every other check in this function.
  const hospital = await HospitalModel.findById(hospitalId);
  if (!hospital?.isActive) return [];

  // The hospital administrator holds every permission — current and future —
  // without ever needing an AccessRole: a deliberate product decision that
  // the admin sees/can do everything a hospital account can, while everyone
  // else is limited to whatever AccessRole they're assigned. This still sits
  // below the active-membership/active-hospital checks above, so a
  // removed/disabled admin membership or a disabled hospital still resolves
  // to no permissions, same as anyone else.
  if (membership.role === "admin") return [...PERMISSIONS];

  if (!membership.accessRoleId) return [];

  // hospital: hospitalId is re-checked here too, not just membership.hospitalId —
  // this is what stops a membership's accessRoleId ever resolving to another
  // hospital's AccessRole, even if such a mismatch existed in the data.
  const accessRole = await AccessRoleModel.findOne({
    _id: membership.accessRoleId,
    hospital: hospitalId,
    isActive: true,
  });
  if (!accessRole) return [];

  // Defensive: only ever return permissions still present in the catalogue,
  // in case stale/invalid strings exist in older data.
  const validPermissions: readonly string[] = PERMISSIONS;
  return accessRole.permissions.filter((permission): permission is Permission =>
    validPermissions.includes(permission)
  );
}
