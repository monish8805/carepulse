import { Schema, model, InferSchemaType } from "mongoose";

// A person can hold more than one role at once (e.g. patient AND hospital staff),
// so roles is an array rather than a single field.
export const ROLES = ["patient", "hospital", "owner"] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    roles: { type: [String], enum: ROLES, default: [] },
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type User = InferSchemaType<typeof userSchema>;
export const UserModel = model("User", userSchema);
