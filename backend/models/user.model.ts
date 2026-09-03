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
    // Wrong guesses so far against this specific code. At OTP_MAX_ATTEMPTS the
    // whole entry is discarded (see domain/auth.service.ts) — without it the
    // expiry window alone doesn't stop a brute force, since nothing else in the
    // stack limits attempts.
    attempts: { type: Number, default: 0 },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Optional at the schema level — required only for the self-registration
    // flow (enforced in validators/auth.validator.ts), not for every way a
    // User can be created (e.g. an Owner-provisioned hospital administrator
    // never supplies one).
    phone: { type: String, trim: true },
    // Free-text, self-described, optional — only ever meaningful for a
    // hospital-role account (e.g. "Gynaecologist", "RMP"). Deliberately never
    // a fixed enum of clinical job titles, per the standing rule elsewhere in
    // this codebase against hardcoding those (see CLAUDE.md). Shown to a
    // patient looking up a doctor before granting data access
    // (domain/patientConsent.service.ts::lookupDoctorByEmail).
    specialization: { type: String, trim: true },
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
// partialFilterExpression is required, not optional: a multikey unique index
// treats an EMPTY array the same as a missing field — both index as a single
// `null` key — so without this filter, the second user who ever reaches zero
// refresh tokens (e.g. logs out) collides with the first and blocks every
// subsequent user creation. Restricting the index to documents that actually
// have at least one entry keeps the real uniqueness guarantee for live
// tokens while letting any number of users sit at zero simultaneously.
userSchema.index(
  { "refreshTokens.tokenHash": 1 },
  {
    unique: true,
    partialFilterExpression: { "refreshTokens.0": { $exists: true } },
    name: "refreshTokens.tokenHash_unique_populated",
  }
);

export type User = InferSchemaType<typeof userSchema>;
export const UserModel = model("User", userSchema);
