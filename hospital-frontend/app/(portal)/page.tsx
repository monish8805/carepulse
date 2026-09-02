"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SessionUser, HospitalMembership } from "@shared/types";
import { getBackendHealth, restoreSession, getMe, listHospitalMemberships, selectHospital } from "@/lib/api";
import { Alert, Badge, Button, Card, EmptyState, LoadingState, PageContainer, PageHeader } from "@/components/ui";

export default function Home() {
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [memberships, setMemberships] = useState<HospitalMembership[] | null>(null);
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

      const me = await getMe();
      const list = await listHospitalMemberships();
      setMemberships(list);

      // If there's exactly one hospital and none is selected yet, pick it automatically.
      if (!me.hospital && list.length === 1) {
        await handleSelectHospital(list[0].hospitalId);
        return;
      }

      setUser(me);
    } catch (err) {
      // A logged-in session exists (restoreSession succeeded) but a later
      // call failed — show that clearly rather than silently looking logged
      // out with no explanation.
      setError(err instanceof Error ? err.message : "Could not load your session. Try refreshing.");
    } finally {
      setCheckingSession(false);
    }
  }

  async function handleSelectHospital(hospitalId: string) {
    setError("");
    try {
      // The backend re-verifies membership server-side before switching context —
      // this can fail even for a hospital we just listed, if access was revoked.
      await selectHospital(hospitalId);
      setUser(await getMe());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch hospital.");
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="CarePulse — Hospital"
        description={`Backend status: ${backendUp === null ? "checking..." : backendUp ? "connected" : "not connected"}`}
      />

      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {checkingSession ? (
        <LoadingState />
      ) : user ? (
        <div className="space-y-6">
          <Card>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Logged in as{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100">{user.name}</span> ({user.email})
            </p>
            {user.hospital && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <span>
                  Current hospital:{" "}
                  <span className="font-medium text-slate-900 dark:text-slate-100">{user.hospital.name}</span>
                </span>
                <Badge tone={user.hospital.role === "admin" ? "info" : "neutral"}>{user.hospital.role}</Badge>
              </p>
            )}
          </Card>

          {memberships && memberships.length > 0 ? (
            <Card title="Your hospitals">
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {memberships.map((m) => {
                  const isCurrent = m.hospitalId === user.hospital?.id;
                  return (
                    <li key={m.hospitalId} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {m.hospitalName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{m.role}</p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => handleSelectHospital(m.hospitalId)}
                        disabled={isCurrent}
                      >
                        {isCurrent ? "Current" : "Switch"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : memberships ? (
            <EmptyState
              title="You don't belong to a hospital yet"
              description="Request access to a hospital to get started."
              action={
                <Link href="/access">
                  <Button variant="secondary">Join a hospital →</Button>
                </Link>
              }
            />
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <Link href="/login" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Log in
          </Link>{" "}
          or{" "}
          <Link href="/register" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Register
          </Link>
        </p>
      )}
    </PageContainer>
  );
}
