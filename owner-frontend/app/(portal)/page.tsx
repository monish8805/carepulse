"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AuthUser } from "@shared/types";
import { getBackendHealth, restoreSession } from "@/lib/api";
import { Card, LoadingState, PageContainer, PageHeader } from "@/components/ui";

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
      <PageHeader
        title="CarePulse — Owner"
        description={`Backend status: ${backendUp === null ? "checking..." : backendUp ? "connected" : "not connected"}`}
      />

      {checkingSession ? (
        <LoadingState />
      ) : user ? (
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Logged in as{" "}
            <span className="font-medium text-slate-900 dark:text-slate-100">{user.name}</span> ({user.email})
          </p>
        </Card>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <Link href="/login" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Log in
          </Link>
        </p>
      )}
    </PageContainer>
  );
}
