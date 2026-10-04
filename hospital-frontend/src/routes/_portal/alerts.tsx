import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import type { ScoreSummary } from "@carepulse/api/types";
import { acknowledgeAlert } from "@/lib/api";
import { useMe } from "@/lib/session";
import { alertsQuery, cachedHospitalContext } from "@/lib/queries";
import { formatDemographics, prefetch } from "@carepulse/portal";
import {
  Alert,
  Avatar,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageContainer,
  PageHeader,
  ResearchDisclaimer,
  RiskBadge,
  SkeletonList,
  useToast,
} from "@carepulse/ui";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// One labelled score, timed by the reading it is "as of" — not by when the
// score or alert was written, which a batch of readings compresses together.
function ScoreLine({ label, score }: { label: string; score: ScoreSummary | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-24 shrink-0 text-cp-text-muted dark:text-cp-text-muted-dark">{label}</span>
      <RiskBadge status={score?.status ?? "unavailable"} riskLevel={score?.riskLevel ?? null} />
      <span className="text-cp-text dark:text-cp-text-dark">
        {score?.status === "scored" && score.sepsisProbability !== null
          ? `${(score.sepsisProbability * 100).toFixed(1)}%`
          : "risk unknown"}
      </span>
      {score?.recordedAt && (
        <span className="font-mono text-xs text-cp-text-subtle dark:text-cp-text-subtle-dark">
          reading of {formatDateTime(score.recordedAt)}
        </span>
      )}
    </div>
  );
}

// Active sepsis alerts (raised on a HIGH score) for patients who share
// continuous vitals with this doctor. Gated by alerts.view (canViewAlerts);
// acknowledging needs alerts.acknowledge. HospitalLayout hides the nav link
// without alerts.view, but the EmptyState below is the page's own gate for a
// direct URL visit — the backend checks both permission and consent regardless.
export const Route = createFileRoute("/_portal/alerts")({
  loader: ({ context: { queryClient } }) => {
    if (cachedHospitalContext(queryClient)?.canViewAlerts) prefetch(queryClient, alertsQuery);
  },
  component: AlertsPage,
});

function AlertsPage() {
  const queryClient = useQueryClient();
  const { isPending, user, error: meError } = useMe();
  const canViewAlerts = user?.hospital?.canViewAlerts ?? false;
  const canAcknowledge = user?.hospital?.canAcknowledgeAlerts ?? false;
  const canViewVitals = user?.hospital?.canViewVitals ?? false;
  const listQuery = useQuery({ ...alertsQuery, enabled: canViewAlerts });
  const toast = useToast();

  // Not optimistic: acknowledging is one-way, so the row only goes once the
  // server has confirmed it.
  const acknowledgeMutation = useMutation({
    mutationFn: (alertId: string) => acknowledgeAlert(alertId),
    onSuccess: () => toast.success("Alert acknowledged."),
    onError: (err) => toast.error(err.message || "Could not acknowledge the alert."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: alertsQuery.queryKey }),
  });

  const alerts = listQuery.data ?? [];
  const loadError = meError?.message || (listQuery.isError ? listQuery.error.message : "");

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
        {loadError && (
          <div className="mb-4">
            <Alert variant="error">{loadError}</Alert>
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
      <PageHeader title="Alerts" description="Sepsis early-warning alerts for patients who share their vitals with you." />

      <div className="mb-6 space-y-3">
        {loadError && <Alert variant="error">{loadError}</Alert>}
        {canViewAlerts && <ResearchDisclaimer />}
      </div>

      {!canViewAlerts ? (
        <EmptyState
          title="Nothing to see here"
          description="Only staff with the alerts.view permission can see sepsis alerts."
        />
      ) : (
        <Card
          title="Active alerts"
          description="Raised when a patient's sepsis risk reaches HIGH. One per patient until acknowledged."
          icon={Bell}
          iconTone="amber"
        >
          {listQuery.isPending ? (
            <SkeletonList />
          ) : alerts.length === 0 ? (
            <EmptyState title="No active alerts" />
          ) : (
            <ul className="divide-y divide-cp-border dark:divide-cp-border-dark">
              {alerts.map((alert) => {
                const acknowledging = acknowledgeMutation.isPending && acknowledgeMutation.variables === alert.id;
                return (
                  <li key={alert.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={alert.patientName} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-cp-text dark:text-cp-text-dark">
                            {alert.patientName}
                          </p>
                          {formatDemographics(alert.patientDateOfBirth, alert.patientGender) && (
                            <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
                              {formatDemographics(alert.patientDateOfBirth, alert.patientGender)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {canViewVitals && (
                          <Link
                            to="/patients/$patientId"
                            params={{ patientId: alert.patientId }}
                            className="text-sm font-medium text-cp-primary hover:underline dark:text-cp-primary-dark"
                          >
                            View vitals
                          </Link>
                        )}
                        {canAcknowledge && (
                          <Button
                            variant="secondary"
                            disabled={acknowledging}
                            onClick={() => acknowledgeMutation.mutate(alert.id)}
                          >
                            {acknowledging ? "Acknowledging..." : "Acknowledge"}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5 pl-10">
                      <ScoreLine label="Triggered by" score={alert.trigger} />
                      <ScoreLine label="Current" score={alert.current} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </PageContainer>
  );
}
