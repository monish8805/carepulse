import { Schema, model } from "mongoose";
import { PERMISSIONS } from "../config/permissions";

// Hospital-scoped, dynamic. The Hospital Administrator defines these themselves —
// "Cardiologist", "Nurse", etc. are examples, never hardcoded anywhere in this app.
const accessRoleSchema = new Schema(
  {
    hospital: { type: Schema.Types.ObjectId, ref: "Hospital", required: true },
    name: { type: String, required: true, trim: true },
    permissions: { type: [String], enum: PERMISSIONS, default: [] },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Two roles with the same name in the same hospital would be confusing to assign.
accessRoleSchema.index({ hospital: 1, name: 1 }, { unique: true });

export const AccessRoleModel = model("AccessRole", accessRoleSchema);
