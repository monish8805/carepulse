import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { cachedHospitalContext, grantedPatientsQuery, sepsisWatchQuery } from "@/lib/queries";
import { useMe } from "@/lib/session";
import { formatDemographics, prefetch } from "@carepulse/portal";
import {
  Alert,
  Card,
  EmptyState,
  LoadingState,
  PageContainer,
  PageHeader,
  ResearchDisclaimer,
  Select,
  Skeleton,
} from "@carepulse/ui";

// recharts only loads when a patient is opened, like the vitals trends.
const SepsisWatchView = lazy(() => import("@/components/watch/SepsisWatchView"));

// One patient's vitals and sepsis risk on a shared hour axis. Needs vitals.view
// (to read) and patient.view (the picker lists consenting patients); the
// backend additionally requires an active vitals.continuous grant per patient
// and answers 404 without one. The chosen patient lives in the URL (?patient=),
// so a reload, back/forward or a shared link lands on the same stay.
export const Route = createFileRoute("/_portal/sepsis-watch")({
  validateSearch: (search: Record<string, unknown>): { patient?: string } => ({
    patient: typeof search.patient === "string" && search.patient ? search.patient : undefined,
  }),
  loader: ({ context: { queryClient } }) => {
    const hospital = cachedHospitalContext(queryClient);
    if (hospital?.canViewPatients && hospital.canViewVitals) prefetch(queryClient, grantedPatientsQuery);
  },
  component: SepsisWatchPage,
});

function SepsisWatchPage() {
  const { patient: patientId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { isPending, user, error: meError } = useMe();
  const canView = (user?.hospital?.canViewVitals && user.hospital.canViewPatients) ?? false;
  const patientsQuery = useQuery({ ...grantedPatientsQuery, enabled: canView });
  const watchQuery = useQuery({ ...sepsisWatchQuery(patientId ?? ""), enabled: canView && !!patientId });

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

  const patients = (patientsQuery.data ?? []).filter((grant) => grant.dataCategories.includes("vitals.continuous"));

  return (
    <PageContainer>
      <PageHeader
        title="Sepsis Watch"
        description="Vitals over a patient's stay, with the early-warning risk from our research model underneath."
      />
      {!canView ? (
        <EmptyState
          title="Nothing to see here"
          description="Only staff with the vitals.view and patient.view permissions can open Sepsis Watch."
        />
      ) : (
        <div className="space-y-6">
          <ResearchDisclaimer />
          <Card>
            <label htmlFor="watch-patient" className="mb-1.5 block text-sm font-medium text-cp-text dark:text-cp-text-dark">
              Patient
            </label>
            <Select
              id="watch-patient"
              value={patientId ?? ""}
              disabled={patientsQuery.isPending}
              onChange={(event) => navigate({ search: { patient: event.target.value || undefined }, replace: true })}
            >
              <option value="">{patientsQuery.isPending ? "Loading…" : "Choose a patient"}</option>
              {patients.map((grant) => (
                <option key={grant.id} value={grant.patientId}>
                  {grant.patientName}
                  {formatDemographics(grant.patientDateOfBirth, grant.patientGender as never) &&
                    ` — ${formatDemographics(grant.patientDateOfBirth, grant.patientGender as never)}`}
                </option>
              ))}
            </Select>
            {patientsQuery.isError && (
              <div className="mt-3">
                <Alert variant="error">{patientsQuery.error.message}</Alert>
              </div>
            )}
            {patientsQuery.isSuccess && patients.length === 0 && (
              <p className="mt-3 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
                No patient has shared continuous vitals with you yet.
              </p>
            )}
          </Card>

          {patientId &&
            (watchQuery.isError ? (
              <Alert variant="error">{watchQuery.error.message}</Alert>
            ) : watchQuery.data ? (
              <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                <SepsisWatchView watch={watchQuery.data} />
              </Suspense>
            ) : (
              <Skeleton className="h-96 w-full" />
            ))}
        </div>
      )}
    </PageContainer>
  );
}
