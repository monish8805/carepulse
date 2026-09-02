import { Types } from "mongoose";
import { HospitalMembershipModel } from "../models/hospitalMembership.model";
import { AccessRoleModel } from "../models/accessRole.model";
import { resolvePermissions } from "./permission.service";
import { Permission } from "../config/permissions";
import { HttpError } from "../utils/httpError";

interface PopulatedUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
}

export interface StaffSummary {
  id: string; // HospitalMembership id
  userId: string;
  userName: string;
  userEmail: string;
  accessRoleName: string | null;
  // Whether this staff member currently holds staff.manage — shown so the
  // frontend can explain why a "Remove" action might be unavailable (peer
  // protection, enforced again server-side in removeStaffMember regardless).
  canManageStaff: boolean;
}

// A hospital admin manages staff by virtue of role: "admin" (same coarse gate
// as AccessRole management, see accessRole.service.ts). A staff member can
// ALSO manage other staff if their current AccessRole includes staff.manage —
// but never an admin, and never another staff.manage holder (peer protection,
// enforced in removeStaffMember once the target is known).
async function assertCanManageStaff(userId: string, hospitalId: string): Promise<{ isAdmin: boolean }> {
  const membership = await HospitalMembershipModel.findOne({ userId, hospitalId, status: "active" });
  if (!membership) {
    throw new HttpError(403, "You do not have access to this hospital.");
  }
  if (membership.role === "admin") {
    return { isAdmin: true };
  }
  const permissions = await resolvePermissions(userId, hospitalId);
  if (!permissions.includes("staff.manage")) {
    throw new HttpError(403, "You don't have permission to manage staff.");
  }
  return { isAdmin: false };
}

// Batches one AccessRole query for the whole hospital rather than resolving
// permissions per staff member (which would each independently re-look-up the
// same handful of roles) — same fail-closed shape as resolvePermissions
// (isActive: true only), just computed for a list instead of one user.
export async function listStaff(actingUserId: string, hospitalId: string): Promise<StaffSummary[]> {
  await assertCanManageStaff(actingUserId, hospitalId);

  const memberships = await HospitalMembershipModel.find({
    hospitalId,
    role: "staff",
    status: "active",
  }).populate<{ userId: PopulatedUser | null }>("userId");

  const roles = await AccessRoleModel.find({ hospital: hospitalId, isActive: true });
  const roleById = new Map(roles.map((role) => [role._id.toString(), role]));

  // A dangling reference (the User no longer exists) is defensive-only — no
  // User deletion path exists today — but skip it rather than throw.
  return memberships.flatMap((membership) => {
    if (!membership.userId) return [];
    const role = membership.accessRoleId ? roleById.get(membership.accessRoleId.toString()) : undefined;
    const permissions = (role?.permissions ?? []) as Permission[];
    return [
      {
        id: membership._id.toString(),
        userId: membership.userId._id.toString(),
        userName: membership.userId.name,
        userEmail: membership.userId.email,
        accessRoleName: role ? role.name : null,
        canManageStaff: permissions.includes("staff.manage"),
      },
    ];
  });
}

// Removal is a status change (-> "removed"), not deleting the membership row —
// keeps a record of who was staff and when they were removed, and lets them
// submit a fresh request later (see accessRequest.service.ts::requestAccess).
export async function removeStaffMember(
  actingUserId: string,
  hospitalId: string,
  membershipId: string
): Promise<{ id: string; status: string }> {
  const { isAdmin } = await assertCanManageStaff(actingUserId, hospitalId);

  const target = await HospitalMembershipModel.findOne({ _id: membershipId, hospitalId });
  if (!target) {
    throw new HttpError(404, "Staff member not found.");
  }

  // No one can remove the admin through this action — not even another admin —
  // regardless of who's asking.
  if (target.role === "admin") {
    throw new HttpError(403, "The hospital administrator cannot be removed.");
  }

  if (target.status !== "active") {
    throw new HttpError(409, `This staff member is already ${target.status} and cannot be removed.`);
  }

  if (target.userId.toString() === actingUserId) {
    throw new HttpError(403, "You cannot remove yourself.");
  }

  // Peer protection: a staff.manage holder (not an admin) cannot remove
  // another staff.manage holder — "can't delete someone at the same position
  // as him." An admin is exempt from this check.
  if (!isAdmin) {
    const targetPermissions = await resolvePermissions(target.userId.toString(), hospitalId);
    if (targetPermissions.includes("staff.manage")) {
      throw new HttpError(403, "You cannot remove another staff member who also manages staff.");
    }
  }

  target.status = "removed";
  await target.save();

  return { id: target._id.toString(), status: target.status };
}
