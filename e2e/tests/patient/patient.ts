// The fake session user every Patient Portal spec logs in as. It has a date
// of birth, gender and blood type, so PatientLayout's first-login profile gate
// stays out of the way; profile.spec.ts overrides them to test the gate itself.
export const PATIENT = {
  id: "p1",
  name: "Pat One",
  email: "p@x.com",
  specialization: null,
  dateOfBirth: "1981-04-12T00:00:00.000Z" as string | null,
  gender: "female" as string | null,
  bloodType: "O+" as string | null,
  guardianPhone: null as string | null,
};

// Whole years since a UTC-midnight date of birth, as the app computes it.
export function ageInYears(dateOfBirth: string, now = new Date()): number {
  const born = new Date(dateOfBirth);
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const passed =
    now.getUTCMonth() > born.getUTCMonth() ||
    (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() >= born.getUTCDate());
  return passed ? age : age - 1;
}
