import { Types } from "mongoose";
import { HospitalMembershipModel } from "../models/hospitalMembership.model";
import { AccessRoleModel } from "../models/accessRole.model";
import { HospitalModel } from "../models/hospital.model";
import { UserModel } from "../models/user.model";
import { resolvePermissions } from "./permission.service";
import { assertHospitalAdmin } from "./accessRole.service";
import { Permission } from "../config/permissions";
import { HttpError } from "../utils/httpError";
import { hashValue } from "../utils/hash";
import { generateTemporaryPassword } from "../utils/password";
import { sendStaffWelcomeEmail } from "../utils/email";

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
  accessRoleId: string | null;
  accessRoleName: string | null;
  // "active" | "disabled" — never anything else, since listStaff only ever
  // queries those two statuses (see below).
  status: string;
  // Whether this staff member currently holds staff.manage — shown so the
  // frontend can explain why a "Remove"/"Disable" action might be unavailable
  // (peer protection, enforced again server-side regardless).
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
  const hospital = await HospitalModel.findById(hospitalId);
  if (!hospital?.isActive) {
    throw new HttpError(403, "This hospital is currently disabled.");
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
//
// Includes "disabled" alongside "active" — a disabled staff member still
// needs to appear here (with their status) so an admin/staff.manage holder
// can find and re-enable them; only "removed"/"pending"/etc. are excluded.
export async function listStaff(actingUserId: string, hospitalId: string): Promise<StaffSummary[]> {
  await assertCanManageStaff(actingUserId, hospitalId);

  const memberships = await HospitalMembershipModel.find({
    hospitalId,
    role: "staff",
    status: { $in: ["active", "disabled"] },
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
        accessRoleId: membership.accessRoleId ? membership.accessRoleId.toString() : null,
        accessRoleName: role ? role.name : null,
        status: membership.status,
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

// A reversible, temporary suspension — distinct from removeStaffMember above.
// The membership row (and its accessRoleId) is left completely untouched;
// only the status flips, which is what actually cuts off access (every
// permission/context check filters on status: "active" — see
// hospitalMembership.model.ts's comment on the "disabled" status).
export async function disableStaffMember(
  actingUserId: string,
  hospitalId: string,
  membershipId: string
): Promise<{ id: string; status: string }> {
  const { isAdmin } = await assertCanManageStaff(actingUserId, hospitalId);

  const target = await HospitalMembershipModel.findOne({ _id: membershipId, hospitalId });
  if (!target) {
    throw new HttpError(404, "Staff member not found.");
  }

  if (target.role === "admin") {
    throw new HttpError(403, "The hospital administrator cannot be disabled.");
  }

  if (target.status !== "active") {
    throw new HttpError(409, `This staff member is ${target.status}, not active, and cannot be disabled.`);
  }

  if (target.userId.toString() === actingUserId) {
    throw new HttpError(403, "You cannot disable yourself.");
  }

  // Same peer-protection rule as removeStaffMember — a staff.manage holder
  // can't act on another staff.manage holder either way. Safe to call
  // resolvePermissions here since target is still "active" at this point.
  if (!isAdmin) {
    const targetPermissions = await resolvePermissions(target.userId.toString(), hospitalId);
    if (targetPermissions.includes("staff.manage")) {
      throw new HttpError(403, "You cannot disable another staff member who also manages staff.");
    }
  }

  target.status = "disabled";
  await target.save();

  return { id: target._id.toString(), status: target.status };
}

// The reverse of disableStaffMember. No peer-protection check here (unlike
// disable/remove) — restoring someone's access isn't the kind of action that
// needs guarding against peers acting on each other, and a disabled person
// can't call any staff-management endpoint themselves anyway (their own
// membership isn't "active", so assertCanManageStaff already rejects them).
export async function enableStaffMember(
  actingUserId: string,
  hospitalId: string,
  membershipId: string
): Promise<{ id: string; status: string }> {
  await assertCanManageStaff(actingUserId, hospitalId);

  const target = await HospitalMembershipModel.findOne({ _id: membershipId, hospitalId });
  if (!target) {
    throw new HttpError(404, "Staff member not found.");
  }

  if (target.status !== "disabled") {
    throw new HttpError(409, `This staff member is ${target.status}, not disabled, and cannot be enabled.`);
  }

  target.status = "active";
  await target.save();

  return { id: target._id.toString(), status: target.status };
}

// Admin-only — deliberately assertHospitalAdmin, not assertCanManageStaff,
// mirroring addStaffDirectly's rationale: reassigning someone's AccessRole is
// an AccessRole-management action (same family as create/edit/delete role,
// all admin-only in accessRole.service.ts), not a staff-roster action. A
// staff.manage holder can't even list AccessRoles today, so the frontend
// couldn't offer this to them regardless.
export async function updateStaffRole(
  adminUserId: string,
  hospitalId: string,
  membershipId: string,
  accessRoleId: string
): Promise<{ id: string; accessRoleName: string }> {
  await assertHospitalAdmin(adminUserId, hospitalId);

  const target = await HospitalMembershipModel.findOne({ _id: membershipId, hospitalId });
  if (!target) {
    throw new HttpError(404, "Staff member not found.");
  }

  if (target.role === "admin") {
    throw new HttpError(403, "The hospital administrator's access isn't controlled by an AccessRole.");
  }

  const accessRole = await AccessRoleModel.findOne({ _id: accessRoleId, hospital: hospitalId, isActive: true });
  if (!accessRole) {
    throw new HttpError(400, "accessRoleId must be an active AccessRole belonging to this hospital.");
  }

  target.accessRoleId = accessRole._id;
  await target.save();

  return { id: target._id.toString(), accessRoleName: accessRole.name };
}

export interface AddStaffResult {
  membershipId: string;
  userId: string;
  email: string;
  // Whether a brand-new User account was created for this email (and so a
  // temporary password was emailed) — false for an existing account, which
  // keeps its own password and gets no email.
  createdNewUser: boolean;
}

// Admin-only — deliberately assertHospitalAdmin, not the broader
// assertCanManageStaff: a staff.manage holder can review/remove staff but
// was never able to approve a request either, so shouldn't gain the power to
// create one directly. Mirrors hospital.service.ts::createHospitalWithAdmin's
// exact pattern (generate + hash a temp password, email it once, isVerified:
// true — the admin is vouching for them the same way the Owner does for a
// hospital's first admin) for a brand-new account; an existing account is
// left alone except for gaining the "hospital" portal role if it's missing —
// required for login() to ever let them into the Hospital Portal at all.
export async function addStaffDirectly(
  adminUserId: string,
  hospitalId: string,
  input: { name: string; email: string; accessRoleId: string }
): Promise<AddStaffResult> {
  await assertHospitalAdmin(adminUserId, hospitalId);

  const accessRole = await AccessRoleModel.findOne({ _id: input.accessRoleId, hospital: hospitalId, isActive: true });
  if (!accessRole) {
    throw new HttpError(400, "accessRoleId must be an active AccessRole belonging to this hospital.");
  }

  const normalizedEmail = input.email.toLowerCase().trim();
  let user = await UserModel.findOne({ email: normalizedEmail });
  let createdNewUser = false;
  let temporaryPassword: string | undefined;

  if (!user) {
    temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashValue(temporaryPassword);
    user = await UserModel.create({
      name: input.name,
      email: normalizedEmail,
      passwordHash,
      roles: ["hospital"],
      isVerified: true,
    });
    createdNewUser = true;
  } else if (!user.roles.includes("hospital")) {
    await UserModel.updateOne({ _id: user._id }, { $addToSet: { roles: "hospital" } });
  }

  const existingMembership = await HospitalMembershipModel.findOne({ userId: user._id, hospitalId });
  if (existingMembership) {
    throw new HttpError(409, "This person already has a membership or pending request for this hospital.");
  }

  const membership = await HospitalMembershipModel.create({
    userId: user._id,
    hospitalId,
    role: "staff",
    status: "active",
    accessRoleId: accessRole._id,
  });

  if (createdNewUser && temporaryPassword) {
    const hospital = await HospitalModel.findById(hospitalId);
    await sendStaffWelcomeEmail(normalizedEmail, hospital?.name ?? "your hospital", accessRole.name, temporaryPassword);
  }

  return {
    membershipId: membership._id.toString(),
    userId: user._id.toString(),
    email: normalizedEmail,
    createdNewUser,
  };
}
