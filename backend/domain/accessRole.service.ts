import { AccessRoleModel } from "../models/accessRole.model";
import { HospitalMembershipModel } from "../models/hospitalMembership.model";
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
