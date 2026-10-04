import { HttpError } from "../utils/httpError";

// Shared request-shape helpers. Like every other validator here these check
// SHAPE only — type, presence, size — never business rules (does this email
// already exist, is this password correct); those stay in domain/.
//
// Type is checked, not just truthiness, because the domain layer immediately
// does things like `input.email.toLowerCase()`: a body of `{"email": 123}`
// used to sail past a truthiness check and surface as an uncaught TypeError,
// i.e. a 500 where a 400 belongs. Length is checked because nothing else
// caps these — without a limit every string field accepts input up to
// Express's 100 kB body default and stores it (and `specialization` is then
// echoed to patients on every doctor lookup).

export const MAX_NAME = 120;
export const MAX_EMAIL = 254; // RFC 5321's practical ceiling
export const MAX_PHONE = 32;
export const MAX_SHORT_TEXT = 200; // specialization, AccessRole name, hospital name
export const MAX_CODE = 32; // OTP codes are 6 chars; this is just a bound
export const MAX_ID = 64; // Mongo ObjectId strings are 24 chars
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;
export const MAX_ARRAY_ITEMS = 50; // permissions / dataCategories selections
export const MAX_ISO_DATE = 40; // "2026-10-03T21:43:00.000Z" is 24 chars

// Returns the trimmed value so callers can use the normalized form.
export function requireString(value: unknown, field: string, opts: { min?: number; max: number }): string {
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} is required.`);
  }
  const trimmed = value.trim();
  const min = opts.min ?? 1;
  if (trimmed.length < min) {
    throw new HttpError(
      400,
      min === 1 ? `${field} is required.` : `${field} must be at least ${min} characters.`
    );
  }
  if (trimmed.length > opts.max) {
    throw new HttpError(400, `${field} must be at most ${opts.max} characters.`);
  }
  return trimmed;
}

// Deliberately NOT trimmed: leading/trailing whitespace is legitimate inside a
// password, and silently stripping it would change what the user typed.
//
// `min` is only applied where a password is being SET (register, reset). Login
// must not enforce a minimum — an account whose password predates the policy
// (or was machine-generated) still has to be able to authenticate; the length
// rule is about what we accept as a new secret, not about who may log in.
export function requirePassword(value: unknown, field: string, opts: { min: number }): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `${field} is required.`);
  }
  if (value.length < opts.min) {
    throw new HttpError(400, `${field} must be at least ${opts.min} characters.`);
  }
  if (value.length > MAX_PASSWORD) {
    throw new HttpError(400, `${field} must be at most ${MAX_PASSWORD} characters.`);
  }
  return value;
}

export function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, `${field} must be an array.`);
  }
  if (value.length > MAX_ARRAY_ITEMS) {
    throw new HttpError(400, `${field} must have at most ${MAX_ARRAY_ITEMS} items.`);
  }
  if (value.some((item) => typeof item !== "string")) {
    throw new HttpError(400, `${field} must contain only strings.`);
  }
  return value as string[];
}

// null/undefined mean "not provided" and come back as null. A provided value
// must be a finite number inside the range — a range check is a size bound
// here, not a business rule.
export function optionalNumberInRange(
  value: unknown,
  field: string,
  opts: { min: number; max: number }
): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError(400, `${field} must be a number.`);
  }
  if (value < opts.min || value > opts.max) {
    throw new HttpError(400, `${field} must be between ${opts.min} and ${opts.max}.`);
  }
  return value;
}

// An ISO 8601 date-time string (e.g. from Date.prototype.toISOString). Whether
// the moment itself is acceptable (not in the future, not too old) is a
// business rule and stays in domain/.
export function requireIsoDate(value: unknown, field: string): Date {
  if (typeof value !== "string" || value.length > MAX_ISO_DATE) {
    throw new HttpError(400, `${field} is required.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${field} must be a valid date.`);
  }
  return date;
}
