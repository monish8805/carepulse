import { AccessRoleModel } from "../models/accessRole.model";
import { HospitalMembershipModel } from "../models/hospitalMembership.model";
import { HospitalModel } from "../models/hospital.model";
import { PERMISSIONS, Permission } from "../config/permissions";
import { HttpError } from "../utils/httpError";

// Managing AccessRoles is a hospital-management action, gated by the existing
// coarse role: "admin" marker on HospitalMembership — not by a dynamic
// AccessRole/permission (an administrator doesn't need to be assigned an
// AccessRole to manage the ones that exist).
export async function assertHospitalAdmin(userId: string, hospitalId: string): Promise<void> {
  const membership = await HospitalMembershipModel.findOne({
    userId,
    hospitalId,
    status: "active",
    role: "admin",
  });
  if (!membership) {
    throw new HttpError(403, "Only a hospital administrator can manage access roles.");
  }

  // A disabled hospital blocks this too, even for an existing "active" admin
  // membership and even mid-session (a stale access token can still carry
  // this hospitalId) — matches every other hospital-access check's fail-closed
  // behavior, see models/hospital.model.ts's comment on "isActive".
  const hospital = await HospitalModel.findById(hospitalId);
  if (!hospital?.isActive) {
    throw new HttpError(403, "This hospital is currently disabled.");
  }
}

function validatePermissions(permissions: string[]): Permission[] {
  const catalogue: readonly string[] = PERMISSIONS;
  const invalid = permissions.filter((permission) => !catalogue.includes(permission));
  if (invalid.length > 0) {
    throw new HttpError(400, `Unknown permission(s): ${invalid.join(", ")}`);
  }
  return permissions as Permission[];
}

export interface AccessRoleSummary {
  id: string;
  name: string;
  permissions: Permission[];
  isActive: boolean;
}

export async function createAccessRole(
  userId: string,
  hospitalId: string,
  input: { name: string; permissions: string[] }
): Promise<AccessRoleSummary> {
  await assertHospitalAdmin(userId, hospitalId);
  const permissions = validatePermissions(input.permissions ?? []);

  const accessRole = await AccessRoleModel.create({
    hospital: hospitalId,
    name: input.name,
    permissions,
    isActive: true,
    createdBy: userId,
  });

  return {
    id: accessRole._id.toString(),
    name: accessRole.name,
    permissions: accessRole.permissions as Permission[],
    isActive: accessRole.isActive,
  };
}

export async function listAccessRoles(userId: string, hospitalId: string): Promise<AccessRoleSummary[]> {
  await assertHospitalAdmin(userId, hospitalId);

  const roles = await AccessRoleModel.find({ hospital: hospitalId }).sort({ createdAt: -1 });
  return roles.map((role) => ({
    id: role._id.toString(),
    name: role.name,
    permissions: role.permissions as Permission[],
    isActive: role.isActive,
  }));
}

// Edits only permissions, not the name — renaming isn't part of the current
// plan (see PHASES.md) and would need its own uniqueness handling against the
// (hospital, name) index.
export async function updateAccessRolePermissions(
  userId: string,
  hospitalId: string,
  roleId: string,
  permissions: string[]
): Promise<AccessRoleSummary> {
  await assertHospitalAdmin(userId, hospitalId);
  const validated = validatePermissions(permissions ?? []);

  const accessRole = await AccessRoleModel.findOne({ _id: roleId, hospital: hospitalId });
  if (!accessRole) {
    throw new HttpError(404, "AccessRole not found.");
  }

  accessRole.permissions = validated;
  await accessRole.save();

  return {
    id: accessRole._id.toString(),
    name: accessRole.name,
    permissions: accessRole.permissions as Permission[],
    isActive: accessRole.isActive,
  };
}

// Hard delete, but blocked while any active membership still points at this
// role — resolvePermissions would otherwise silently resolve those staff to no
// permissions the moment the role disappeared, with no visible explanation.
export async function deleteAccessRole(userId: string, hospitalId: string, roleId: string): Promise<void> {
  await assertHospitalAdmin(userId, hospitalId);

  const accessRole = await AccessRoleModel.findOne({ _id: roleId, hospital: hospitalId });
  if (!accessRole) {
    throw new HttpError(404, "AccessRole not found.");
  }

  const inUse = await HospitalMembershipModel.exists({
    hospitalId,
    accessRoleId: accessRole._id,
    status: "active",
  });
  if (inUse) {
    throw new HttpError(409, "This role is currently assigned to active staff and can't be deleted while in use.");
  }

  await AccessRoleModel.deleteOne({ _id: accessRole._id });
}
