// MongoDB's duplicate-key error (a unique index rejected a write). Shared by
// the central error handler in app.ts and by domain code that expects one —
// e.g. alert.service.ts, where losing the race for "one active alert per
// patient" is the normal outcome, not an error.
export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === 11000;
}
