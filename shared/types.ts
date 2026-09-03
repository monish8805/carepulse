export type Role = "patient" | "hospital" | "owner";

// Deliberately has no `roles` field: a session must never reveal which other
// portals/roles the account has — see SessionUser for the portal-scoped view.
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  // Free-text, self-described (see backend's models/user.model.ts) — only
  // ever meaningful for a hospital-role account, but present on any portal
  // since it's descriptive text, not access-sensitive.
  specialization?: string | null;
}

export interface HospitalContext {
  id: string;
  name: string;
  role: string;
  // Whether this session may manage staff (list/remove) — true for role:
  // "admin", or for staff whose current AccessRole includes staff.manage.
  // Resolved server-side, display/gating only — the backend still enforces
  // every actual staff-management request independently.
  canManageStaff: boolean;
  // Whether this session currently holds patient.view — gates seeing which
  // patients have granted this doctor data access. Resolved server-side,
  // display/gating only; NOT automatically true for role: "admin" (unlike
  // canManageStaff) — see backend's domain/hospital.service.ts.
  canViewPatients: boolean;
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
  createdAt: string;
}

// A staff member (active or disabled), as seen by someone who can manage staff
// (an admin, or a staff member whose AccessRole includes staff.manage).
export interface StaffMember {
  id: string; // HospitalMembership id
  userId: string;
  userName: string;
  userEmail: string;
  accessRoleId: string | null;
  accessRoleName: string | null;
  // "active" | "disabled" — a disabled member keeps their role assignment but
  // has zero effective permissions until re-enabled; see backend's
  // hospitalMembership.model.ts for the full state-machine rationale.
  status: string;
  canManageStaff: boolean;
}

export interface AddStaffResult {
  membershipId: string;
  userId: string;
  email: string;
  // Whether a brand-new account was created (and so a temporary password was
  // emailed) — false for an existing account, which keeps its own password.
  createdNewUser: boolean;
}

// Patient <-> doctor data-sharing consent, below this point (Patient Portal +
// Hospital Portal). Mirrors backend/config/dataCategories.ts — kept here
// (not imported from the backend) since frontend and backend are separate
// builds, same reasoning as the PERMISSIONS mirror above. No medical
// features exist yet (see PHASES.md), so this starts with the two categories
// already anticipated; add new ones here as real data features land.
export const DATA_CATEGORIES = ["vitals.continuous", "vitals.occasional"] as const;

// Patient-facing: what a doctor-email lookup resolves to, before granting.
export interface DoctorLookupResult {
  doctorId: string;
  name: string;
  specialization: string | null;
  hospitalName: string;
}

// One row in the patient's own "My shared access" list — any status, their
// full sharing history for this doctor.
export interface PatientConsent {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorSpecialization: string | null;
  // The doctor's CURRENT hospital, resolved fresh — null if they no longer
  // have one (e.g. removed since the grant was made).
  hospitalName: string | null;
  dataCategories: string[];
  status: "active" | "revoked";
  createdAt: string;
}

// One row in a doctor's "Patients" list — only ever active grants naming them.
export interface GrantedPatientSummary {
  id: string;
  patientId: string;
  patientName: string;
  dataCategories: string[];
  createdAt: string;
}

// Owner Portal only, below this point.

export interface Hospital {
  id: string;
  name: string;
  // A reversible pause set by the Owner — see backend's hospital.model.ts.
  // Always true in the staff-facing "browse hospitals to request access to"
  // listing (disabled ones are excluded there); the Owner's own list shows
  // both, so this only ever matters to the Owner Portal's UI.
  isActive: boolean;
}

export interface CreateHospitalResult {
  hospital: Hospital;
  admin: { id: string; name: string; email: string };
}
