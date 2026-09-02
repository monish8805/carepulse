import type { NavSection } from "./Sidebar";

// Config-driven nav, kept next to OwnerLayout rather than inside the
// generic Sidebar component. Only lists routes that actually exist today.
export const OWNER_NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/", label: "Home" },
      { href: "/hospitals", label: "Hospitals" },
    ],
  },
];
