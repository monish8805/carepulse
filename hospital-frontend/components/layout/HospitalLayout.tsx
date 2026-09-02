"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@shared/types";
import { restoreSession, getMe, logout } from "@/lib/api";
import Header from "./Header";
import Sidebar from "./Sidebar";
import RequestAccessModal from "./RequestAccessModal";
import type { AccountMenuItem } from "./AccountMenu";
import { HOSPITAL_NAV_SECTIONS } from "./nav";

// Owns the application shell (header + sidebar) for every route under
// app/(portal)/. Deliberately does its own lightweight session check to know
// whether to show navigation chrome at all — it does NOT gate or replace each
// page's own auth handling below it. While no session is confirmed yet (or
// there isn't one), children render bare, exactly as they did before this
// shell existed, so a logged-out page's own "log in first" state is
// untouched. Session/portal/hospital enforcement itself still lives entirely
// server-side (requireAuth/requirePortal/resolvePermissions) — this is
// presentation only.
export default function HospitalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [requestAccessOpen, setRequestAccessOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const restored = await restoreSession();
        if (!restored) {
          if (!cancelled) setUser(null);
          return;
        }
        const me = await getMe();
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await logout();
    setUser(null);
    router.push("/login");
  }

  if (checkingSession || !user) {
    return <>{children}</>;
  }

  // Account/profile actions, not hospital-application navigation — kept out
  // of the Sidebar on purpose (see the account-nav vs. hospital-nav split in
  // DESIGN.md). Profile/Settings have no page yet, so they're shown but
  // disabled rather than linking somewhere that doesn't exist.
  const accountMenuItems: AccountMenuItem[] = [
    { label: "Profile", disabled: true, hint: "Coming soon" },
    { label: "Request hospital access", onClick: () => setRequestAccessOpen(true) },
    { label: "Settings", disabled: true, hint: "Coming soon" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        title="CarePulse — Hospital"
        subtitle={user.hospital ? `${user.hospital.name} (${user.hospital.role})` : undefined}
        userName={user.name}
        userEmail={user.email}
        accountMenuItems={accountMenuItems}
        onLogout={handleLogout}
        showMenuButton
        mobileMenuOpen={mobileOpen}
        onToggleMobileMenu={() => setMobileOpen((open) => !open)}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          sections={HOSPITAL_NAV_SECTIONS}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          storageKey="cp-hospital-sidebar-collapsed"
        />
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
      <RequestAccessModal open={requestAccessOpen} onClose={() => setRequestAccessOpen(false)} />
    </div>
  );
}
