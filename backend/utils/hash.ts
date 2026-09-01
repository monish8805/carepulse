import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

// Used for both passwords and OTP codes, so they are never stored in plain text.
export async function hashValue(value: string): Promise<string> {
  return bcrypt.hash(value, SALT_ROUNDS);
}

export async function compareValue(value: string, hash: string): Promise<boolean> {
  return bcrypt.compare(value, hash);
}
