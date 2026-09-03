"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import type { SessionUser, GrantedPatientSummary } from "@shared/types";
import { restoreSession, getMe, listGrantedPatients, revokeConsentAsDoctor } from "@/lib/api";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  Modal,
  PageContainer,
  PageHeader,
} from "@/components/ui";

// "vitals.continuous" -> "Vitals — Continuous", matching the category
// catalogue in backend/config/dataCategories.ts to a readable label — same
// pattern as ManageRolesPanel.tsx's formatPermissionLabel.
function formatCategoryLabel(category: string): string {
  return category
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" — ");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Read-only from this side, by design: a doctor can see who has shared
// access with them and give it up (Revoke), but never change what's shared —
// that's the patient's own call (see patient-frontend's /sharing page).
// Gated by patient.view (HospitalContext.canViewPatients) — HospitalLayout
// already hides this page's Sidebar link for a viewer without it, but the
// EmptyState below stays as the real gate (nav filtering is presentation
// only; a direct URL visit still needs to hit this check).
export default function PatientsPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [patients, setPatients] = useState<GrantedPatientSummary[]>([]);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  // A doctor giving up access cannot undo it themselves — only the patient can
  // grant again — so it gets the same confirmation step as every other
  // irreversible action in the app.
  const [patientToRevoke, setPatientToRevoke] = useState<GrantedPatientSummary | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canViewPatients = user?.hospital?.canViewPatients ?? false;

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const restored = await restoreSession();
      if (!restored) {
        setUser(null);
        return;
      }
      const me = await getMe();
      setUser(me);
      if (me.hospital?.canViewPatients) {
        setPatients(await listGrantedPatients());
      }
    } catch (err) {
      showError(err);
    } finally {
      setCheckingSession(false);
    }
  }

  function showError(err: unknown) {
    setMessage("");
    setError(err instanceof Error ? err.message : "Something went wrong.");
  }

  async function handleRevoke() {
    const patient = patientToRevoke;
    if (!patient) return;
    setError("");
    setMessage("");
    setRevokingId(patient.id);
    try {
      await revokeConsentAsDoctor(patient.id);
      setMessage(`Gave up access to ${patient.patientName}'s data.`);
      setPatients((prev) => prev.filter((p) => p.id !== patient.id));
      setPatientToRevoke(null);
    } catch (err) {
      showError(err);
    } finally {
      setRevokingId(null);
    }
  }

  if (checkingSession) {
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }

  if (user === null) {
    return (
      <PageContainer>
        {error && (
          <div className="mb-4">
            <Alert variant="error">{error}</Alert>
          </div>
        )}
        <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
          <Link href="/login" className="font-medium text-cp-primary hover:underline dark:text-cp-primary-dark">
            Log in
          </Link>{" "}
          first.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="Patients" description="Patients who have granted you access to their data." />

      <div className="mb-6 space-y-3">
        {message && <Alert variant="success">{message}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>

      {!canViewPatients ? (
        <EmptyState
          title="Nothing to see here"
          description="Only staff with the patient.view permission can view patients who've shared access."
        />
      ) : (
        <Card
          title="Shared with you"
          description={`${patients.length} patient(s) currently sharing data with you.`}
          icon={Users}
        >
          {patients.length === 0 ? (
            <EmptyState title="No patients have shared access with you yet" />
          ) : (
            <ul className="divide-y divide-cp-border dark:divide-cp-border-dark">
              {patients.map((patient) => (
                <li key={patient.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={patient.patientName} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-cp-text dark:text-cp-text-dark">
                          {patient.patientName}
                        </p>
                        <p className="font-mono text-xs text-cp-text-subtle dark:text-cp-text-subtle-dark">
                          Since {formatDate(patient.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="destructive-subtle"
                      disabled={revokingId === patient.id}
                      onClick={() => {
                        setError("");
                        setMessage("");
                        setPatientToRevoke(patient);
                      }}
                    >
                      {revokingId === patient.id ? "Revoking..." : "Give up access"}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pl-10">
                    {patient.dataCategories.map((category) => (
                      <Badge key={category} tone="neutral">
                        {formatCategoryLabel(category)}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Modal
        open={!!patientToRevoke}
        onClose={() => setPatientToRevoke(null)}
        title="Give up access to this patient?"
      >
        <div className="space-y-3">
          <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
            You&apos;ll immediately lose access to {patientToRevoke?.patientName}&apos;s data. You can&apos;t undo
            this yourself — only {patientToRevoke?.patientName} can grant access again.
          </p>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPatientToRevoke(null)}>
              Keep access
            </Button>
            <Button variant="destructive" disabled={revokingId === patientToRevoke?.id} onClick={handleRevoke}>
              {revokingId === patientToRevoke?.id ? "Revoking..." : "Give up access"}
            </Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
