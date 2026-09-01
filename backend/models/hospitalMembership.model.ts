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
  },
  { timestamps: true }
);

hospitalMembershipSchema.index({ userId: 1, hospitalId: 1 }, { unique: true });

export const HospitalMembershipModel = model("HospitalMembership", hospitalMembershipSchema);
