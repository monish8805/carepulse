import { Types } from "mongoose";
import { HospitalMembershipModel } from "../models/hospitalMembership.model";
import { HospitalModel } from "../models/hospital.model";
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
}

async function resolveCanManageStaff(userId: string, hospitalId: string, role: string): Promise<boolean> {
  if (role === "admin") return true;
  const permissions = await resolvePermissions(userId, hospitalId);
  return permissions.includes("staff.manage");
}

export async function listActiveMemberships(userId: string): Promise<HospitalMembershipSummary[]> {
  const memberships = await HospitalMembershipModel.find({ userId, status: "active" }).populate<{
    hospitalId: PopulatedHospital;
  }>("hospitalId");

  return memberships.map((membership) => ({
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

  if (!membership) {
    throw new HttpError(403, "You do not have access to this hospital.");
  }

  const canManageStaff = await resolveCanManageStaff(userId, hospitalId, membership.role);
  return {
    id: membership.hospitalId._id.toString(),
    name: membership.hospitalId.name,
    role: membership.role,
    canManageStaff,
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

  if (!membership) return null;

  const canManageStaff = await resolveCanManageStaff(userId, hospitalId, membership.role);
  return {
    id: membership.hospitalId._id.toString(),
    name: membership.hospitalId.name,
    role: membership.role,
    canManageStaff,
  };
}

// --- Owner Portal: hospital + administrator provisioning ---

export interface HospitalSummary {
  id: string;
  name: string;
}

export async function listHospitals(): Promise<HospitalSummary[]> {
  const hospitals = await HospitalModel.find().sort({ createdAt: -1 });
  return hospitals.map((hospital) => ({ id: hospital._id.toString(), name: hospital.name }));
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
  // isVerified: true — the Owner is directly provisioning this account, so there's
  // no email-ownership OTP step to go through (unlike public self-registration).
  const adminUser = await UserModel.create({
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

  await sendHospitalAdminWelcomeEmail(normalizedEmail, hospital.name, temporaryPassword);

  return {
    hospital: { id: hospital._id.toString(), name: hospital.name },
    admin: { id: adminUser._id.toString(), name: adminUser.name, email: adminUser.email },
    temporaryPassword,
  };
}
