import { Schema, model } from "mongoose";

// One set of vitals a patient recorded at one moment. Each vital is optional
// and stored exactly as captured — null means "not measured", and is real
// data: the sepsis model does its own forward-fill and median imputation and
// warns about what it filled, so pre-filling here would hide that.
const vitalsReadingSchema = new Schema(
  {
    patientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    recordedAt: { type: Date, required: true },
    HR: { type: Number, default: null },
    O2Sat: { type: Number, default: null },
    Temp: { type: Number, default: null },
    SBP: { type: Number, default: null },
    MAP: { type: Number, default: null },
    DBP: { type: Number, default: null },
    Resp: { type: Number, default: null },
  },
  { timestamps: true }
);

vitalsReadingSchema.index({ patientId: 1, recordedAt: 1 });

export const VitalsReadingModel = model("VitalsReading", vitalsReadingSchema);
