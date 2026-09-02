import { Schema, model, InferSchemaType } from "mongoose";

// A person can hold more than one role at once (e.g. patient AND hospital staff),
// so roles is an array rather than a single field.
export const ROLES = ["patient", "hospital", "owner"] as const;
export type Role = (typeof ROLES)[number];

// One entry per active session. Portal-scoped (see auth.controller.ts's
// per-portal cookie names) — a patient session and a hospital session for the
// same account are separate entries here, capped independently.
const refreshTokenEntrySchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    portal: { type: String, enum: ROLES, required: true },
    hospitalId: { type: Schema.Types.ObjectId, ref: "Hospital" },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }, // insertion order doubles as FIFO order
  },
  { _id: false }
);

// registerOtp/resetOtp hold at most one pending code each — a new request just
// overwrites the old one. No TTL index here on purpose: a TTL index on an
// embedded field would delete the whole User document once it fires, not just
// the field. These are small enough that an expired-but-unused one sitting
// around briefly costs nothing.
const otpEntrySchema = new Schema(
  {
    codeHash: { type: String, required: true },
    role: { type: String, enum: ROLES }, // only meaningful on registerOtp
    expiresAt: { type: Date, required: true },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    roles: { type: [String], enum: ROLES, default: [] },
    isVerified: { type: Boolean, default: false },
    refreshTokens: { type: [refreshTokenEntrySchema], default: [] },
    registerOtp: { type: otpEntrySchema, default: null },
    resetOtp: { type: otpEntrySchema, default: null },
  },
  { timestamps: true }
);

// Lets refreshSession/logout find the owning user directly by a token's hash.
userSchema.index({ "refreshTokens.tokenHash": 1 }, { unique: true });

export type User = InferSchemaType<typeof userSchema>;
export const UserModel = model("User", userSchema);
