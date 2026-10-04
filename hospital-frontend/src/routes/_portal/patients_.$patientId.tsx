import { useQuery } from "@tanstack/react-query";
import type { PatientVitals } from "@carepulse/api/types";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMe } from "@/lib/session";
import { cachedHospitalContext, patientVitalsQuery } from "@/lib/queries";
import { ageInYears, bloodTypeLabel, ChestXrayUpload, genderLabel, prefetch, VitalsHistory } from "@carepulse/portal";
import { UserRound } from "lucide-react";
import {
  Alert,
  Card,
  EmptyState,
  LoadingState,
  PageContainer,
  PageHeader,
  ResearchDisclaimer,
  SkeletonList,
} from "@carepulse/ui";

// One patient's vitals and sepsis risk. "patients_" (trailing underscore)
// keeps this out of /patients' layout, so the list page doesn't need an
// <Outlet />. Gated by vitals.view (canViewVitals); the backend additionally
// requires an active "Vitals — Continuous" grant from this patient and answers
// 404 without one — the same answer as for an id that doesn't exist.
export const Route = createFileRoute("/_portal/patients_/$patientId")({
  loader: ({ context: { queryClient }, params }) => {
    if (cachedHospitalContext(queryClient)?.canViewVitals) prefetch(queryClient, patientVitalsQuery(params.patientId));
  },
  component: PatientVitalsPage,
});

function PatientVitalsPage() {
  const { patientId } = Route.useParams();
  const { isPending, user, error: meError } = useMe();
  const canViewVitals = user?.hospital?.canViewVitals ?? false;
  const vitalsQuery = useQuery({ ...patientVitalsQuery(patientId), enabled: canViewVitals });

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
      <div className="mb-4">
        <Link to="/patients" className="text-sm font-medium text-cp-primary hover:underline dark:text-cp-primary-dark">
          ← Back to patients
        </Link>
      </div>
      <PageHeader
        title={vitalsQuery.data?.patient.name ?? "Patient vitals"}
        description="Recorded vitals and the sepsis early-warning score for each."
      />

      {!canViewVitals ? (
        <EmptyState
          title="Nothing to see here"
          description="Only staff with the vitals.view permission can view patient vitals."
        />
      ) : (
        <>
          <div className="mb-6 space-y-3">
            <ResearchDisclaimer />
            {vitalsQuery.isError && <Alert variant="error">{vitalsQuery.error.message}</Alert>}
          </div>
          {vitalsQuery.isPending ? (
            <Card>
              <SkeletonList />
            </Card>
          ) : vitalsQuery.data ? (
            <div className="space-y-6">
              <PatientInformation patient={vitalsQuery.data.patient} />
              <VitalsHistory history={vitalsQuery.data} />
              <ChestXrayUpload />
            </div>
          ) : null}
        </>
      )}
    </PageContainer>
  );
}

function PatientInformation({ patient }: { patient: PatientVitals["patient"] }) {
  const fields = [
    { label: "Name", value: patient.name },
    { label: "Age", value: patient.dateOfBirth ? `${ageInYears(patient.dateOfBirth)} years` : "Not provided" },
    { label: "Gender", value: patient.gender ? genderLabel(patient.gender) : "Not provided" },
    { label: "Blood type", value: patient.bloodType ? bloodTypeLabel(patient.bloodType) : "Not provided" },
    { label: "Guardian phone", value: patient.guardianPhone ?? "Not provided" },
  ];
  return (
    <Card title="Patient information" icon={UserRound}>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {fields.map((field) => (
          <div key={field.label}>
            <dt className="font-mono text-xs font-semibold tracking-wide text-cp-text-muted uppercase dark:text-cp-text-muted-dark">
              {field.label}
            </dt>
            <dd className="mt-1 text-base font-semibold text-cp-text dark:text-cp-text-dark">{field.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
