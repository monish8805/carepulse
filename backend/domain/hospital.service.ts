import { Types } from "mongoose";
import { HospitalMembershipModel } from "../models/hospitalMembership.model";
import { HospitalModel } from "../models/hospital.model";
import { AccessRoleModel } from "../models/accessRole.model";
import { UserModel } from "../models/user.model";
import { hashValue } from "../utils/hash";
import { generateTemporaryPassword } from "../utils/password";
import { sendHospitalAdminWelcomeEmail } from "../utils/email";
import { HttpError } from "../utils/httpError";
import { resolvePermissions } from "./permission.service";

// Only relevant fields of the populated Hospital document.
interface PopulatedHospital {
  _id: Types.ObjectId;
  name: string;
  isActive: boolean;
}

export interface HospitalMembershipSummary {
  hospitalId: string;
  hospitalName: string;
  role: string;
}

export interface HospitalContext {
  id: string;
  name: string;
  role: string;
  // Whether this session may manage staff (list/remove) — true for role:
  // "admin", or for staff whose current AccessRole includes staff.manage.
  // Resolved fresh here (same as any other permission check), never cached —
  // lets the frontend decide whether to show staff-management UI without
  // duplicating this logic or exposing raw permissions. See domain/staff.service.ts.
  canManageStaff: boolean;
  // Whether this session currently holds patient.view — gates seeing which
  // patients have granted this doctor data access (domain/patientConsent.service.ts::
  // listGrantedToMe). True for role: "admin" (resolvePermissions grants an
  // admin every permission — see domain/permission.service.ts) or for staff
  // whose current AccessRole includes patient.view.
  canViewPatients: boolean;
}

// Resolves the permission set ONCE and derives every frontend-facing capability
// flag from it. These were two separate helpers that each called
// resolvePermissions — itself up to three queries — so the second call was
// entirely redundant work on GET /me, which runs on every page load and after
// every silent token refresh. Add new flags here rather than as another
// independent resolvePermissions caller.
async function resolveHospitalCapabilities(
  userId: string,
  hospitalId: string,
  role: string
): Promise<{ canManageStaff: boolean; canViewPatients: boolean }> {
  const permissions = await resolvePermissions(userId, hospitalId);
  return {
    // role: "admin" is still short-circuited here: an admin manages staff by
    // virtue of being the admin, not through an AccessRole (see CLAUDE.md).
    // resolvePermissions separately grants an admin every permission, so this
    // is belt-and-braces rather than the only path.
    canManageStaff: role === "admin" || permissions.includes("staff.manage"),
    canViewPatients: permissions.includes("patient.view"),
  };
}

export async function listActiveMemberships(userId: string): Promise<HospitalMembershipSummary[]> {
  const memberships = await HospitalMembershipModel.find({ userId, status: "active" }).populate<{
    hospitalId: PopulatedHospital;
  }>("hospitalId");

  // A disabled hospital is hidden from "Your hospitals" — nothing to switch
  // into while it's paused. The membership itself is untouched underneath.
  return memberships
    .filter((membership) => membership.hospitalId.isActive)
    .map((membership) => ({
      hospitalId: membership.hospitalId._id.toString(),
      hospitalName: membership.hospitalId.name,
      role: membership.role,
    }));
}

// The one place that decides whether a user may act as a given hospital. Every
// hospital-context request (switching, and later any hospital-scoped API call)
// must go through this — a hospitalId from the client is never trusted on its own.
export async function verifyActiveMembership(userId: string, hospitalId: string): Promise<HospitalContext> {
  const membership = await HospitalMembershipModel.findOne({
    userId,
    hospitalId,
    status: "active",
  }).populate<{ hospitalId: PopulatedHospital }>("hospitalId");

  if (!membership || !membership.hospitalId.isActive) {
    throw new HttpError(403, "You do not have access to this hospital.");
  }

  const { canManageStaff, canViewPatients } = await resolveHospitalCapabilities(
    userId,
    hospitalId,
    membership.role
  );
  return {
    id: membership.hospitalId._id.toString(),
    name: membership.hospitalId.name,
    role: membership.role,
    canManageStaff,
    canViewPatients,
  };
}

// Used by GET /me: resolves the hospital context fresh from the database every
// time, rather than trusting a role/name baked into the access token.
export async function getCurrentHospitalContext(
  userId: string,
  hospitalId: string | undefined
): Promise<HospitalContext | null> {
  if (!hospitalId) return null;

  const membership = await HospitalMembershipModel.findOne({
    userId,
    hospitalId,
    status: "active",
  }).populate<{ hospitalId: PopulatedHospital }>("hospitalId");

  if (!membership || !membership.hospitalId.isActive) return null;

  const { canManageStaff, canViewPatients } = await resolveHospitalCapabilities(
    userId,
    hospitalId,
    membership.role
  );
  return {
    id: membership.hospitalId._id.toString(),
    name: membership.hospitalId.name,
    role: membership.role,
    canManageStaff,
    canViewPatients,
  };
}

// --- Owner Portal: hospital + administrator provisioning ---

export interface HospitalSummary {
  id: string;
  name: string;
  isActive: boolean;
}

// Owner-facing: every hospital, active and disabled alike — the Owner needs
// to see a disabled one in order to re-enable (or delete) it.
export async function listHospitals(): Promise<HospitalSummary[]> {
  const hospitals = await HospitalModel.find().sort({ createdAt: -1 });
  return hospitals.map((hospital) => ({
    id: hospital._id.toString(),
    name: hospital.name,
    isActive: hospital.isActive,
  }));
}

