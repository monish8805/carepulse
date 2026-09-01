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

  useEffect(() => {
    getBackendHealth().then(setBackendUp);
    loadSession();
  }, []);

  async function loadSession() {
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

      {user ? (
        <>
          <p>
            Logged in as {user.name} ({user.email})
          </p>

          {user.hospital && (
            <p>
              Current hospital: <strong>{user.hospital.name}</strong> — role: {user.hospital.role}
            </p>
          )}

          {memberships && memberships.length > 0 ? (
            <div>
              <p>Your hospitals:</p>
              {memberships.map((m) => (
                <button
                  key={m.hospitalId}
                  onClick={() => handleSelectHospital(m.hospitalId)}
                  disabled={m.hospitalId === user.hospital?.id}
                  style={{ marginRight: "0.5rem" }}
                >
                  {m.hospitalName} ({m.role})
                </button>
              ))}
            </div>
          ) : memberships ? (
            <p>You don&apos;t have access to any hospital yet.</p>
          ) : null}

          {error && <p style={{ color: "red" }}>{error}</p>}

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
