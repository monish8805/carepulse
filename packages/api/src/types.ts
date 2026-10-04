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
  // Patient demographics — null until the patient fills them in (the Patient
  // Portal requires both on first login). dateOfBirth is an ISO date at UTC midnight.
  dateOfBirth?: string | null;
  gender?: Gender | null;
  // Required with DOB/gender ("unknown" is a valid answer); guardianPhone is optional.
  bloodType?: BloodType | null;
  guardianPhone?: string | null;
}

export const GENDERS = ["male", "female", "other"] as const;
export type Gender = (typeof GENDERS)[number];

// Mirrors backend/models/user.model.ts.
export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"] as const;
export type BloodType = (typeof BLOOD_TYPES)[number];

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
  // vitals.view / alerts.view / alerts.acknowledge, same display-only role:
  // each clinical-data request is still checked server-side.
  canViewVitals: boolean;
  canViewAlerts: boolean;
  canAcknowledgeAlerts: boolean;
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
  patientDateOfBirth: string | null;
  patientGender: Gender | null;
  dataCategories: string[];
  createdAt: string;
}

// Vitals and the sepsis early-warning score (backend's domain/vitals.service.ts,
// domain/inference.service.ts, domain/alert.service.ts). Mirrors
// backend/config/vitals.ts — the model's own field names.
export const VITALS = ["HR", "O2Sat", "Temp", "SBP", "MAP", "DBP", "Resp"] as const;
export type Vital = (typeof VITALS)[number];

export type RiskLevel = "LOW" | "ELEVATED" | "HIGH";

export interface VitalsReading extends Record<Vital, number | null> {
  id: string;
  recordedAt: string;
}

// status "unavailable" means the model couldn't score this reading — show it
// as unknown risk, never as low.
export interface SepsisPrediction {
  id: string;
  readingId: string;
  status: "scored" | "unavailable";
  sepsisProbability: number | null;
  riskLevel: RiskLevel | null;
  modelKey: string | null;
  modelVersion: string | null;
  warning: string | null;
  createdAt: string;
}

export interface VitalsHistory {
  readings: VitalsReading[];
  predictions: SepsisPrediction[];
}

export interface PatientVitals extends VitalsHistory {
  patient: {
    id: string;
    name: string;
    dateOfBirth: string | null;
    gender: Gender | null;
    bloodType: BloodType | null;
    guardianPhone: string | null;
  };
}

// A score plus the time of the reading it is "as of" — the clinically
// meaningful time, not when the score or alert was written.
export interface ScoreSummary {
  status: "scored" | "unavailable";
  sepsisProbability: number | null;
  riskLevel: RiskLevel | null;
  recordedAt: string | null;
}

// `trigger` is the HIGH score that raised the alert; `current` is the
// patient's latest score. An alert stays active until acknowledged while the
// risk keeps moving, so show both — never the trigger alone as if it were now.
export interface SepsisAlert {
  id: string;
  patientId: string;
  patientName: string;
  patientDateOfBirth: string | null;
  patientGender: Gender | null;
  status: string;
  createdAt: string;
  trigger: ScoreSummary & { warning: string | null };
  current: ScoreSummary | null;
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
