"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Repeat, UserRound, Building2, Settings } from "lucide-react";
import type { SessionUser } from "@shared/types";
import { restoreSession, getMe, logout, getBackendHealth } from "@/lib/api";
import Header from "./Header";
import Sidebar from "./Sidebar";
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
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [backendUp, setBackendUp] = useState<boolean | null>(null);

  useEffect(() => {
    getBackendHealth().then(setBackendUp);
  }, []);

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

  // Account/profile actions, not hospital-application navigation — kept out
  // of the Sidebar on purpose (see the account-nav vs. hospital-nav split in
  // DESIGN.md). Profile/Settings have no page yet, so they're shown but
  // disabled rather than linking somewhere that doesn't exist.
  const accountMenuItems: AccountMenuItem[] = [
    { label: "Profile", icon: UserRound, disabled: true, hint: "Coming soon" },
    {
      label: "Request hospital access",
      icon: Building2,
      onClick: () => router.push("/access-request"),
      active: pathname === "/access-request",
    },
    { label: "Settings", icon: Settings, disabled: true, hint: "Coming soon" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        portalName="Hospital"
        subtitle={user.hospital ? `${user.hospital.name} (${user.hospital.role})` : undefined}
        backendUp={backendUp}
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
          footer={
            <>
              <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                Acting within
              </span>
              <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {user.hospital?.name ?? "No hospital selected"}
              </span>
              {/* Reuses the existing hospital-switcher on the home page rather
                  than adding a new route or a mini-switcher here. */}
              <Link
                href="/"
                className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
              >
                <Repeat className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2} />
                Switch hospital
              </Link>
            </>
          }
        />
        <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
