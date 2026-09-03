import { Types } from "mongoose";
import { PatientConsentModel } from "../models/patientConsent.model";
import { UserModel } from "../models/user.model";
import { HospitalMembershipModel } from "../models/hospitalMembership.model";
import { HospitalModel } from "../models/hospital.model";
import { DataCategory, isValidDataCategory } from "../config/dataCategories";
import { HttpError } from "../utils/httpError";

interface PopulatedUser {
  _id: Types.ObjectId;
  name: string;
  specialization?: string | null;
}

export interface DoctorLookupResult {
  doctorId: string;
  name: string;
  specialization: string | null;
  hospitalName: string;
}

export interface PatientConsentSummary {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorSpecialization: string | null;
  hospitalName: string | null;
  dataCategories: string[];
  status: string;
  createdAt: Date;
}

export interface GrantedPatientSummary {
  id: string;
  patientId: string;
  patientName: string;
  dataCategories: string[];
  createdAt: Date;
}

function validateCategories(categories: string[]): DataCategory[] {
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new HttpError(400, "Select at least one data category to share.");
  }
  const invalid = categories.filter((c) => !isValidDataCategory(c));
  if (invalid.length > 0) {
    throw new HttpError(400, `Unknown data categor${invalid.length === 1 ? "y" : "ies"}: ${invalid.join(", ")}`);
  }
  return categories as DataCategory[];
}

// A "real, currently practicing doctor" means: a User with the hospital role
// AND an active HospitalMembership right now — not merely someone who once
// registered for the Hospital Portal. Used both for the patient-facing lookup
// below and to resolve a doctor's current hospital name for display.
async function findActiveDoctorHospital(doctorId: Types.ObjectId | string) {
  return HospitalMembershipModel.findOne({ userId: doctorId, status: "active" }).populate<{
    hospitalId: { _id: Types.ObjectId; name: string; isActive: boolean };
  }>("hospitalId");
}

// Deliberately returns the same generic "not found" whether the email
// doesn't exist at all, belongs to a non-hospital account, or belongs to a
// hospital account with no currently-active membership — same
// anti-enumeration principle as auth.service.ts::forgotPassword ("always
// respond the same way, whether or not the account exists").
export async function lookupDoctorByEmail(email: string): Promise<DoctorLookupResult> {
  const normalizedEmail = email.toLowerCase().trim();
  const notFound = () => new HttpError(404, "No active doctor found with that email.");

  const user = await UserModel.findOne({ email: normalizedEmail });
  if (!user || !user.roles.includes("hospital")) {
    throw notFound();
  }

  const membership = await findActiveDoctorHospital(user._id);
  if (!membership || !membership.hospitalId?.isActive) {
    throw notFound();
  }

  return {
    doctorId: user._id.toString(),
    name: user.name,
    specialization: user.specialization ?? null,
    hospitalName: membership.hospitalId.name,
  };
}

// Grants nothing that wasn't already re-verified here — the doctorEmail is
// re-looked-up (and re-validated as a real active doctor) rather than trusting
// a doctorId the client might send instead, mirroring how every other
// membership-creating flow in this app never trusts a client-supplied id
// without checking it server-side.
export async function grantAccess(
  patientId: string,
  doctorEmail: string,
  dataCategories: string[]
): Promise<PatientConsentSummary> {
  const doctor = await lookupDoctorByEmail(doctorEmail);
  const validated = validateCategories(dataCategories);

  const existing = await PatientConsentModel.findOne({ patientId, doctorId: doctor.doctorId });
  if (existing) {
    existing.status = "active";
    existing.dataCategories = validated;
    await existing.save();
    return toPatientConsentSummary(existing, doctor);
  }

  const created = await PatientConsentModel.create({
    patientId,
    doctorId: doctor.doctorId,
    dataCategories: validated,
    status: "active",
  });
  return toPatientConsentSummary(created, doctor);
}

function toPatientConsentSummary(
  doc: { _id: Types.ObjectId; dataCategories: string[]; status: string; createdAt: Date },
  doctor: DoctorLookupResult
): PatientConsentSummary {
  return {
    id: doc._id.toString(),
    doctorId: doctor.doctorId,
    doctorName: doctor.name,
    doctorSpecialization: doctor.specialization,
    hospitalName: doctor.hospitalName,
    dataCategories: doc.dataCategories,
    status: doc.status,
    createdAt: doc.createdAt,
  };
}

