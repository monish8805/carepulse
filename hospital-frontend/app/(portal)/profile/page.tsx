"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import type { SessionUser } from "@shared/types";
import { restoreSession, getMe, updateProfile } from "@/lib/api";
import { Alert, Button, Card, LoadingState, PageContainer, PageHeader, TextField } from "@/components/ui";

// A single self-service field for now: specialization (e.g. "Gynaecologist",
// "Neurologist", "RMP") — free text, never a fixed clinical-title enum (see
// CLAUDE.md), shown to a patient looking this doctor up before granting data
// access (patient-frontend's /sharing page). Finally wires up the AccountMenu's
// "Profile" item, which has sat disabled with a "Coming soon" hint until now.
export default function ProfilePage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [specialization, setSpecialization] = useState("");
  const [saving, setSaving] = useState(false);
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
      const me = await getMe();
      setUser(me);
      setSpecialization(me.specialization ?? "");
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const result = await updateProfile({ specialization });
      setMessage("Profile updated.");
      setUser((prev) => (prev ? { ...prev, specialization: result.user.specialization } : prev));
    } catch (err) {
      showError(err);
    } finally {
      setSaving(false);
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
      <PageHeader title="Profile" description="How patients see you when they look you up to share their data." />

      <div className="mb-6 space-y-3">
        {message && <Alert variant="success">{message}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>

      <Card title={user.name} description={user.email} icon={UserRound}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            label="Specialization"
            placeholder="e.g. Gynaecologist, Neurologist, RMP"
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
            hint="Free text — shown to patients alongside your name and current hospital."
          />
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </form>
      </Card>
    </PageContainer>
  );
}
