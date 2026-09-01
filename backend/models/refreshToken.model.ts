import { Schema, model } from "mongoose";
import { ROLES } from "./user.model";

// Refresh tokens are opaque random strings; only their SHA-256 hash is stored,
// so a leaked database can't be used to impersonate a session (see utils/refreshToken.ts).
//
// portal pins this token to the session it was created for (patient/hospital/owner),
// so a refresh cookie minted for one portal can never be used to get an access token
// for another — that's the server-side half of portal isolation. hospitalId remembers
// the currently-selected hospital (Hospital Portal only) so it survives a silent refresh.
const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, unique: true },
    portal: { type: String, enum: ROLES, required: true },
    hospitalId: { type: Schema.Types.ObjectId, ref: "Hospital" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

export const RefreshTokenModel = model("RefreshToken", refreshTokenSchema);
