"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Hospital } from "@shared/types";
import { restoreSession, listHospitals, createHospital } from "@/lib/api";

export default function HospitalsPage() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [hospitalName, setHospitalName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      // Restores the session in case this page was reached by a fresh page load
      // (the access token only lives in memory, so it wouldn't survive that).
      const user = await restoreSession();
      if (!user) {
        setLoggedIn(false);
        return;
      }
      setHospitals(await listHospitals());
      setLoggedIn(true);
    } catch (err) {
      // A logged-in session exists but loading hospitals failed — show that
      // clearly rather than silently leaving the list empty with no explanation.
      setLoggedIn(true);
      setError(err instanceof Error ? err.message : "Could not load hospitals. Try refreshing.");
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const result = await createHospital({ hospitalName, adminName, adminEmail });
      setMessage(
        `Created "${result.hospital.name}". Login credentials were emailed to ${result.admin.email}.`
      );
      setHospitalName("");
      setAdminName("");
      setAdminEmail("");
      setHospitals(await listHospitals());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create hospital.");
    } finally {
      setLoading(false);
    }
  }

  if (loggedIn === null) {
    return (
      <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
        <p>Loading...</p>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
        <p>
          <Link href="/login">Log in</Link> to manage hospitals.
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: 500 }}>
      <p>
        <Link href="/">← Home</Link>
      </p>
      <h1>Hospitals</h1>

      <h2>Create a hospital</h2>
      <form onSubmit={handleCreate}>
        <input
          placeholder="Hospital name"
          value={hospitalName}
          onChange={(e) => setHospitalName(e.target.value)}
          required
        />
        <br />
        <input
          placeholder="Administrator name"
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          required
        />
        <br />
        <input
          placeholder="Administrator email"
          type="email"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          required
        />
        <br />
        <button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create hospital"}
        </button>
      </form>

      {message && <p style={{ color: "green" }}>{message}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      <h2>Existing hospitals</h2>
      {hospitals.length === 0 ? (
        <p>No hospitals yet.</p>
      ) : (
        <ul>
          {hospitals.map((h) => (
            <li key={h.id}>
              {h.name} — <code>{h.id}</code>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
