import { Home, ShieldCheck } from "lucide-react";
import type { NavSection } from "./Sidebar";

// Config-driven nav, kept next to PatientLayout rather than inside the
// generic Sidebar component. Only lists routes that actually exist today —
// see PHASES.md for what's still ahead (vitals/dashboards).
export const PATIENT_NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/", label: "Home", icon: Home },
      { href: "/sharing", label: "Data Sharing", icon: ShieldCheck },
    ],
  },
];
