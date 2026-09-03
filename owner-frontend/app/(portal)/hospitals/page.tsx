"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlusCircle, Building2 } from "lucide-react";
import type { Hospital } from "@shared/types";
import { restoreSession, listHospitals, createHospital, disableHospital, enableHospital, deleteHospital } from "@/lib/api";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  Modal,
  PageContainer,
  PageHeader,
  TextField,
} from "@/components/ui";

export default function HospitalsPage() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [hospitalName, setHospitalName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [hospitalToDelete, setHospitalToDelete] = useState<Hospital | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  function showError(err: unknown) {
    setMessage("");
    setError(err instanceof Error ? err.message : "Something went wrong.");
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
      showError(err);
    } finally {
      setLoading(false);
    }
  }

  // Toggles between disable/enable depending on the hospital's current state
  // — a reversible pause, distinct from Delete below.
  async function handleToggleActive(hospital: Hospital) {
    setError("");
    setMessage("");
    setTogglingId(hospital.id);
    try {
      if (hospital.isActive) {
        await disableHospital(hospital.id);
        setMessage(`Disabled "${hospital.name}".`);
      } else {
        await enableHospital(hospital.id);
        setMessage(`Enabled "${hospital.name}".`);
      }
      setHospitals(await listHospitals());
    } catch (err) {
      showError(err);
    } finally {
      setTogglingId(null);
    }
  }

  // Clears any stale error before opening a confirmation, so a message from
  // an earlier, unrelated action can't linger and read as if it applies here.
  function openDeleteConfirm(hospital: Hospital) {
    setError("");
    setMessage("");
    setHospitalToDelete(hospital);
  }

  async function handleConfirmDelete() {
    if (!hospitalToDelete) return;
    setDeleting(true);
    setError("");
    try {
      await deleteHospital(hospitalToDelete.id);
      setMessage(`Deleted "${hospitalToDelete.name}".`);
      setHospitals((prev) => prev.filter((h) => h.id !== hospitalToDelete.id));
      setHospitalToDelete(null);
    } catch (err) {
      showError(err);
    } finally {
      setDeleting(false);
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
        <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
          <Link href="/login" className="font-medium text-cp-primary hover:underline dark:text-cp-primary-dark">
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

      <div className="mb-6 space-y-3">
        {message && <Alert variant="success">{message}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
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

            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create hospital"}
            </Button>
          </form>
        </Card>

        <Card title="Existing hospitals" icon={Building2}>
          {hospitals.length === 0 ? (
            <EmptyState title="No hospitals yet" />
          ) : (
            <ul className="divide-y divide-cp-border dark:divide-cp-border-dark">
              {hospitals.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-cp-text dark:text-cp-text-dark">{h.name}</p>
                      {!h.isActive && <Badge tone="neutral">disabled</Badge>}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-cp-text-muted dark:text-cp-text-muted-dark">Hospital ID: {h.id}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="secondary"
                      disabled={togglingId === h.id}
                      onClick={() => handleToggleActive(h)}
                    >
                      {togglingId === h.id ? "..." : h.isActive ? "Disable" : "Enable"}
                    </Button>
                    <Button variant="destructive-subtle" onClick={() => openDeleteConfirm(h)}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={!!hospitalToDelete} onClose={() => setHospitalToDelete(null)} title="Delete hospital">
        <div className="space-y-3">
          <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
            Delete <span className="font-medium text-cp-text dark:text-cp-text-dark">{hospitalToDelete?.name}</span>?
            This permanently deletes the hospital along with every staff and admin membership and every access role
            tied to it. Their accounts stay — they just lose access to this hospital. This cannot be undone.
          </p>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setHospitalToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={handleConfirmDelete}>
              {deleting ? "Deleting..." : "Delete hospital"}
            </Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
