import { Schema, model } from "mongoose";

const hospitalSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

export const HospitalModel = model("Hospital", hospitalSchema);
