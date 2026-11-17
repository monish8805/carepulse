import { Schema, model } from "mongoose";

// Marks a patient whose readings are a replayed, retrospective ICU stay
// (scripts/seedSepsisDemo.ts). Only such a patient has a known label/onset, so
// the Sepsis Watch shows those markers only when this document exists — never
// for a live patient, whose onset isn't known. labelHour is the hour index the
// dataset's SepsisLabel turns on (6 hours before the defined onset), null for a
// stay that never turns on.
const simulatedStaySchema = new Schema(
  {
    patientId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    sampleId: { type: String, required: true },
    labelHour: { type: Number, default: null },
  },
  { timestamps: true }
);

export const SimulatedStayModel = model("SimulatedStay", simulatedStaySchema);
