import { Schema, model } from "mongoose";

// Fine-grained hospital-level role, separate from the coarse "hospital" entry in
// User.roles (which only gates whether the account can use the Hospital Portal at all).
export const HOSPITAL_MEMBERSHIP_ROLES = ["admin", "staff"] as const;
export type HospitalMembershipRole = (typeof HOSPITAL_MEMBERSHIP_ROLES)[number];

export const HOSPITAL_MEMBERSHIP_STATUSES = ["pending", "active", "rejected"] as const;
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
