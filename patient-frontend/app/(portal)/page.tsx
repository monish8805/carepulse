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
          <h1 className="text-3xl font-semibold tracking-tight text-cp-text dark:text-cp-text-dark">
            Your CarePulse account
          </h1>
          <p className="mt-2.5 text-base leading-relaxed text-cp-text-muted dark:text-cp-text-muted-dark">
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
                <p className="truncate text-base font-semibold text-cp-text dark:text-cp-text-dark">{user.name}</p>
                <p className="truncate text-sm text-cp-text-muted dark:text-cp-text-muted-dark">{user.email}</p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cp-icon-soft text-cp-primary dark:bg-cp-icon-soft-dark dark:text-cp-primary-dark">
                  <Wifi className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-cp-text dark:text-cp-text-dark">Connection</p>
                  <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
                    Your account is reaching CarePulse normally.
                  </p>
                </div>
              </div>
              <span
                className={`hidden shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-xs font-semibold sm:inline-flex ${
                  backendUp
                    ? "border-cp-connected-text/20 bg-cp-connected-bg text-cp-connected-text dark:border-cp-connected-text-dark/30 dark:bg-cp-connected-bg-dark dark:text-cp-connected-text-dark"
                    : "border-cp-border bg-cp-workspace text-cp-text-muted dark:border-cp-border-dark dark:bg-cp-workspace-dark dark:text-cp-text-muted-dark"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    backendUp ? "bg-cp-connected-text dark:bg-cp-connected-text-dark" : "bg-cp-text-subtle dark:bg-cp-text-subtle-dark"
                  }`}
                />
                {backendUp === null ? "Checking..." : backendUp ? "Connected" : "Not connected"}
              </span>
            </div>
          </Card>

          <div className="flex items-start gap-3 rounded-xl border border-cp-border bg-cp-quiet-bg p-4 dark:border-cp-border-dark dark:bg-cp-quiet-bg-dark">
            <HeartPulse
              className="mt-0.5 h-4 w-4 shrink-0 text-cp-primary dark:text-cp-primary-dark"
              aria-hidden="true"
              strokeWidth={2}
            />
            <p className="text-sm leading-relaxed text-cp-text-muted dark:text-cp-text-muted-dark">
              Vitals, trends and alerts aren&apos;t switched on yet. Nothing is missing from your account — there&apos;s
              simply nothing to show until monitoring begins.
            </p>
          </div>
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
    </div>
  );
}
