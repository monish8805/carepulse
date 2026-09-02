"use client";

import AccountMenu, { type AccountMenuItem } from "./AccountMenu";

interface HeaderProps {
  title: string;
  subtitle?: string;
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
  title,
  subtitle,
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
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 md:hidden dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <span className="flex flex-col gap-1">
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
            </span>
          </button>
        )}
        <span className="truncate font-semibold text-slate-900 dark:text-slate-100">{title}</span>
        {subtitle && (
          <span className="hidden truncate text-sm text-slate-500 sm:inline dark:text-slate-400">
            {subtitle}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center">
        <AccountMenu userName={userName} userEmail={userEmail} items={accountMenuItems} onLogout={onLogout} />
      </div>
    </header>
  );
}
