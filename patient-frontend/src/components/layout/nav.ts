import { FileText, HeartPulse, Home, ScanLine, ShieldCheck } from "lucide-react";
import type { NavSection } from "@carepulse/portal";

// Config-driven nav, kept next to PatientLayout rather than inside the
// generic Sidebar component. Only lists routes that actually exist today —
// see PHASES.md for what's still ahead (vitals/dashboards).
export const PATIENT_NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/", label: "Home", icon: Home },
      { href: "/vitals", label: "My Vitals", icon: HeartPulse },
      { href: "/xray", label: "Chest X-ray", icon: ScanLine },
      { href: "/prescription", label: "Prescription", icon: FileText },
      { href: "/sharing", label: "Data Sharing", icon: ShieldCheck },
    ],
  },
];
