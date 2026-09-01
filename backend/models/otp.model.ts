import { Schema, model } from "mongoose";
import { ROLES } from "./user.model";

// Stores a hashed OTP code for either a registration or a password reset.
// For "register", role says which role the code will grant once verified.
const otpSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: ["register", "reset"], required: true },
    role: { type: String, enum: ROLES },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const OtpModel = model("Otp", otpSchema);
