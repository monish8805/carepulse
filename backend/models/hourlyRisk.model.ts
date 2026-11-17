import { Schema, model } from "mongoose";
import { RISK_LEVELS } from "./sepsisPrediction.model";

// One hour of a patient's stay scored by every model, for the Sepsis Watch
// curves (domain/inference.service.ts::refreshRiskSeries). Keyed by the hour's
// own timestamp, not an index, so a stored hour keeps its place if the stay
// grows. `alert` is just riskLevel === "HIGH" for that model, stored so the
// page doesn't re-derive it. Nothing here is a diagnosis.
const modelScoreSchema = new Schema(
  {
    modelScore: { type: Number, required: true },
    probability: { type: Number, required: true },
    riskLevel: { type: String, enum: RISK_LEVELS, required: true },
    alert: { type: Boolean, required: true },
  },
  { _id: false }
);

const hourlyRiskSchema = new Schema(
  {
    patientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    hourStart: { type: Date, required: true },
    models: { type: Map, of: modelScoreSchema, required: true },
    modelVersion: { type: String, default: null },
    warnings: { type: [String], default: [] },
  },
  { timestamps: true }
);

hourlyRiskSchema.index({ patientId: 1, hourStart: 1 }, { unique: true });

export const HourlyRiskModel = model("HourlyRisk", hourlyRiskSchema);
