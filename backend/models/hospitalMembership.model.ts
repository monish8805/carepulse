import { Schema, model } from "mongoose";

// Fine-grained hospital-level role, separate from the coarse "hospital" entry in
// User.roles (which only gates whether the account can use the Hospital Portal at all).
export const HOSPITAL_MEMBERSHIP_ROLES = ["admin", "staff"] as const;
export type HospitalMembershipRole = (typeof HOSPITAL_MEMBERSHIP_ROLES)[number];

// "removed" is reached only from "active", via an admin/staff.manage holder
// removing a staff member (domain/staff.service.ts::removeStaffMember).
// "cancelled" is reached only from "pending", via the requester withdrawing
// their own request (domain/accessRequest.service.ts::cancelRequest). Unlike
// "rejected" (terminal), both are NOT terminal: requestAccess() lets the user
// submit a fresh request, reusing this same document (the unique
// userId+hospitalId index allows only one), resetting it back to "pending".
//
// "disabled" is the one bidirectional pair in this state machine: active ->
// disabled -> active, via domain/staff.service.ts::disableStaffMember /
// enableStaffMember. Unlike "removed" (which represents leaving and needing a
// fresh request to rejoin), "disabled" is a temporary suspension — the
// membership and its accessRoleId are left untouched, so re-enabling restores
// exactly what they had. Every place that reads status: "active" (permission
// resolution, hospital-context selection, the active-memberships list) simply
// doesn't match "disabled", which is what actually blocks their access — no
// separate "is this account disabled" check exists or should be added.
export const HOSPITAL_MEMBERSHIP_STATUSES = [
  "pending",
  "active",
  "rejected",
  "removed",
  "cancelled",
  "disabled",
] as const;
export type HospitalMembershipStatus = (typeof HOSPITAL_MEMBERSHIP_STATUSES)[number];

const hospitalMembershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    hospitalId: { type: Schema.Types.ObjectId, ref: "Hospital", required: true },
    role: { type: String, enum: HOSPITAL_MEMBERSHIP_ROLES, required: true },
    status: { type: String, enum: HOSPITAL_MEMBERSHIP_STATUSES, default: "pending" },
    // Optional: which dynamic AccessRole this membership currently holds within
    // this hospital. Admin memberships typically have none — hospital-management
    // authority comes from role: "admin" above, not from an AccessRole. Staff
    // permissions are resolved from this, fresh from the database, on every
    // request (see domain/permission.service.ts) — never cached, never in the JWT.
    accessRoleId: { type: Schema.Types.ObjectId, ref: "AccessRole" },
  },
  { timestamps: true }
);

hospitalMembershipSchema.index({ userId: 1, hospitalId: 1 }, { unique: true });

export const HospitalMembershipModel = model("HospitalMembership", hospitalMembershipSchema);
