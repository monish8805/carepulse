"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound, Server, Building2 } from "lucide-react";
import type { SessionUser, HospitalMembership } from "@shared/types";
import { getBackendHealth, restoreSession, getMe, listHospitalMemberships, selectHospital } from "@/lib/api";
import { Alert, Avatar, Badge, Button, Card, Divider, EmptyState, LoadingState, PageContainer } from "@/components/ui";

// "Good morning/afternoon/evening" — purely presentational, computed from the
// viewer's local clock; no new data or backend call involved.
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

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
      {user && (
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {getGreeting()}, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
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
                  <dt className="text-slate-500 dark:text-slate-400">Name</dt>
                  <dd className="truncate font-medium text-slate-900 dark:text-slate-100">{user.name}</dd>
                </div>
                <Divider />
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">Email</dt>
                  <dd className="truncate font-medium text-slate-900 dark:text-slate-100">{user.email}</dd>
                </div>
                {user.hospital && (
                  <>
                    <Divider />
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-500 dark:text-slate-400">Role here</dt>
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
                  <dt className="text-slate-500 dark:text-slate-400">Backend</dt>
                  <dd
                    className={`flex items-center gap-1.5 font-medium ${
                      backendUp ? "text-green-700 dark:text-green-400" : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full ${backendUp ? "bg-green-600" : "bg-slate-400"}`}
                    />
                    {backendUp === null ? "Checking..." : backendUp ? "Connected" : "Not connected"}
                  </dd>
                </div>
                <Divider />
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">Hospitals you belong to</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">{memberships?.length ?? 0}</dd>
                </div>
                <Divider />
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500 dark:text-slate-400">Monitoring</dt>
                  <dd className="font-medium text-slate-500 dark:text-slate-400">Not yet enabled</dd>
                </div>
              </dl>
            </Card>
          </div>

          {memberships && memberships.length > 0 ? (
            <Card title="Your hospitals" description="Your role can differ at each one." icon={Building2}>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {memberships.map((m) => {
                  const isCurrent = m.hospitalId === user.hospital?.id;
                  return (
                    <li
                      key={m.hospitalId}
                      className={`flex items-center gap-3 py-3 first:pt-0 last:pb-0 ${
                        isCurrent ? "-mx-5 bg-slate-50 px-5 dark:bg-slate-800/40" : ""
                      }`}
                    >
                      <Avatar name={m.hospitalName} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {m.hospitalName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{m.role}</p>
                      </div>
                      {isCurrent ? (
                        <Badge tone="info">Current</Badge>
                      ) : (
                        <Button variant="secondary" onClick={() => handleSelectHospital(m.hospitalId)}>
                          Switch
                        </Button>
                      )}
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
          <Link href="/login" className="font-medium text-teal-700 hover:underline dark:text-teal-400">
            Log in
          </Link>{" "}
          or{" "}
          <Link href="/register" className="font-medium text-teal-700 hover:underline dark:text-teal-400">
            Register
          </Link>
        </p>
      )}
    </PageContainer>
  );
}
