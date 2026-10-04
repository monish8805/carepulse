import { Schema, model } from "mongoose";

// "active" → "acknowledged", one way. Acknowledging doesn't reopen; the next
// HIGH score after that raises a fresh alert.
export const ALERT_STATUSES = ["active", "acknowledged"] as const;

const alertSchema = new Schema(
  {
    patientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    predictionId: { type: Schema.Types.ObjectId, ref: "SepsisPrediction", required: true },
    status: { type: String, enum: ALERT_STATUSES, default: "active" },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    acknowledgedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// At most one ACTIVE alert per patient: a patient who stays HIGH for ten
// hours is one thing to look at, not ten. Partial, so any number of
// acknowledged alerts can sit alongside it. Two readings scored at the same
// moment can both try to create one; the loser's duplicate-key error is
// expected and swallowed in domain/alert.service.ts::raiseAlertIfNoneActive.
alertSchema.index({ patientId: 1 }, { unique: true, partialFilterExpression: { status: "active" } });

export const AlertModel = model("Alert", alertSchema);
