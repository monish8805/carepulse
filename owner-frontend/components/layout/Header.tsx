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
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex min-w-0 items-center gap-3">
        {showMenuButton && (
          <button
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            onClick={onToggleMobileMenu}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 md:hidden dark:text-slate-300 dark:hover:bg-slate-800"
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
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white">
            <Activity className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
          </span>
          <span className="truncate text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            CarePulse
          </span>
        </div>
        <span aria-hidden="true" className="h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />
        <span className="truncate text-sm text-slate-500 dark:text-slate-400">{portalName}</span>

        {subtitle && (
          <>
            <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-slate-200 sm:block dark:bg-slate-700" />
            <span className="hidden truncate text-sm text-slate-500 sm:inline dark:text-slate-400">
              {subtitle}
            </span>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {backendUp !== undefined && (
          <span
            className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium sm:inline-flex ${
              backendUp
                ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-400"
                : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${backendUp ? "bg-green-600" : "bg-slate-400"}`}
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
