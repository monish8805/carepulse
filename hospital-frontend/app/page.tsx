"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SessionUser, HospitalMembership } from "@shared/types";
import {
  getBackendHealth,
  restoreSession,
  getMe,
  listHospitalMemberships,
  selectHospital,
  logout,
} from "@/lib/api";

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

  async function handleLogout() {
    await logout();
    setUser(null);
    setMemberships(null);
  }

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>CarePulse — Hospital</h1>
      <p>Backend status: {backendUp === null ? "checking..." : backendUp ? "connected" : "not connected"}</p>
      {error && <p style={{ color: "red" }}>{error}</p>}

      {checkingSession ? (
        <p>Loading...</p>
      ) : user ? (
        <>
          <p>
            Logged in as {user.name} ({user.email})
          </p>

          {user.hospital && (
            <p>
              Current hospital: <strong>{user.hospital.name}</strong> — role: {user.hospital.role} — id:{" "}
              <code>{user.hospital.id}</code>
            </p>
          )}

          {memberships && memberships.length > 0 ? (
            <div>
              <p>Your hospitals:</p>
              {memberships.map((m) => (
                <p key={m.hospitalId} style={{ margin: "0.25rem 0" }}>
                  <button
                    onClick={() => handleSelectHospital(m.hospitalId)}
                    disabled={m.hospitalId === user.hospital?.id}
                    style={{ marginRight: "0.5rem" }}
                  >
                    {m.hospitalName} ({m.role})
                  </button>
                  <code>{m.hospitalId}</code>
                </p>
              ))}
            </div>
          ) : memberships ? (
            <div style={{ padding: "1rem", border: "1px solid #ccc", borderRadius: "4px", maxWidth: "24rem" }}>
              <p>You don&apos;t belong to a hospital yet.</p>
              <Link href="/access">Join a hospital →</Link>
            </div>
          ) : null}

          <p>
            <Link href="/access">Access &amp; Roles</Link>
          </p>

          <p>
            <button onClick={handleLogout}>Log out</button>
          </p>
        </>
      ) : (
        <p>
          <Link href="/login">Log in</Link> or <Link href="/register">Register</Link>
        </p>
      )}
    </main>
  );
}
