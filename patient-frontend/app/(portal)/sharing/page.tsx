"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, ClipboardList } from "lucide-react";
import { DATA_CATEGORIES } from "@shared/types";
import type { SessionUser, DoctorLookupResult, PatientConsent } from "@shared/types";
import {
  restoreSession,
  getMe,
  lookupDoctor,
  grantConsent,
  listMyConsents,
  updateConsent,
  revokeConsentAsPatient,
} from "@/lib/api";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Label,
  LoadingState,
  Modal,
  PageContainer,
  PageHeader,
  toneForStatus,
} from "@/components/ui";

// "vitals.continuous" -> "Vitals — Continuous", matching the category
// catalogue in backend/config/dataCategories.ts to a readable label — same
// pattern hospital-frontend's ManageRolesPanel uses for permission strings.
function formatCategoryLabel(category: string): string {
  return category
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" — ");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// The patient's data-sharing consent gateway: look up a doctor by email,
// choose which data categories to share, and grant access — then manage
// (edit categories, or revoke) everything already shared. Editing is
// deliberately only ever available here, on the patient's own side; a doctor
// can view or revoke their own access but never change what's shared with
// them (see backend's domain/patientConsent.service.ts).
export default function SharingPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  // Distinct from `user === null` (confirmed logged out) — avoids a flash of
  // "Log in first" before the session-restore sequence has finished.
  const [checkingSession, setCheckingSession] = useState(true);
  const [grants, setGrants] = useState<PatientConsent[]>([]);

  const [email, setEmail] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  // The doctor a lookup actually confirmed, bundled with the exact email that
  // produced them so the two can never diverge. Submitting the live `email`
  // input instead would grant to whatever had been typed since the lookup
  // while still reporting the looked-up doctor's name back — i.e. sharing
  // health data with the wrong person and telling the patient otherwise.
  const [confirmed, setConfirmed] = useState<{ doctor: DoctorLookupResult; email: string } | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [granting, setGranting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategories, setEditCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  // Revoking is one-way — there is no un-revoke, the patient has to look the
  // doctor up and grant again from scratch — so it gets the same confirmation
  // step every other irreversible action in the app has.
  const [grantToRevoke, setGrantToRevoke] = useState<PatientConsent | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
      setUser(await getMe());
      setGrants(await listMyConsents());
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

  async function refetchGrants() {
    setGrants(await listMyConsents());
  }

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setConfirmed(null);
    setLookingUp(true);
    try {
      // Capture the email this lookup was performed with, not whatever the
      // input holds by the time "Grant access" is clicked.
      const lookedUpEmail = email;
      const doctor = await lookupDoctor(lookedUpEmail);
      setConfirmed({ doctor, email: lookedUpEmail });
      setSelectedCategories([]);
    } catch (err) {
      showError(err);
    } finally {
      setLookingUp(false);
    }
  }

  function toggleSelectedCategory(category: string) {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }

  async function handleGrant() {
    if (!confirmed || selectedCategories.length === 0) return;
    setError("");
    setGranting(true);
    try {
      await grantConsent({ doctorEmail: confirmed.email, dataCategories: selectedCategories });
      setMessage(`Access granted to ${confirmed.doctor.name}.`);
      setEmail("");
      setConfirmed(null);
      setSelectedCategories([]);
      await refetchGrants();
    } catch (err) {
      showError(err);
    } finally {
      setGranting(false);
    }
  }

  function startEdit(grant: PatientConsent) {
    setError("");
    setMessage("");
    setEditingId(grant.id);
    setEditCategories(grant.dataCategories);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function toggleEditCategory(category: string) {
    setEditCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }

  async function handleSaveEdit(grantId: string) {
    if (editCategories.length === 0) return;
    setError("");
    setSaving(true);
    try {
      await updateConsent(grantId, editCategories);
      setMessage("Sharing preferences updated.");
      setEditingId(null);
      await refetchGrants();
    } catch (err) {
      showError(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke() {
    const grant = grantToRevoke;
    if (!grant) return;
    setError("");
    setMessage("");
    setRevokingId(grant.id);
    try {
      await revokeConsentAsPatient(grant.id);
      setMessage(`Revoked ${grant.doctorName}'s access.`);
      setGrantToRevoke(null);
      await refetchGrants();
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
      <PageHeader
        title="Data Sharing"
        description="Choose which doctors can see your health data, and exactly what you share with each one."
      />

      <div className="mb-6 space-y-3">
        {message && <Alert variant="success">{message}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>

      <div className="space-y-8">
        <Card title="Grant access to a doctor" description="Look up a doctor by their email address." icon={Search}>
          <form onSubmit={handleLookup} className="mb-4 flex flex-wrap items-end gap-2">
            <div className="min-w-[16rem] flex-1">
              <Label htmlFor="doctor-email">Doctor&apos;s email</Label>
              <Input
                id="doctor-email"
                type="email"
                placeholder="doctor@hospital.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  // A confirmation card must never outlive the lookup that
                  // produced it — editing the address means you have to look
                  // the doctor up again before you can share anything.
                  setConfirmed(null);
                }}
                autoComplete="off"
                required
              />
            </div>
            <Button type="submit" variant="secondary" disabled={lookingUp}>
              {lookingUp ? "Looking up..." : "Look up"}
            </Button>
          </form>

          {confirmed && (
            <div className="rounded-lg border border-cp-border p-4 dark:border-cp-border-dark">
              <div className="flex items-center gap-3">
                <Avatar name={confirmed.doctor.name} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-cp-text dark:text-cp-text-dark">
                    {confirmed.doctor.name}
                  </p>
                  <p className="truncate text-xs text-cp-text-muted dark:text-cp-text-muted-dark">
                    {confirmed.doctor.specialization ?? "No specialization listed"} ·{" "}
                    {confirmed.doctor.hospitalName}
                  </p>
                  <p className="truncate font-mono text-xs text-cp-text-subtle dark:text-cp-text-subtle-dark">
                    {confirmed.email}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <Label>What do you want to share?</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {DATA_CATEGORIES.map((category) => (
                    <Checkbox
                      key={category}
                      label={formatCategoryLabel(category)}
                      checked={selectedCategories.includes(category)}
                      onChange={() => toggleSelectedCategory(category)}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <Button disabled={selectedCategories.length === 0 || granting} onClick={handleGrant}>
                  {granting ? "Granting..." : "Grant access"}
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card title="My shared access" description="Every doctor you've shared data with, past and present." icon={ClipboardList}>
          {grants.length === 0 ? (
            <EmptyState title="You haven't shared access with anyone yet" />
          ) : (
            <ul className="divide-y divide-cp-border dark:divide-cp-border-dark">
              {grants.map((grant) => {
                const isEditing = editingId === grant.id;
                const isActive = grant.status === "active";
                return (
                  <li key={grant.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={grant.doctorName} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-cp-text dark:text-cp-text-dark">
                              {grant.doctorName}
                            </p>
                            <Badge tone={toneForStatus(grant.status)}>{grant.status}</Badge>
                          </div>
                          <p className="truncate text-xs text-cp-text-muted dark:text-cp-text-muted-dark">
                            {grant.doctorSpecialization ?? "No specialization listed"}
                            {grant.hospitalName ? ` · ${grant.hospitalName}` : ""}
                          </p>
                          <p className="font-mono text-xs text-cp-text-subtle dark:text-cp-text-subtle-dark">
                            Since {formatDate(grant.createdAt)}
                          </p>
                        </div>
                      </div>

                      {isActive && !isEditing && (
                        <div className="flex shrink-0 gap-2">
                          <Button variant="secondary" onClick={() => startEdit(grant)}>
                            Edit
                          </Button>
                          <Button
                            variant="destructive-subtle"
                            disabled={revokingId === grant.id}
                            onClick={() => {
                              setError("");
                              setMessage("");
                              setGrantToRevoke(grant);
                            }}
                          >
                            {revokingId === grant.id ? "Revoking..." : "Revoke"}
                          </Button>
                        </div>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex flex-wrap gap-1.5 pl-10">
                        {grant.dataCategories.map((category) => (
                          <Badge key={category} tone="neutral">
                            {formatCategoryLabel(category)}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {isEditing && (
                      <div className="pl-10">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {DATA_CATEGORIES.map((category) => (
                            <Checkbox
                              key={category}
                              label={formatCategoryLabel(category)}
                              checked={editCategories.includes(category)}
                              onChange={() => toggleEditCategory(category)}
                            />
                          ))}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button
                            disabled={editCategories.length === 0 || saving}
                            onClick={() => handleSaveEdit(grant.id)}
                          >
                            {saving ? "Saving..." : "Save"}
                          </Button>
                          <Button variant="ghost" onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={!!grantToRevoke} onClose={() => setGrantToRevoke(null)} title="Stop sharing your data?">
        <div className="space-y-3">
          <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
            {grantToRevoke?.doctorName} will immediately lose access to your data. This can&apos;t be undone — you&apos;d
            have to look them up and grant access again from scratch.
          </p>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setGrantToRevoke(null)}>
              Keep sharing
            </Button>
            <Button
              variant="destructive"
              disabled={revokingId === grantToRevoke?.id}
              onClick={handleRevoke}
            >
              {revokingId === grantToRevoke?.id ? "Revoking..." : "Revoke access"}
            </Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
