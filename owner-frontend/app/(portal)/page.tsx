"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound, Server, Building2 } from "lucide-react";
import type { AuthUser } from "@shared/types";
import { getBackendHealth, restoreSession } from "@/lib/api";
import { Card, Divider, LoadingState, PageContainer } from "@/components/ui";

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
  const [user, setUser] = useState<AuthUser | null>(null);
  // Distinct from `user === null` (confirmed logged out) — avoids a flash of
  // "Log in" before restoreSession() has actually resolved.
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    getBackendHealth().then(setBackendUp);
    // The access token only lives in memory, so every page load needs to trade
    // the HttpOnly refresh cookie for a new one before we know who's logged in.
    restoreSession()
      .then(setUser)
      .finally(() => setCheckingSession(false));
  }, []);

  return (
    <PageContainer>
      {user && (
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {getGreeting()}, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            You&apos;re signed in to CarePulse as the platform owner.
          </p>
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
                  <dt className="text-slate-500 dark:text-slate-400">Monitoring</dt>
                  <dd className="font-medium text-slate-500 dark:text-slate-400">Not yet enabled</dd>
                </div>
              </dl>
            </Card>
          </div>

          <Card title="Hospitals" description="Provisioning and administrators are managed on the Hospitals page." icon={Building2} />
        </div>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <Link href="/login" className="font-medium text-teal-700 hover:underline dark:text-teal-400">
            Log in
          </Link>
        </p>
      )}
    </PageContainer>
  );
}
