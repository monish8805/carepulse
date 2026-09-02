"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AuthUser } from "@shared/types";
import { getBackendHealth, restoreSession, logout } from "@/lib/api";

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

  async function handleLogout() {
    await logout();
    setUser(null);
  }

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>CarePulse — Patient</h1>
      <p>Backend status: {backendUp === null ? "checking..." : backendUp ? "connected" : "not connected"}</p>

      {checkingSession ? (
        <p>Loading...</p>
      ) : user ? (
        <>
          <p>
            Logged in as {user.name} ({user.email})
          </p>
          <button onClick={handleLogout}>Log out</button>
        </>
      ) : (
        <p>
          <Link href="/login">Log in</Link> or <Link href="/register">Register</Link>
        </p>
      )}
    </main>
  );
}
