import { Home, ShieldCheck, Users } from "lucide-react";
import type { NavSection } from "./Sidebar";

// Config-driven nav, kept next to HospitalLayout rather than inside the
// generic Sidebar component. Only lists routes that actually exist today —
// see PHASES.md for what's still ahead (vitals/alerts). This is the full,
// unfiltered set — HospitalLayout hides "/patients"/"/access" from the
// rendered sections for a viewer who currently lacks patient.view/
// canManageStaff (see its own comment on visibleNavSections) — nav.ts itself
// stays static config with no session-data access, same as before.
export const HOSPITAL_NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/", label: "Home", icon: Home },
      { href: "/patients", label: "Patients", icon: Users },
      { href: "/access", label: "Access & Roles", icon: ShieldCheck },
    ],
  },
];