// Staff-facing: only hospitals currently accepting new requests — used by the
// "Request hospital access" browse list (GET /api/hospital/hospitals). Reuses
// HospitalSummary's shape rather than a separate type; isActive is always
// true here by construction, the field just comes along for free.
export async function listRequestableHospitals(): Promise<HospitalSummary[]> {
  const hospitals = await HospitalModel.find({ isActive: true }).sort({ createdAt: -1 });
  return hospitals.map((hospital) => ({
    id: hospital._id.toString(),
    name: hospital.name,
    isActive: hospital.isActive,
  }));
}

// A reversible pause — see the "isActive" comment on models/hospital.model.ts
// for exactly what this blocks and why nothing else needs to change underneath.
export async function disableHospital(hospitalId: string): Promise<HospitalSummary> {
  const hospital = await HospitalModel.findById(hospitalId);
  if (!hospital) {
    throw new HttpError(404, "Hospital not found.");
  }
  if (!hospital.isActive) {
    throw new HttpError(409, "This hospital is already disabled.");
  }
  hospital.isActive = false;
  await hospital.save();
  return { id: hospital._id.toString(), name: hospital.name, isActive: hospital.isActive };
}

export async function enableHospital(hospitalId: string): Promise<HospitalSummary> {
  const hospital = await HospitalModel.findById(hospitalId);
  if (!hospital) {
    throw new HttpError(404, "Hospital not found.");
  }
  if (hospital.isActive) {
    throw new HttpError(409, "This hospital is already active.");
  }
  hospital.isActive = true;
  await hospital.save();
  return { id: hospital._id.toString(), name: hospital.name, isActive: hospital.isActive };
}

// Permanent and cascading, unlike disable — deletes the Hospital record along
// with every AccessRole and HospitalMembership (staff *and* admin) that
// belongs to it. Deliberately does NOT touch the User accounts those
// memberships point to: a person might hold other roles or other hospitals'
// memberships, so only their access to *this* hospital disappears. There is
// no undo — the frontend is responsible for a real confirmation step.
export async function deleteHospital(hospitalId: string): Promise<void> {
  const hospital = await HospitalModel.findById(hospitalId);
  if (!hospital) {
    throw new HttpError(404, "Hospital not found.");
  }

  await AccessRoleModel.deleteMany({ hospital: hospital._id });
  await HospitalMembershipModel.deleteMany({ hospitalId: hospital._id });
  await HospitalModel.deleteOne({ _id: hospital._id });
}

export interface CreateHospitalResult {
  hospital: HospitalSummary;
  admin: { id: string; name: string; email: string };
  // Only ever handed back to the caller in-process (see owner.controller.ts, which
  // strips this before responding over HTTP) — the admin receives it by email, once.
  temporaryPassword: string;
}

// Creates a hospital and its first administrator together, as one unit: a hospital
// with no one able to manage it isn't useful, so the Owner always provisions both.
//
// The administrator's `role: "admin"` on HospitalMembership is a coarse marker only
// (same as the existing "staff" value) — not the final permission system. The
// upcoming dynamic AccessRole system will resolve actual permissions per hospital;
// this just marks who can manage the hospital in the meantime.
export async function createHospitalWithAdmin(input: {
  hospitalName: string;
  adminName: string;
  adminEmail: string;
}): Promise<CreateHospitalResult> {
  const normalizedEmail = input.adminEmail.toLowerCase().trim();

  // Refuse to reuse an existing account: silently repurposing someone else's email
  // with a freshly-generated password would let the Owner hijack their login.
  const existingUser = await UserModel.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new HttpError(
      409,
      "This email is already registered. Choose a different email for the hospital administrator."
    );
  }

  const hospital = await HospitalModel.create({ name: input.hospitalName });

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashValue(temporaryPassword);

  // A hospital and its first administrator are provisioned as one unit, but
  // that's three separate writes with no transaction. If a later one fails
  // (the email-unique index losing a race with a concurrent registration, a
  // transient), whatever already committed has to be undone — otherwise a
  // half-provisioned Hospital survives with NO administrator, and since
  // nothing can ever remove a hospital's admin membership, it would show up in
  // the Owner's list and in the staff-facing "request access" list forever
  // with nobody able to approve anyone into it. Clean up in reverse order and
  // rethrow so the Owner sees the real failure and can simply retry.
  let adminUser;
  try {
    // isVerified: true — the Owner is directly provisioning this account, so there's
    // no email-ownership OTP step to go through (unlike public self-registration).
    adminUser = await UserModel.create({
      name: input.adminName,
      email: normalizedEmail,
      passwordHash,
      roles: ["hospital"],
      isVerified: true,
    });

    // Scoped to only this hospital — provisioning never grants access to any other.
    await HospitalMembershipModel.create({
      userId: adminUser._id,
      hospitalId: hospital._id,
      role: "admin",
      status: "active",
    });
  } catch (err) {
    if (adminUser) {
      await HospitalMembershipModel.deleteMany({ userId: adminUser._id });
      await UserModel.deleteOne({ _id: adminUser._id });
    }
    await HospitalModel.deleteOne({ _id: hospital._id });
    throw err;
  }

  await sendHospitalAdminWelcomeEmail(normalizedEmail, hospital.name, temporaryPassword);

  return {
    hospital: { id: hospital._id.toString(), name: hospital.name, isActive: hospital.isActive },
    admin: { id: adminUser._id.toString(), name: adminUser.name, email: adminUser.email },
    temporaryPassword,
  };
}
