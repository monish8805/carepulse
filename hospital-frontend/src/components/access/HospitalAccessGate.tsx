import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, ClipboardList, Clock, PauseCircle } from "lucide-react";
import type { Hospital, MyAccessRequest } from "@carepulse/api/types";
import { listAllHospitals, requestHospitalAccess, cancelAccessRequest } from "@/lib/api";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  IconBadge,
  Input,
  Label,
  LoadingState,
  PageContainer,
  PageHeader,
  Stepper,
  toneForStatus,
} from "@carepulse/ui";

// Mirrors the backend's actual rule (domain/accessRequest.service.ts::
// requestAccess): pending/active/rejected block a new request; removed and
// cancelled don't — the backend reuses that document and revives it to pending.
const BLOCKED_STATUSES = new Set(["pending", "active", "rejected"]);

const STEP_LABELS = ["Request access", "Awaiting approval", "Portal access"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export interface HospitalAccessGateProps {
  status: "none" | "pending" | "disabled";
  myRequests: MyAccessRequest[];
  // Tells the owning layout to re-resolve access state from the backend
  // (e.g. after a cancel, or the user asking to "check again"). The layout
  // re-fetches in the background and only swaps this component out once it
  // has a fresh answer — never a locally-guessed one.
  onChanged: () => void;
  // True while that background re-resolution is in flight — used to disable
  // actions rather than to unmount/replace this screen, so re-checking never
  // causes a jarring full-page flash.
  refreshing: boolean;
  // When the layout last received an answer from the backend (the access
  // query's dataUpdatedAt) — goes up on every re-resolution, even one that
  // returns identical data.
  resolvedAt: number;
}

// The only screen an unaffiliated/pending/disabled Hospital Portal user sees
// — designed to read as a deliberate onboarding step, not a restricted-access
// wall: a Stepper for progress, the same Card/IconBadge language as the rest
// of the app, no red "you can't be here" styling anywhere.
export default function HospitalAccessGate({
  status,
  myRequests,
  onChanged,
  refreshing,
  resolvedAt,
}: HospitalAccessGateProps) {
  const hospitalsQuery = useQuery({
    queryKey: ["requestableHospitals"],
    queryFn: listAllHospitals,
    enabled: status === "none",
  });
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  // Set the instant the request succeeds, so "Permission sent" renders
  // immediately rather than waiting on the background reconciliation. It is
  // stamped with the resolution it was made on top of, and stops applying as
  // soon as ANY newer resolution arrives — not only one that says "pending".
  // Clearing it only on "pending" meant that if the request didn't actually
  // persist and the backend re-resolved to "none", the user stayed pinned on
  // "Permission sent" forever: "Check again" could never flip the screen back,
  // and "Cancel request" stayed disabled because no matching live entry existed.
  const [optimistic, setOptimistic] = useState<{ hospitalName: string; resolvedAt: number } | null>(null);
  const optimisticHospitalName =
    optimistic && optimistic.resolvedAt === resolvedAt ? optimistic.hospitalName : null;

  const effectiveStatus = optimisticHospitalName ? "pending" : status;
  const liveEntry = myRequests.find((r) => r.status === status);
  const currentHospitalName = optimisticHospitalName ?? liveEntry?.hospitalName ?? "your hospital";

  const requestMutation = useMutation({
    mutationFn: (hospital: Hospital) => requestHospitalAccess(hospital.id),
    onSuccess: (_, hospital) => {
      setOptimistic({ hospitalName: hospital.name, resolvedAt });
      onChanged();
    },
    onError: (err) => setError(err.message || "Could not submit your request."),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelAccessRequest,
    onSuccess: onChanged,
    onError: (err) => setError(err.message || "Could not cancel your request."),
  });

  function handleRequest(hospital: Hospital) {
    setError("");
    requestMutation.mutate(hospital);
  }

  function handleCancel() {
    if (!liveEntry) return;
    setError("");
    cancelMutation.mutate(liveEntry.id);
  }

  const allHospitals = hospitalsQuery.data ?? [];
  const requestingId = requestMutation.isPending ? requestMutation.variables.id : null;
  const cancelling = cancelMutation.isPending;
  const noneViewError = error || (hospitalsQuery.isError ? hospitalsQuery.error.message || "Could not load hospitals." : "");

  const requestedHospitalIds = new Set(
    myRequests.filter((r) => BLOCKED_STATUSES.has(r.status)).map((r) => r.hospitalId)
  );
  const availableHospitals = allHospitals.filter((h) => !requestedHospitalIds.has(h.id));
  const filteredHospitals = availableHospitals.filter((h) => h.name.toLowerCase().includes(search.toLowerCase()));

  if (effectiveStatus === "disabled") {
    return (
      <PageContainer>
        <div className="flex justify-center py-6">
          <Card className="w-full max-w-md text-center">
            <div className="flex flex-col items-center gap-3">
              <IconBadge icon={PauseCircle} tone="amber" />
              <h1 className="text-xl font-semibold text-cp-text dark:text-cp-text-dark">Access paused</h1>
              <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
                Your access to <span className="font-medium text-cp-text dark:text-cp-text-dark">{currentHospitalName}</span>{" "}
                has been temporarily paused by an administrator. Contact them to have it restored.
              </p>
              {error && (
                <div className="w-full">
                  <Alert variant="error">{error}</Alert>
                </div>
              )}
              <Button variant="secondary" disabled={refreshing} onClick={onChanged}>
                {refreshing ? "Checking..." : "Check again"}
              </Button>
            </div>
          </Card>
        </div>
      </PageContainer>
    );
  }

  if (effectiveStatus === "pending") {
    return (
      <PageContainer>
        <div className="mb-8">
          <Stepper labels={STEP_LABELS} currentIndex={1} />
        </div>
        <div className="flex justify-center py-6">
          <Card className="w-full max-w-md text-center">
            <div className="flex flex-col items-center gap-3">
              <IconBadge icon={Clock} />
              <h1 className="text-xl font-semibold text-cp-text dark:text-cp-text-dark">Permission sent</h1>
              <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
                Your request has been sent to the hospital administrator. Please wait for approval.
              </p>
              <p className="text-xs text-cp-text-subtle dark:text-cp-text-subtle-dark">
                Hospital: <span className="font-medium text-cp-text-muted dark:text-cp-text-muted-dark">{currentHospitalName}</span>
              </p>
              {error && (
                <div className="w-full">
                  <Alert variant="error">{error}</Alert>
                </div>
              )}
              <div className="mt-1 flex items-center gap-3">
                <Button disabled={refreshing} onClick={onChanged}>
                  {refreshing ? "Checking..." : "Check again"}
                </Button>
                <Button
                  variant="ghost"
                  disabled={!liveEntry || cancelling}
                  onClick={handleCancel}
                  title={!liveEntry ? "Syncing your request..." : undefined}
                >
                  {cancelling ? "Cancelling..." : "Cancel request"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </PageContainer>
    );
  }

  // effectiveStatus === "none"
  return (
    <PageContainer>
      <div className="mb-8">
        <Stepper labels={STEP_LABELS} currentIndex={0} />
      </div>
      <PageHeader
        title="Let's get you set up"
        description="Choose the hospital you work with to request access to the Hospital Portal."
      />

      {noneViewError && (
        <div className="mb-6">
          <Alert variant="error">{noneViewError}</Alert>
        </div>
      )}

      <div className="space-y-8">
        <Card
          title="Find your hospital"
          description={`${availableHospitals.length} hospital(s) available to join.`}
          icon={Search}
        >
          <div className="mb-4">
            <Label htmlFor="hospital-search">Search hospitals</Label>
            <Input
              id="hospital-search"
              placeholder="Search hospitals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
          </div>

          {hospitalsQuery.isPending ? (
            <LoadingState />
          ) : allHospitals.length === 0 ? (
            <EmptyState
              title="No hospitals yet"
              description="Check back once hospitals have been added to CarePulse."
            />
          ) : filteredHospitals.length === 0 ? (
            <EmptyState
              title={
                availableHospitals.length === 0
                  ? "You've already requested every hospital"
                  : "No matching hospitals"
              }
            />
          ) : (
            <ul className="space-y-2">
              {filteredHospitals.map((hospital) => (
                <li
                  key={hospital.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-cp-border px-3 py-2.5 dark:border-cp-border-dark"
                >
                  <p className="min-w-0 truncate text-sm font-medium text-cp-text dark:text-cp-text-dark">
                    {hospital.name}
                  </p>
                  <Button
                    variant="secondary"
                    disabled={requestingId === hospital.id}
                    onClick={() => handleRequest(hospital)}
                  >
                    {requestingId === hospital.id ? "Requesting..." : "Request access"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {myRequests.length > 0 && (
          <Card title="Your request history" description="Past requests, for reference." icon={ClipboardList}>
            <ul className="divide-y divide-cp-border dark:divide-cp-border-dark">
              {myRequests.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-cp-text dark:text-cp-text-dark">
                      {r.hospitalName}
                    </p>
                    <p className="font-mono text-xs text-cp-text-muted dark:text-cp-text-muted-dark">
                      Requested {formatDate(r.createdAt)}
                    </p>
                  </div>
                  <Badge tone={toneForStatus(r.status)}>{r.status}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
