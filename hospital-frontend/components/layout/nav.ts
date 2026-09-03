import { Home, ShieldCheck, Users } from "lucide-react";
import type { NavSection } from "./Sidebar";

// Config-driven nav, kept next to HospitalLayout rather than inside the
// generic Sidebar component. Only lists routes that actually exist today —
// see PHASES.md for what's still ahead (vitals/alerts). "Patients" is always
// listed regardless of whether the viewer currently holds patient.view — the
// page itself shows an EmptyState when they don't, same pattern "Access &
// Roles" already uses for non-admin/non-staff.manage viewers.
export const HOSPITAL_NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/", label: "Home", icon: Home },
      { href: "/patients", label: "Patients", icon: Users },
      { href: "/access", label: "Access & Roles", icon: ShieldCheck },
    ],
  },
];
