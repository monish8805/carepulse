// Single source of truth for valid permission strings. AccessRoles can only be
// created/updated with permissions from this list — never arbitrary strings.
// Namespace is "<area>.<action>". Nothing here is tied to a clinical job title
// (Cardiologist/Nurse/etc are just example AccessRole *names* a hospital might
// choose — they are never hardcoded into authorization logic).
export const PERMISSIONS = [
  "patient.view",
  "vitals.view",
  "alerts.view",
  "alerts.acknowledge",
  "staff.view",
  "staff.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isValidPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
