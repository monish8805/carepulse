"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wifi, HeartPulse } from "lucide-react";
import type { AuthUser } from "@shared/types";
import { getBackendHealth, restoreSession } from "@/lib/api";
import { Avatar, Card, LoadingState } from "@/components/ui";

export default function Home() {
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  // Distinct from `user === null` (confirmed logged out) — avoids a flash of
  // "Log in / Register" before restoreSession() has actually resolved.
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
    // A deliberately looser, narrower column than PageContainer's shared
    // max-w-3xl — the Patient portal has no sidebar and no dense clinical
    // lists yet, so it reads better centered and airier than Hospital/Owner.
    <div className="mx-auto w-full max-w-[680px] px-4 py-12 sm:px-6">
      {user && (
        <div className="mb-7">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Your CarePulse account
          </h1>
          <p className="mt-2.5 text-base leading-relaxed text-slate-500 dark:text-slate-400">
            Everything here is yours. You&apos;ll see your monitored health information on this page once your
            hospital turns monitoring on.
          </p>
        </div>
      )}

      {checkingSession ? (
        <LoadingState />
      ) : user ? (
        <div className="space-y-7">
          <Card>
            <div className="flex items-center gap-3.5">
              <Avatar name={user.name} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{user.name}</p>
                <p className="truncate text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400">
                  <Wifi className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Connection</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Your account is reaching CarePulse normally.
                  </p>
                </div>
              </div>
              <span
                className={`hidden shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold sm:inline-flex ${
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
            </div>
          </Card>

          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <HeartPulse
              className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400"
              aria-hidden="true"
              strokeWidth={2}
            />
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Vitals, trends and alerts aren&apos;t switched on yet. Nothing is missing from your account — there&apos;s
              simply nothing to show until monitoring begins.
            </p>
          </div>
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
    </div>
  );
}
