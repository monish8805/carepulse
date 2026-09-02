import type { NavSection } from "./Sidebar";

// Config-driven nav, kept next to HospitalLayout rather than inside the
// generic Sidebar component. Only lists routes that actually exist today —
// see PHASES.md for what Phase 2 will add here (patients/vitals/alerts/staff).
export const HOSPITAL_NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/", label: "Home" },
      { href: "/access", label: "Access & Roles" },
    ],
  },
];
