"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlusCircle, Building2 } from "lucide-react";
import type { Hospital } from "@shared/types";
import { restoreSession, listHospitals, createHospital } from "@/lib/api";
import { Alert, Button, Card, EmptyState, LoadingState, PageContainer, PageHeader, TextField } from "@/components/ui";

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
      setMessage(`Created "${result.hospital.name}". Login credentials were emailed to ${result.admin.email}.`);
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
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }

  if (!loggedIn) {
    return (
      <PageContainer>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <Link href="/login" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Log in
          </Link>{" "}
          to manage hospitals.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="Hospitals" description="Manage hospitals and administrators." />

      <div className="space-y-6">
        <Card title="Create a hospital" icon={PlusCircle}>
          <form onSubmit={handleCreate} className="space-y-4">
            <TextField
              label="Hospital name"
              value={hospitalName}
              onChange={(e) => setHospitalName(e.target.value)}
              required
            />
            <TextField
              label="Administrator name"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              required
            />
            <TextField
              label="Administrator email"
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
            />

            {message && <Alert variant="success">{message}</Alert>}
            {error && <Alert variant="error">{error}</Alert>}

            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create hospital"}
            </Button>
          </form>
        </Card>

        <Card title="Existing hospitals" icon={Building2}>
          {hospitals.length === 0 ? (
            <EmptyState title="No hospitals yet" />
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {hospitals.map((h) => (
                <li key={h.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{h.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400">Hospital ID: {h.id}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
