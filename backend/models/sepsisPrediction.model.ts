import { Schema, model } from "mongoose";

// "unavailable" means the model service couldn't score this reading (down,
// timed out, rejected the input). It is stored rather than skipped so the UI
// can say "risk unknown" — a missing score must never read as low risk.
export const PREDICTION_STATUSES = ["scored", "unavailable"] as const;
export const RISK_LEVELS = ["LOW", "ELEVATED", "HIGH"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

const sepsisPredictionSchema = new Schema(
  {
    patientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // The reading this score is "as of": the patient's newest reading when it
    // was scored (the model scores the latest hour of the whole history). Not
    // necessarily the reading whose arrival triggered scoring — see
    // domain/inference.service.ts::scoreAfterReading.
    readingId: { type: Schema.Types.ObjectId, ref: "VitalsReading", required: true },
    status: { type: String, enum: PREDICTION_STATUSES, required: true },
    sepsisProbability: { type: Number, default: null },
    riskLevel: { type: String, enum: RISK_LEVELS, default: null },
    modelKey: { type: String, default: null },
    modelVersion: { type: String, default: null },
    warning: { type: String, default: null },
  },
  { timestamps: true }
);

sepsisPredictionSchema.index({ patientId: 1, createdAt: -1 });

export const SepsisPredictionModel = model("SepsisPrediction", sepsisPredictionSchema);
