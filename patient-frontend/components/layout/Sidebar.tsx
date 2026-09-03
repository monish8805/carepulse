"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface NavItem {
  href: string;
  label: string;
  // Decorative only — the label is always present for a screen reader, and
  // when collapsed the icon still has the label as its `title`/tooltip.
  icon?: LucideIcon;
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
  // Optional inset panel pinned to the bottom (mt-auto) — content (labels,
  // current-hospital name, a "Switch hospital" link, etc.) is entirely
  // decided by the owning Layout; Sidebar only owns the panel's chrome.
  // Hidden while collapsed, same as nav-item labels.
  footer?: ReactNode;
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Presentational: renders nav config and tracks the active route. Does not
// decide what the user is allowed to see — the owning Layout passes in
// whatever `sections` it has already decided are appropriate.
export default function Sidebar({ sections, mobileOpen, onCloseMobile, storageKey, footer }: SidebarProps) {
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
        className={`fixed inset-y-0 top-14 z-20 flex w-60 flex-col gap-1 border-r border-cp-border bg-cp-sidebar p-2 transition-transform duration-200 ease-in-out md:static md:top-0 md:translate-x-0 md:transition-[width] md:duration-150 dark:border-cp-border-dark dark:bg-cp-sidebar-dark ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:w-14" : "md:w-56"}`}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden self-end rounded-lg px-2 py-1 text-sm text-cp-text-muted hover:bg-cp-workspace md:block dark:text-cp-text-muted-dark dark:hover:bg-cp-workspace-dark"
        >
          {collapsed ? "»" : "«"}
        </button>

        {sections.map((section, index) => (
          <div key={section.label ?? index}>
            {section.label && !collapsed && (
              <div className="px-2 pt-2 pb-1 font-mono text-xs font-semibold tracking-wide text-cp-text-muted uppercase dark:text-cp-text-muted-dark">
                {section.label}
              </div>
            )}
            {section.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onCloseMobile}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 truncate rounded-lg px-3 py-2 text-sm ${
                    active
                      ? "bg-cp-nav-selected font-semibold text-cp-primary dark:bg-cp-nav-selected-dark dark:text-cp-primary-dark"
                      : "font-medium text-cp-text-muted hover:bg-cp-workspace dark:text-cp-text-muted-dark dark:hover:bg-cp-workspace-dark"
                  }`}
                >
                  {Icon && (
                    <Icon
                      className={`h-4 w-4 shrink-0 ${active ? "" : "text-cp-text-subtle dark:text-cp-text-subtle-dark"}`}
                      aria-hidden="true"
                      strokeWidth={2}
                    />
                  )}
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}

        {footer && !collapsed && (
          <div className="mt-auto flex flex-col gap-1 rounded-xl border border-cp-border bg-cp-workspace p-3 dark:border-cp-border-dark dark:bg-cp-workspace-dark">
            {footer}
          </div>
        )}
      </nav>
    </>
  );
}
