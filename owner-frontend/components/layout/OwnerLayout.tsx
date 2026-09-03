"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound, Settings } from "lucide-react";
import type { AuthUser } from "@shared/types";
import { restoreSession, logout, getBackendHealth } from "@/lib/api";
import Header from "./Header";
import Sidebar from "./Sidebar";
import type { AccountMenuItem } from "./AccountMenu";
import { OWNER_NAV_SECTIONS } from "./nav";

// Account/personal actions — not hospital/owner-application navigation, so
// kept out of the Sidebar (see DESIGN.md's account-nav vs. hospital-nav
// split). Profile/Settings have no page yet, so they render disabled with a
// "Coming soon" hint rather than linking somewhere that doesn't exist.
const ACCOUNT_MENU_ITEMS: AccountMenuItem[] = [
  { label: "Profile", icon: UserRound, disabled: true, hint: "Coming soon" },
  { label: "Settings", icon: Settings, disabled: true, hint: "Coming soon" },
];

// Owns the application shell (header + sidebar) for every route under
// app/(portal)/. Deliberately does its own lightweight session check to know
// whether to show navigation chrome at all — it does NOT gate or replace each
// page's own auth handling below it. While no session is confirmed yet (or
// there isn't one), children render bare, exactly as they did before this
// shell existed. Session enforcement itself still lives entirely server-side
// — this is presentation only.
export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [backendUp, setBackendUp] = useState<boolean | null>(null);

  useEffect(() => {
    getBackendHealth().then(setBackendUp);
  }, []);

  useEffect(() => {
    let cancelled = false;

    restoreSession()
      .then((restored) => {
        if (!cancelled) setUser(restored);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Logout must always succeed from the user's perspective client-side —
      // the in-memory access token is already cleared by shared/api.ts's
      // logout() regardless of whether the network call succeeded, so the
      // session is dead either way. Swallow the error rather than leaving an
      // unhandled rejection and a stuck "still logged in" shell.
    } finally {
      setUser(null);
      router.push("/login");
    }
  }

  if (checkingSession || !user) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        portalName="Owner"
        backendUp={backendUp}
        userName={user.name}
        userEmail={user.email}
        accountMenuItems={ACCOUNT_MENU_ITEMS}
        onLogout={handleLogout}
        showMenuButton
        mobileMenuOpen={mobileOpen}
        onToggleMobileMenu={() => setMobileOpen((open) => !open)}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          sections={OWNER_NAV_SECTIONS}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          storageKey="cp-owner-sidebar-collapsed"
          footer={
            <>
              <span className="font-mono text-[11px] font-semibold tracking-wide text-cp-text-muted uppercase dark:text-cp-text-muted-dark">
                Signed in as
              </span>
              <span className="truncate text-sm font-semibold text-cp-text dark:text-cp-text-dark">
                {user.name}
              </span>
              <span className="text-xs text-cp-text-muted dark:text-cp-text-muted-dark">Platform owner</span>
            </>
          }
        />
        <div className="min-w-0 flex-1 overflow-y-auto bg-cp-workspace dark:bg-cp-workspace-dark">{children}</div>
      </div>
    </div>
  );
}
