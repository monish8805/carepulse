"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

interface SidebarProps {
  sections: NavSection[];
  mobileOpen: boolean;
  onCloseMobile: () => void;
  // Namespaces the collapsed-state localStorage key per portal, so each
  // frontend remembers its own sidebar state independently.
  storageKey: string;
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Presentational: renders nav config and tracks the active route. Does not
// decide what the user is allowed to see — the owning Layout passes in
// whatever `sections` it has already decided are appropriate.
export default function Sidebar({ sections, mobileOpen, onCloseMobile, storageKey }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Read the persisted preference after mount only, so the server-rendered
  // and first client render always agree (avoids a hydration mismatch) —
  // localStorage isn't available during SSR, so this can't move into the
  // useState initializer without reintroducing that mismatch.
  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a client-only value on mount, not a derived/cascading update
    if (stored === "true") setCollapsed(true);
  }, [storageKey]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(storageKey, String(next));
      return next;
    });
  }

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          aria-hidden="true"
          className="fixed inset-x-0 top-14 bottom-0 z-10 bg-black/40 md:hidden"
        />
      )}
      <nav
        aria-label="Main navigation"
        className={`fixed inset-y-0 top-14 z-20 flex w-60 flex-col gap-1 border-r border-slate-200 bg-white p-2 transition-transform duration-200 ease-in-out md:static md:top-0 md:translate-x-0 md:transition-[width] md:duration-150 dark:border-slate-800 dark:bg-slate-900 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:w-14" : "md:w-56"}`}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden self-end rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 md:block dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {collapsed ? "»" : "«"}
        </button>

        {sections.map((section, index) => (
          <div key={section.label ?? index}>
            {section.label && !collapsed && (
              <div className="px-2 pt-2 pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
                {section.label}
              </div>
            )}
            {section.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onCloseMobile}
                  title={collapsed ? item.label : undefined}
                  className={`block truncate rounded-md px-3 py-2 text-sm font-medium ${
                    active
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {collapsed ? item.label.slice(0, 1) : item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );
}
