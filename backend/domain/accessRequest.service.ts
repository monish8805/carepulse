import { Types } from "mongoose";
import { HospitalMembershipModel, LIVE_MEMBERSHIP_STATUSES } from "../models/hospitalMembership.model";
import { HospitalModel } from "../models/hospital.model";
import { AccessRoleModel } from "../models/accessRole.model";
import { assertHospitalAdmin } from "./accessRole.service";
import { HttpError } from "../utils/httpError";

interface PopulatedUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
}

interface PopulatedHospital {
  _id: Types.ObjectId;
  name: string;
}

export interface AccessRequestSummary {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: string;
  createdAt: Date;
}

export interface MyAccessRequestSummary {
  id: string;
  hospitalId: string;
  hospitalName: string;
  role: string;
  status: string;
  createdAt: Date;
}

// Both "removed" (an admin/manager removed an active staff member) and
// "cancelled" (the requester withdrew their own pending one) are non-terminal
// — unlike "rejected", either lets the same person ask again. See
// models/hospitalMembership.model.ts for the full status lifecycle.
const REREQUESTABLE_STATUSES = new Set(["removed", "cancelled"]);

// Phase 1 "one account = one hospital": a user may hold at most one live
// (pending/active/disabled) HospitalMembership at a time, at any hospital.
// This is the primary enforcement (the partial unique index on
// HospitalMembership.userId, see the model, is the database-level backstop
// for the same rule). Throws with a message naming the caller's own current
// hospital — safe here since it's their own membership, not another
// hospital's data being leaked to them.
async function assertNoOtherLiveMembership(userId: string, hospitalId: string): Promise<void> {
  const other = await HospitalMembershipModel.findOne({
    userId,
    status: { $in: LIVE_MEMBERSHIP_STATUSES },
    hospitalId: { $ne: hospitalId },
  }).populate<{ hospitalId: { name: string } }>("hospitalId");

  if (other) {
    throw new HttpError(
      409,
      `You already belong to ${other.hospitalId.name}. You must leave or be removed from your current hospital before requesting access to another.`
    );
  }
}

// Creates a pending HospitalMembership. This alone grants no access — every
// existing access check (verifyActiveMembership, resolvePermissions) requires
// status: "active", so nothing changes for this user until an admin approves it.
export async function requestAccess(userId: string, hospitalId: string): Promise<{ id: string; status: string }> {
  const hospital = await HospitalModel.findById(hospitalId);
  if (!hospital) {
    throw new HttpError(404, "Hospital not found.");
  }
  if (!hospital.isActive) {
    throw new HttpError(403, "This hospital is not currently accepting requests.");
  }

  await assertNoOtherLiveMembership(userId, hospitalId);

  // One membership document per (user, hospital), regardless of status — this
  // is also enforced by the model's unique index; checking first just gives a
  // clean 409 instead of a raw duplicate-key error. A rejected request isn't
  // automatically re-requestable — a deliberate scope limit for this phase
  // (see PRD.md). A *removed* or *cancelled* one is different — see
  // REREQUESTABLE_STATUSES above — reusing this same document (the unique
  // index allows only one) rather than creating a second.
  const existing = await HospitalMembershipModel.findOne({ userId, hospitalId });
  if (existing) {
    if (REREQUESTABLE_STATUSES.has(existing.status)) {
      existing.status = "pending";
      existing.role = "staff";
      existing.accessRoleId = undefined;
      await existing.save();
      return { id: existing._id.toString(), status: existing.status };
    }
    throw new HttpError(409, "You already have a membership or pending request for this hospital.");
  }

  const membership = await HospitalMembershipModel.create({
    userId,
    hospitalId,
    role: "staff",
    status: "pending",
  });

  return { id: membership._id.toString(), status: membership.status };
}

// All of the caller's own memberships, any status, across any hospital — how
// staff sees "pending"/"rejected" without yet having a selectable hospital context.
export async function listMyRequests(userId: string): Promise<MyAccessRequestSummary[]> {
  const memberships = await HospitalMembershipModel.find({ userId }).populate<{
    hospitalId: PopulatedHospital | null;
  }>("hospitalId");

  // A dangling reference (the Hospital no longer exists) is defensive-only —
  // deleteHospital cascades and removes this same membership along with it,
  // so it shouldn't happen — but skip it rather than throw.
  return memberships.flatMap((membership) => {
    if (!membership.hospitalId) return [];
    return [
      {
        id: membership._id.toString(),
        hospitalId: membership.hospitalId._id.toString(),
        hospitalName: membership.hospitalId.name,
        role: membership.role,
        status: membership.status,
        createdAt: membership.createdAt,
      },
    ];
  });
}

