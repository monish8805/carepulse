import crypto from "crypto";

// Used to provision a hospital administrator's initial password. It's never
// chosen or seen by the Owner — only emailed once to the administrator — and
// they're expected to change it via the existing forgot-password flow.
export function generateTemporaryPassword(): string {
  return crypto.randomBytes(9).toString("base64url"); // 12 URL-safe characters
}
