import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSession, prefetch, VitalsHistory } from "@carepulse/portal";
import { myVitalsQuery } from "@/lib/queries";
import { Alert, LoadingState, PageContainer, PageHeader, ResearchDisclaimer, SkeletonList, Card } from "@carepulse/ui";

// The patient's own readings and the sepsis risk scored from them. Read-only:
// readings arrive through POST /api/patient/vitals (for now from the backend's
// replay script). Doctors only see this if the patient shares
// "Vitals — Continuous" with them on /sharing.
export const Route = createFileRoute("/_portal/vitals")({
  loader: ({ context }) => prefetch(context.queryClient, myVitalsQuery),
  component: VitalsPage,
});

function VitalsPage() {
  const session = useSession();
  const vitalsQuery = useQuery({ ...myVitalsQuery, enabled: !!session.data });

  if (session.isPending) {
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }

  if (!session.data) {
    return (
      <PageContainer>
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
      <PageHeader title="My Vitals" description="Your recorded vitals and the sepsis early-warning score for each." />

      <div className="mb-6 space-y-3">
        <ResearchDisclaimer />
        {vitalsQuery.isError && <Alert variant="error">{vitalsQuery.error.message}</Alert>}
      </div>

      {vitalsQuery.isPending ? (
        <Card>
          <SkeletonList />
        </Card>
      ) : vitalsQuery.data ? (
        <VitalsHistory history={vitalsQuery.data} />
      ) : null}
    </PageContainer>
  );
}
