export type Role = "patient" | "hospital" | "owner";

// Deliberately has no `roles` field: a session must never reveal which other
// portals/roles the account has — see SessionUser for the portal-scoped view.
export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface HospitalContext {
  id: string;
  name: string;
  role: string;
}

// What GET /me returns: scoped to whichever portal the session was authenticated
// through. `hospital` is only ever present for portal === "hospital".
export interface SessionUser extends AuthUser {
  portal: Role;
  hospital?: HospitalContext | null;
}

export interface HospitalMembership {
  hospitalId: string;
  hospitalName: string;
  role: string;
}

// Mirrors backend/config/permissions.ts. Kept here (not imported from the
// backend) since frontend and backend are separate builds — if the backend
// catalogue changes, update this list too.
export const PERMISSIONS = [
  "patient.view",
  "vitals.view",
  "alerts.view",
  "alerts.acknowledge",
  "staff.view",
  "staff.manage",
] as const;

export interface AccessRole {
  id: string;
  name: string;
  permissions: string[];
  isActive: boolean;
}

// A pending/active/rejected request for the CURRENT admin's hospital, as seen
// by an administrator reviewing it.
export interface AccessRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: string;
  createdAt: string;
}

// One of the caller's own requests, across any hospital, any status.
export interface MyAccessRequest {
  id: string;
  hospitalId: string;
  hospitalName: string;
  role: string;
  status: string;
}

// Owner Portal only, below this point.

export interface Hospital {
  id: string;
  name: string;
}

export interface CreateHospitalResult {
  hospital: Hospital;
  admin: { id: string; name: string; email: string };
}
