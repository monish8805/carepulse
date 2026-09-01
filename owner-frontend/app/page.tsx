"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AuthUser } from "@shared/types";
import { getBackendHealth, restoreSession, logout } from "@/lib/api";

export default function Home() {
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    getBackendHealth().then(setBackendUp);
    // The access token only lives in memory, so every page load needs to trade
    // the HttpOnly refresh cookie for a new one before we know who's logged in.
    restoreSession().then(setUser);
  }, []);

  async function handleLogout() {
    await logout();
    setUser(null);
  }

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>CarePulse — Owner</h1>
      <p>Backend status: {backendUp === null ? "checking..." : backendUp ? "connected" : "not connected"}</p>

      {user ? (
        <>
          <p>
            Logged in as {user.name} ({user.email})
          </p>
          <button onClick={handleLogout}>Log out</button>
        </>
      ) : (
        <p>
          <Link href="/login">Log in</Link>
        </p>
      )}
    </main>
  );
}
