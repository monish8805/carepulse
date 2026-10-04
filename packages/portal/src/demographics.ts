import type { BloodType, Gender } from "@carepulse/api/types";

const GENDER_LABELS: Record<Gender, string> = { male: "Male", female: "Female", other: "Other" };

// Whole years since a date of birth stored as UTC midnight. Compared on UTC
// date parts so it doesn't flip a day early or late depending on the viewer's
// time zone.
export function ageInYears(dateOfBirth: string, now = new Date()): number {
  const born = new Date(dateOfBirth);
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const birthdayPassed =
    now.getUTCMonth() > born.getUTCMonth() ||
    (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() >= born.getUTCDate());
  if (!birthdayPassed) age -= 1;
  return age;
}

export function genderLabel(gender: Gender): string {
  return GENDER_LABELS[gender];
}

// "45 years · Female", or whichever part is known; null when neither is.
export function formatDemographics(dateOfBirth: string | null | undefined, gender: Gender | null | undefined) {
  const parts = [
    dateOfBirth ? `${ageInYears(dateOfBirth)} years` : null,
    gender ? genderLabel(gender) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function bloodTypeLabel(bloodType: BloodType): string {
  return bloodType === "unknown" ? "Unknown" : bloodType;
}

// The fields the Patient Portal requires before anything else (CompleteProfileGate).
export function isPatientProfileComplete(user: {
  dateOfBirth?: string | null;
  gender?: Gender | null;
  bloodType?: BloodType | null;
}): boolean {
  return !!user.dateOfBirth && !!user.gender && !!user.bloodType;
}
