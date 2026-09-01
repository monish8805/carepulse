import crypto from "crypto";

export const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// The refresh token itself is a long random opaque string (not a JWT).
// Only its SHA-256 hash is ever stored, so a database leak alone can't be used to log in.
// SHA-256 (not bcrypt) is fine here: unlike passwords/OTPs, this value is already
// high-entropy, and we need a fast, deterministic hash to look it up by equality.
export function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
