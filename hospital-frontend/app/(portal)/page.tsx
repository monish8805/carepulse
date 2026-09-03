"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound, Server, Building2 } from "lucide-react";
import type { SessionUser } from "@shared/types";
import { getBackendHealth, restoreSession, getMe } from "@/lib/api";
import { Alert, Badge, Card, Divider, LoadingState, PageContainer } from "@/components/ui";

// "Good morning/afternoon/evening" — purely presentational, computed from the
// viewer's local clock; no new data or backend call involved.
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// HospitalLayout only ever renders this page once the session's current
// membership is "active" (its own gate, see components/access/HospitalAccessGate.tsx
// for everyone else) — so `user.hospital` is guaranteed to already be
// populated here; this page no longer needs to fetch or select a hospital
// itself. It still does its own lightweight session check (unchanged pattern
// — see HospitalLayout's own comment on why) purely so a direct/bare-children
// render (e.g. while logged out) still shows something sensible.
export default function Home() {
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState("");
  // Distinct from `user === null` (confirmed logged out) — avoids a flash of
  // "Log in / Register" before the session-restore sequence has finished.
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    getBackendHealth().then(setBackendUp);
    loadSession();
  }, []);

  async function loadSession() {
    try {
      // The access token only lives in memory, so every page load needs to trade
      // the HttpOnly refresh cookie for a new one before we know who's logged in.
      const restored = await restoreSession();
      if (!restored) {
        setUser(null);
        return;
      }
      setUser(await getMe());
    } catch (err) {
      // A logged-in session exists (restoreSession succeeded) but a later
      // call failed — show that clearly rather than silently looking logged
      // out with no explanation.
      setError(err instanceof Error ? err.message : "Could not load your session. Try refreshing.");
    } finally {
      setCheckingSession(false);
    }
  }

  return (
    <PageContainer>
      {user && (
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-cp-text dark:text-cp-text-dark">
            {getGreeting()}, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
            {user.hospital
              ? `You're signed in to ${user.hospital.name} as ${user.hospital.role === "admin" ? "an administrator" : user.hospital.role}.`
              : "You're signed in to CarePulse."}
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {checkingSession ? (
        <LoadingState />
      ) : user ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card title="Your session" icon={UserRound}>
              <dl className="flex flex-col gap-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-cp-text-muted dark:text-cp-text-muted-dark">Name</dt>
                  <dd className="truncate font-medium text-cp-text dark:text-cp-text-dark">{user.name}</dd>
                </div>
                <Divider />
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-cp-text-muted dark:text-cp-text-muted-dark">Email</dt>
                  <dd className="truncate font-medium text-cp-text dark:text-cp-text-dark">{user.email}</dd>
                </div>
                {user.hospital && (
                  <>
                    <Divider />
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-cp-text-muted dark:text-cp-text-muted-dark">Role here</dt>
                      <dd>
                        <Badge tone={user.hospital.role === "admin" ? "info" : "neutral"}>
                          {user.hospital.role}
                        </Badge>
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </Card>

            <Card title="System" icon={Server} iconTone="neutral">
              <dl className="flex flex-col gap-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-cp-text-muted dark:text-cp-text-muted-dark">Backend</dt>
                  <dd
                    className={`flex items-center gap-1.5 font-medium ${
                      backendUp
                        ? "text-cp-connected-text dark:text-cp-connected-text-dark"
                        : "text-cp-text-muted dark:text-cp-text-muted-dark"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full ${
                        backendUp
                          ? "bg-cp-connected-text dark:bg-cp-connected-text-dark"
                          : "bg-cp-text-subtle dark:bg-cp-text-subtle-dark"
                      }`}
                    />
                    {backendUp === null ? "Checking..." : backendUp ? "Connected" : "Not connected"}
                  </dd>
                </div>
                <Divider />
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-cp-text-muted dark:text-cp-text-muted-dark">Monitoring</dt>
                  <dd className="font-medium text-cp-text-muted dark:text-cp-text-muted-dark">Not yet enabled</dd>
                </div>
              </dl>
            </Card>
          </div>

          {user.hospital && (
            <Card title="Your hospital" description="The hospital your account is provisioned for." icon={Building2}>
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium text-cp-text dark:text-cp-text-dark">
                  {user.hospital.name}
                </p>
                <Badge tone="info">{user.hospital.role}</Badge>
              </div>
            </Card>
          )}
        </div>
      ) : (
        <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
          <Link href="/login" className="font-medium text-cp-primary hover:underline dark:text-cp-primary-dark">
            Log in
          </Link>{" "}
          or{" "}
          <Link href="/register" className="font-medium text-cp-primary hover:underline dark:text-cp-primary-dark">
            Register
          </Link>
        </p>
      )}
    </PageContainer>
  );
}
