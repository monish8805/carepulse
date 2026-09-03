// Single source of truth for valid patient-data-sharing category strings — a
// PatientConsent grant can only be created/updated with categories from this
// list, never arbitrary strings. Mirrors config/permissions.ts's own shape
// and rationale exactly, but this is a separate axis: PERMISSIONS gates what
// a hospital staff member's AccessRole can *do* within a hospital; this gates
// what a *patient* is willing to *share*, regardless of hospital.
//
// No medical features exist yet (see PHASES.md — Phase 3), so this starts
// with the two categories already anticipated (continuous vs. occasional
// vitals uploads). Add new categories here as real data features land —
// nothing else needs to change to support a new one.
export const DATA_CATEGORIES = ["vitals.continuous", "vitals.occasional"] as const;

export type DataCategory = (typeof DATA_CATEGORIES)[number];

export function isValidDataCategory(value: string): value is DataCategory {
  return (DATA_CATEGORIES as readonly string[]).includes(value);
}
