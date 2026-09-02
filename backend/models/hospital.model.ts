import { Schema, model } from "mongoose";

const hospitalSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // A reversible pause, not a delete — everything about the hospital
    // (staff/admin memberships, AccessRoles) is left completely untouched.
    // Every place that already resolves hospital access (verifyActiveMembership,
    // getCurrentHospitalContext, resolvePermissions, assertHospitalAdmin,
    // assertCanManageStaff, requestAccess) additionally checks this and fails
    // closed when it's false — see domain/hospital.service.ts::disableHospital.
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const HospitalModel = model("Hospital", hospitalSchema);