export async function listPendingRequests(adminUserId: string, hospitalId: string): Promise<AccessRequestSummary[]> {
  await assertHospitalAdmin(adminUserId, hospitalId);

  const memberships = await HospitalMembershipModel.find({ hospitalId, status: "pending" }).populate<{
    userId: PopulatedUser | null;
  }>("userId");

  // A dangling reference (the User no longer exists) is defensive-only — no
  // User deletion path exists today — but skip it rather than throw.
  return memberships.flatMap((membership) => {
    if (!membership.userId) return [];
    return [
      {
        id: membership._id.toString(),
        userId: membership.userId._id.toString(),
        userName: membership.userId.name,
        userEmail: membership.userId.email,
        status: membership.status,
        createdAt: membership.createdAt,
      },
    ];
  });
}

export async function approveRequest(
  adminUserId: string,
  hospitalId: string,
  requestId: string,
  accessRoleId: string
): Promise<{ id: string; status: string; accessRoleId: string }> {
  await assertHospitalAdmin(adminUserId, hospitalId);

  // Hospital-scoped lookup: the request must belong to the admin's own,
  // already-verified hospital context — an id from another hospital simply won't match.
  const membership = await HospitalMembershipModel.findOne({ _id: requestId, hospitalId });
  if (!membership) {
    throw new HttpError(404, "Request not found.");
  }

  if (membership.userId.toString() === adminUserId) {
    throw new HttpError(403, "You cannot approve your own request.");
  }

  if (membership.status !== "pending") {
    throw new HttpError(409, `This request is already ${membership.status} and cannot be approved.`);
  }

  // Defense-in-depth: requestAccess already refuses to create this pending
  // request if the user held a live membership elsewhere, but re-check here
  // too rather than trusting that an earlier check covers every path (same
  // pattern as the hospital.isActive re-checks throughout this codebase).
  await assertNoOtherLiveMembership(membership.userId.toString(), hospitalId);

  // The role must exist, be active, and belong to this same hospital — a
  // wrong-hospital or inactive/nonexistent role is always rejected, and the
  // admin can only ever assign a role that already exists (never create one here).
  const accessRole = await AccessRoleModel.findOne({ _id: accessRoleId, hospital: hospitalId, isActive: true });
  if (!accessRole) {
    throw new HttpError(400, "accessRoleId must be an active AccessRole belonging to this hospital.");
  }

  membership.status = "active";
  membership.accessRoleId = accessRole._id;
  await membership.save();

  return { id: membership._id.toString(), status: membership.status, accessRoleId: accessRole._id.toString() };
}

export async function rejectRequest(
  adminUserId: string,
  hospitalId: string,
  requestId: string
): Promise<{ id: string; status: string }> {
  await assertHospitalAdmin(adminUserId, hospitalId);

  const membership = await HospitalMembershipModel.findOne({ _id: requestId, hospitalId });
  if (!membership) {
    throw new HttpError(404, "Request not found.");
  }

  if (membership.status !== "pending") {
    throw new HttpError(409, `This request is already ${membership.status} and cannot be rejected.`);
  }

  membership.status = "rejected";
  await membership.save();

  return { id: membership._id.toString(), status: membership.status };
}

// User-scoped, not hospital-scoped: the requester may have no hospital
// context selected at all (they haven't been approved into any hospital
// yet), so this looks the request up by ownership instead, matching how
// requestAccess/listMyRequests are scoped.
export async function cancelRequest(userId: string, requestId: string): Promise<{ id: string; status: string }> {
  const membership = await HospitalMembershipModel.findOne({ _id: requestId, userId });
  if (!membership) {
    throw new HttpError(404, "Request not found.");
  }

  if (membership.status !== "pending") {
    throw new HttpError(409, `This request is already ${membership.status} and cannot be cancelled.`);
  }

  membership.status = "cancelled";
  await membership.save();

  return { id: membership._id.toString(), status: membership.status };
}
