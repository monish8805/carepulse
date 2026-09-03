import { Schema, model } from "mongoose";
import { DATA_CATEGORIES } from "../config/dataCategories";

// "revoked" is reached from "active" only, via either side calling revoke
// (domain/patientConsent.service.ts::revokeGrant) — not terminal: granting
// again reuses this same document (the unique userId+doctorId index below
// allows only one) and resets it to "active", the same
// removed/cancelled-are-not-terminal pattern models/hospitalMembership.model.ts
// already uses for staff removal/re-request.
export const PATIENT_CONSENT_STATUSES = ["active", "revoked"] as const;
export type PatientConsentStatus = (typeof PATIENT_CONSENT_STATUSES)[number];

const patientConsentSchema = new Schema(
  {
    patientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    doctorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Which categories of the patient's (future) data this grant covers —
    // validated against DATA_CATEGORIES on every write in the domain layer,
    // never arbitrary strings. Editable only by the patient (see
    // domain/patientConsent.service.ts::updateGrant).
    dataCategories: { type: [String], enum: DATA_CATEGORIES, default: [] },
    status: { type: String, enum: PATIENT_CONSENT_STATUSES, default: "active" },
  },
  { timestamps: true }
);

// One relationship document per (patient, doctor) pair, regardless of
// status — same shape as HospitalMembership's (userId, hospitalId) index.
patientConsentSchema.index({ patientId: 1, doctorId: 1 }, { unique: true });

export const PatientConsentModel = model("PatientConsent", patientConsentSchema);
