import { Types } from "mongoose";
import { HospitalMembershipModel } from "../models/hospitalMembership.model";
import "../models/hospital.model"; // registers the "Hospital" model so .populate("hospitalId") can resolve it
import { HttpError } from "../utils/httpError";

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

  return { id: membership.hospitalId._id.toString(), name: membership.hospitalId.name, role: membership.role };
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

  return { id: membership.hospitalId._id.toString(), name: membership.hospitalId.name, role: membership.role };
}
