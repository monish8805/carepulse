import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import type { SessionUser } from "@carepulse/api/types";
import { updateProfile } from "@/lib/api";
import { useMe } from "@/lib/session";
import { Alert, Button, Card, LoadingState, PageContainer, PageHeader, TextField, useToast } from "@carepulse/ui";

// A single self-service field for now: specialization (e.g. "Gynaecologist",
// "Neurologist", "RMP") — free text, never a fixed clinical-title enum (see
// CLAUDE.md), shown to a patient looking this doctor up before granting data
// access (patient-frontend's /sharing page). Finally wires up the AccountMenu's
// "Profile" item, which has sat disabled with a "Coming soon" hint until now.
export const Route = createFileRoute("/_portal/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const queryClient = useQueryClient();
  const { isPending, user, error: meError } = useMe();
  // null = untouched, so the field shows the saved value until the user types.
  const [draft, setDraft] = useState<string | null>(null);
  const toast = useToast();
  const [error, setError] = useState("");
  const specialization = draft ?? user?.specialization ?? "";

  const saveMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (result) => {
      toast.success("Profile updated.");
      queryClient.setQueryData<SessionUser>(["me"], (prev) =>
        prev ? { ...prev, specialization: result.user.specialization } : prev
      );
    },
    onError: (err) => setError(err.message || "Something went wrong."),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    saveMutation.mutate({ specialization });
  }

  if (isPending) {
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }

  if (user === null) {
    return (
      <PageContainer>
        {meError && (
          <div className="mb-4">
            <Alert variant="error">{meError.message}</Alert>
          </div>
        )}
        <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
          <Link to="/login" className="font-medium text-cp-primary hover:underline dark:text-cp-primary-dark">
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

      {error && (
        <div className="mb-6">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      <Card title={user.name} description={user.email} icon={UserRound}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            label="Specialization"
            placeholder="e.g. Gynaecologist, Neurologist, RMP"
            value={specialization}
            onChange={(e) => setDraft(e.target.value)}
            hint="Free text — shown to patients alongside your name and current hospital."
          />
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </form>
      </Card>
    </PageContainer>
  );
}
