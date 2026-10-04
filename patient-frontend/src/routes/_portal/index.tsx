import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Wifi, HeartPulse } from "lucide-react";
import { healthQuery } from "@/lib/queries";
import { bloodTypeLabel, formatDemographics, useSession } from "@carepulse/portal";
import { Avatar, Button, Card, LoadingState } from "@carepulse/ui";
import PatientProfileForm from "@/components/profile/PatientProfileForm";

export const Route = createFileRoute("/_portal/")({
  loader: ({ context }) => {
    context.queryClient.prefetchQuery(healthQuery);
  },
  component: Home,
});

function Home() {
  const session = useSession();
  const health = useQuery(healthQuery);
  const user = session.data;
  const backendUp = health.data ?? null;
  const [editingProfile, setEditingProfile] = useState(false);

  return (
    // A deliberately looser, narrower column than PageContainer's shared
    // max-w-3xl — the Patient portal has no sidebar and no dense clinical
    // lists yet, so it reads better centered and airier than Hospital/Owner.
    <div className="mx-auto w-full max-w-[680px] px-4 py-12 sm:px-6">
      {user && (
        <div className="mb-7">
          <h1 className="text-3xl font-semibold tracking-tight text-cp-text dark:text-cp-text-dark">
            Your CarePulse account
          </h1>
          <p className="mt-2.5 text-base leading-relaxed text-cp-text-muted dark:text-cp-text-muted-dark">
            Everything here is yours. Your vitals and sepsis risk are under My Vitals, and you decide which doctors
            can see them under Data Sharing.
          </p>
        </div>
      )}

      {session.isPending ? (
        <LoadingState />
      ) : user ? (
        <div className="space-y-7">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3.5">
                <Avatar name={user.name} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-cp-text dark:text-cp-text-dark">{user.name}</p>
                  <p className="truncate text-sm text-cp-text-muted dark:text-cp-text-muted-dark">{user.email}</p>
                  <p className="mt-0.5 text-sm font-medium text-cp-text dark:text-cp-text-dark">
                    {[
                      formatDemographics(user.dateOfBirth, user.gender),
                      user.bloodType && `Blood type ${bloodTypeLabel(user.bloodType)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
                    {user.guardianPhone ? `Guardian: ${user.guardianPhone}` : "No guardian phone added"}
                  </p>
                </div>
              </div>
              {!editingProfile && (
                <Button variant="secondary" onClick={() => setEditingProfile(true)}>
                  Edit
                </Button>
              )}
            </div>
            {editingProfile && (
              <div className="mt-5 border-t border-cp-border pt-5 dark:border-cp-border-dark">
                <PatientProfileForm
                  user={user}
                  submitLabel="Save"
                  onSaved={() => setEditingProfile(false)}
                  onCancel={() => setEditingProfile(false)}
                />
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cp-icon-soft text-cp-primary dark:bg-cp-icon-soft-dark dark:text-cp-primary-dark">
                  <Wifi className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-cp-text dark:text-cp-text-dark">Connection</p>
                  <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
                    Your account is reaching CarePulse normally.
                  </p>
                </div>
              </div>
              <span
                className={`hidden shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-xs font-semibold sm:inline-flex ${
                  backendUp
                    ? "border-cp-connected-text/20 bg-cp-connected-bg text-cp-connected-text dark:border-cp-connected-text-dark/30 dark:bg-cp-connected-bg-dark dark:text-cp-connected-text-dark"
                    : "border-cp-border bg-cp-workspace text-cp-text-muted dark:border-cp-border-dark dark:bg-cp-workspace-dark dark:text-cp-text-muted-dark"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    backendUp ? "bg-cp-connected-text dark:bg-cp-connected-text-dark" : "bg-cp-text-subtle dark:bg-cp-text-subtle-dark"
                  }`}
                />
                {backendUp === null ? "Checking..." : backendUp ? "Connected" : "Not connected"}
              </span>
            </div>
          </Card>

          <div className="flex items-start gap-3 rounded-xl border border-cp-border bg-cp-quiet-bg p-4 dark:border-cp-border-dark dark:bg-cp-quiet-bg-dark">
            <HeartPulse
              className="mt-0.5 h-4 w-4 shrink-0 text-cp-primary dark:text-cp-primary-dark"
              aria-hidden="true"
              strokeWidth={2}
            />
            <p className="text-sm leading-relaxed text-cp-text-muted dark:text-cp-text-muted-dark">
              Your readings, trend charts and the sepsis early-warning score are on{" "}
              <Link to="/vitals" className="font-medium text-cp-primary hover:underline dark:text-cp-primary-dark">
                My Vitals
              </Link>
              .
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
          <Link to="/login" className="font-medium text-cp-primary hover:underline dark:text-cp-primary-dark">
            Log in
          </Link>{" "}
          or{" "}
          <Link to="/register" className="font-medium text-cp-primary hover:underline dark:text-cp-primary-dark">
            Register
          </Link>
        </p>
      )}
    </div>
  );
}
