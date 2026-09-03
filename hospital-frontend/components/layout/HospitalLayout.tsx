"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Activity, UserRound, Settings } from "lucide-react";
import type { SessionUser, MyAccessRequest } from "@shared/types";
import { restoreSession, getMe, logout, getBackendHealth, listMyAccessRequests, selectHospital } from "@/lib/api";
import Header from "./Header";
import Sidebar from "./Sidebar";
import type { AccountMenuItem } from "./AccountMenu";
import { HOSPITAL_NAV_SECTIONS } from "./nav";
import HospitalAccessGate from "@/components/access/HospitalAccessGate";
import { Alert, Button, Card, LoadingState } from "@/components/ui";

// Statuses that mean the account currently occupies its one hospital "slot"
// — mirrors the backend's own live/non-live split (models/hospitalMembership.model.ts,
// domain/accessRequest.service.ts). rejected/removed/cancelled are historical
// and, per the Phase 1 one-hospital-per-user rule, free the account up again.
const LIVE_STATUSES = new Set(["pending", "active", "disabled"]);

type Phase =
  | { kind: "checking" }
  | { kind: "loggedOut" }
  | { kind: "error"; message: string }
  | { kind: "gated"; status: "none" | "pending" | "disabled"; myRequests: MyAccessRequest[]; user: SessionUser }
  | { kind: "active"; user: SessionUser };

function BrandMark() {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cp-primary text-white dark:bg-cp-primary-dark">
      <Activity className="h-5 w-5" aria-hidden="true" strokeWidth={2} />
    </span>
  );
}

// Owns the application shell (header + sidebar) for every route under
// app/(portal)/ — and, since this is also the one place every such route
// passes through, the real access gate: a Hospital Portal session is only
// ever shown the shell + its page once its CURRENT membership status
// (re-derived fresh from the backend, never assumed) is "active". Anything
// else — no membership, a pending request, a disabled one — renders
// HospitalAccessGate instead of `children`, so an unaffiliated/pending/
// disabled user never sees hospital-scoped navigation or content, even
// briefly. Session/portal/permission enforcement itself still lives entirely
// server-side (requireAuth/requirePortal/resolvePermissions) — this is what
// keeps the *frontend* honest about that server-side truth, not a substitute
// for it.
export default function HospitalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [backendUp, setBackendUp] = useState<boolean | null>(null);

  useEffect(() => {
    getBackendHealth().then(setBackendUp);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // A refresh (refreshKey bump, from "Check again"/cancel/submit) deliberately
    // does NOT reset `phase` back to "checking" — that would unmount whatever's
    // on screen and flash the bare loader for every re-check. Instead the
    // previous phase keeps rendering (with `refreshing` true, so its actions can
    // show a busy state) until this resolves to a new phase. Only the very
    // first run ever renders from the "checking" initial state.
    async function resolve() {
      setRefreshing(true);
      try {
        const restored = await restoreSession();
        if (!restored) {
          if (!cancelled) setPhase({ kind: "loggedOut" });
          return;
        }

        let me = await getMe();
        const myRequests = await listMyAccessRequests();
        const live = myRequests.find((r) => LIVE_STATUSES.has(r.status));

        if (!live) {
          if (!cancelled) setPhase({ kind: "gated", status: "none", myRequests, user: me });
          return;
        }
        if (live.status === "pending") {
          if (!cancelled) setPhase({ kind: "gated", status: "pending", myRequests, user: me });
          return;
        }
        if (live.status === "disabled") {
          if (!cancelled) setPhase({ kind: "gated", status: "disabled", myRequests, user: me });
          return;
        }

        // live.status === "active": establish hospital context if the current
        // access token doesn't already carry it (same call the old home-page
        // auto-select made) — re-verified server-side regardless.
        if (!me.hospital) {
          await selectHospital(live.hospitalId);
          me = await getMe();
        }
        if (!cancelled) setPhase({ kind: "active", user: me });
      } catch (err) {
        if (!cancelled) {
          setPhase({ kind: "error", message: err instanceof Error ? err.message : "Could not load your account." });
        }
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  function handleChanged() {
    setRefreshKey((key) => key + 1);
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Logout must always succeed from the user's perspective client-side —
      // the in-memory access token is already cleared by shared/api.ts's
      // logout() regardless of whether the network call succeeded, so the
      // session is dead either way. Swallow the error rather than leaving an
      // unhandled rejection and a stuck shell.
    } finally {
      setPhase({ kind: "loggedOut" });
      router.push("/login");
    }
  }

  if (phase.kind === "checking") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cp-page dark:bg-cp-page-dark">
        <BrandMark />
        <LoadingState label="Loading your account..." />
      </div>
    );
  }

  if (phase.kind === "loggedOut") {
    return <>{children}</>;
  }

  if (phase.kind === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-cp-page px-4 dark:bg-cp-page-dark">
        <BrandMark />
        <Card className="w-full max-w-md text-center">
          <div className="flex flex-col items-center gap-3">
            <h1 className="text-lg font-semibold text-cp-text dark:text-cp-text-dark">
              Something went wrong loading your account
            </h1>
            <Alert variant="error">{phase.message}</Alert>
            <Button onClick={handleChanged}>Try again</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (phase.kind === "gated") {
    return (
      <div className="flex min-h-screen flex-col">
        <Header
          portalName="Hospital"
          backendUp={backendUp}
          userName={phase.user.name}
          userEmail={phase.user.email}
          accountMenuItems={[]}
          onLogout={handleLogout}
          showMenuButton={false}
          mobileMenuOpen={false}
          onToggleMobileMenu={() => {}}
        />
        <div className="min-w-0 flex-1 overflow-y-auto bg-cp-workspace dark:bg-cp-workspace-dark">
          <HospitalAccessGate
            status={phase.status}
            myRequests={phase.myRequests}
            onChanged={handleChanged}
            refreshing={refreshing}
          />
        </div>
      </div>
    );
  }

  // phase.kind === "active"
  const user = phase.user;
  const accountMenuItems: AccountMenuItem[] = [
    { label: "Profile", icon: UserRound, onClick: () => router.push("/profile"), active: pathname === "/profile" },
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
              <span className="font-mono text-[11px] font-semibold tracking-wide text-cp-text-muted uppercase dark:text-cp-text-muted-dark">
                Acting within
              </span>
              <span className="truncate text-sm font-semibold text-cp-text dark:text-cp-text-dark">
                {user.hospital?.name ?? "No hospital selected"}
              </span>
            </>
          }
        />
        <div className="min-w-0 flex-1 overflow-y-auto bg-cp-workspace dark:bg-cp-workspace-dark">{children}</div>
      </div>
    </div>
  );
}