// The patient's own full history, any status — doctor name/specialization and
// their CURRENT hospital are resolved fresh per row (never cached on the
// grant itself), same "always re-resolve, never trust a stale snapshot"
// principle as everywhere else permission/membership-adjacent in this app. A
// doctor who has since left their hospital (or the User no longer exists) is
// still shown with whatever we can resolve — this is history, not a live
// access check.
export async function listMyGrants(patientId: string): Promise<PatientConsentSummary[]> {
  const grants = await PatientConsentModel.find({ patientId }).populate<{ doctorId: PopulatedUser | null }>(
    "doctorId"
  );

  // One batched membership lookup for every doctor on the list, rather than a
  // findOne+populate per row — a patient with ten grants used to cost twenty
  // extra round-trips. listGrantedToMe already avoided a per-row query; this
  // brings the patient's side of the same feature in line with it.
  const doctorIds = grants.flatMap((grant) => (grant.doctorId ? [grant.doctorId._id] : []));
  const memberships = await HospitalMembershipModel.find({
    userId: { $in: doctorIds },
    status: "active",
  }).populate<{ hospitalId: { _id: Types.ObjectId; name: string; isActive: boolean } | null }>("hospitalId");

  const hospitalNameByDoctorId = new Map<string, string | null>();
  for (const membership of memberships) {
    hospitalNameByDoctorId.set(
      String(membership.userId),
      membership.hospitalId?.isActive ? membership.hospitalId.name : null
    );
  }

  return grants.flatMap((grant) => {
    if (!grant.doctorId) return [];
    return [
      {
        id: grant._id.toString(),
        doctorId: grant.doctorId._id.toString(),
        doctorName: grant.doctorId.name,
        doctorSpecialization: grant.doctorId.specialization ?? null,
        hospitalName: hospitalNameByDoctorId.get(String(grant.doctorId._id)) ?? null,
        dataCategories: grant.dataCategories,
        status: grant.status,
        createdAt: grant.createdAt,
      },
    ];
  });
}

// Patient-owned and query-scoped (findOne({_id, patientId})) — a grantId
// belonging to another patient simply isn't found, same "filter in the query,
// don't fetch-then-check" convention as every other owner-scoped lookup in
// this app. Editing is the one action this app deliberately restricts to the
// patient's side only — a doctor can view or revoke, never change scope.
export async function updateGrant(
  patientId: string,
  grantId: string,
  dataCategories: string[]
): Promise<{ id: string; dataCategories: string[] }> {
  const validated = validateCategories(dataCategories);

  const grant = await PatientConsentModel.findOne({ _id: grantId, patientId });
  if (!grant) {
    throw new HttpError(404, "Grant not found.");
  }
  if (grant.status !== "active") {
    throw new HttpError(409, `This grant is ${grant.status} and can't be edited — grant access again instead.`);
  }

  grant.dataCategories = validated;
  await grant.save();
  return { id: grant._id.toString(), dataCategories: grant.dataCategories };
}

// Either side of the relationship may revoke — query-scoped to whichever end
// the acting user actually is, so a grantId belonging to neither simply isn't
// found. Revoking never requires any hospital-side permission on the doctor's
// end: giving up access you hold is never a privilege concern, unlike
// *seeing* granted patients (listGrantedToMe, gated by patient.view below).
export async function revokeGrant(actorUserId: string, grantId: string): Promise<{ id: string; status: string }> {
  const grant = await PatientConsentModel.findOne({
    _id: grantId,
    $or: [{ patientId: actorUserId }, { doctorId: actorUserId }],
  });
  if (!grant) {
    throw new HttpError(404, "Grant not found.");
  }
  if (grant.status !== "active") {
    throw new HttpError(409, `This grant is already ${grant.status}.`);
  }

  grant.status = "revoked";
  await grant.save();
  return { id: grant._id.toString(), status: grant.status };
}

// The doctor's-eye view: every ACTIVE grant naming them, regardless of which
// hospital they're currently at (a consent grant is to the person, not a
// hospital — see CLAUDE.md). Callers must additionally hold patient.view
// (enforced by requirePermission at the route, not here) before this is ever
// reached — same fail-closed layering as every other hospital-scoped read.
export async function listGrantedToMe(doctorId: string): Promise<GrantedPatientSummary[]> {
  const grants = await PatientConsentModel.find({ doctorId, status: "active" }).populate<{
    patientId: PopulatedUser | null;
  }>("patientId");

  return grants.flatMap((grant) => {
    if (!grant.patientId) return [];
    return [
      {
        id: grant._id.toString(),
        patientId: grant.patientId._id.toString(),
        patientName: grant.patientId.name,
        dataCategories: grant.dataCategories,
        createdAt: grant.createdAt,
      },
    ];
  });
}
