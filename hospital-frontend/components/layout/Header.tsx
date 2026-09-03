"use client";

import { Activity } from "lucide-react";
import ThemeToggle from "@/components/ui/ThemeToggle";
import AccountMenu, { type AccountMenuItem } from "./AccountMenu";

interface HeaderProps {
  // The portal name shown after the "CarePulse" wordmark, e.g. "Hospital".
  portalName: string;
  // Extra context after a second divider, e.g. the current hospital + role —
  // hidden below `sm` since the wordmark/portal name already fit tightly.
  subtitle?: string;
  // null = still checking, true/false = known — omit the prop entirely to
  // not render the pill at all (no page currently does that, but keeps this
  // optional rather than forcing every future caller to pass a status).
  backendUp?: boolean | null;
  userName: string;
  userEmail?: string;
  accountMenuItems: AccountMenuItem[];
  onLogout: () => void;
  showMenuButton: boolean;
  mobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
}

// Purely presentational — receives everything it needs as props. The owning
// Layout decides what the user is allowed to see (including what goes in the
// account menu); this component never resolves permissions or session state
// itself.
export default function Header({
  portalName,
  subtitle,
  backendUp,
  userName,
  userEmail,
  accountMenuItems,
  onLogout,
  showMenuButton,
  mobileMenuOpen,
  onToggleMobileMenu,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-cp-border bg-cp-sidebar px-4 dark:border-cp-border-dark dark:bg-cp-sidebar-dark">
      <div className="flex min-w-0 items-center gap-3">
        {showMenuButton && (
          <button
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            onClick={onToggleMobileMenu}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-cp-text-muted hover:bg-cp-workspace focus-visible:outline focus-visible:outline-2 focus-visible:outline-cp-primary md:hidden dark:text-cp-text-muted-dark dark:hover:bg-cp-workspace-dark"
          >
            <span className="flex flex-col gap-1">
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
            </span>
          </button>
        )}

        {/* Brand lockup — the "activity" glyph is a placeholder mark (no logo
            asset exists yet); swap it for a real one when it exists. */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cp-primary text-white dark:bg-cp-primary-dark">
            <Activity className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
          </span>
          <span className="truncate text-sm font-semibold tracking-tight text-cp-text dark:text-cp-text-dark">
            CarePulse
          </span>
        </div>
        <span aria-hidden="true" className="h-5 w-px shrink-0 bg-cp-border dark:bg-cp-border-dark" />
        <span className="truncate text-sm text-cp-text-muted dark:text-cp-text-muted-dark">{portalName}</span>

        {subtitle && (
          <>
            <span
              aria-hidden="true"
              className="hidden h-5 w-px shrink-0 bg-cp-border sm:block dark:bg-cp-border-dark"
            />
            <span className="hidden truncate text-sm text-cp-text-muted sm:inline dark:text-cp-text-muted-dark">
              {subtitle}
            </span>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {backendUp !== undefined && (
          <span
            className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs font-medium sm:inline-flex ${
              backendUp
                ? "border-cp-connected-text/20 bg-cp-connected-bg text-cp-connected-text dark:border-cp-connected-text-dark/30 dark:bg-cp-connected-bg-dark dark:text-cp-connected-text-dark"
                : "border-cp-border bg-cp-workspace text-cp-text-muted dark:border-cp-border-dark dark:bg-cp-workspace-dark dark:text-cp-text-muted-dark"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${
                backendUp ? "bg-cp-connected-text dark:bg-cp-connected-text-dark" : "bg-cp-text-subtle dark:bg-cp-text-subtle-dark"
              }`}
            />
            {backendUp === null ? "Checking..." : backendUp ? "Connected" : "Not connected"}
          </span>
        )}
        <ThemeToggle />
        <AccountMenu userName={userName} userEmail={userEmail} items={accountMenuItems} onLogout={onLogout} />
      </div>
    </header>
  );
}
