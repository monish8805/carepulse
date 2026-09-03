"use client";

import { useEffect, useState } from "react";
import { Search, ClipboardList, Clock, PauseCircle } from "lucide-react";
import type { Hospital, MyAccessRequest } from "@shared/types";
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
} from "@/components/ui";

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
}

// The only screen an unaffiliated/pending/disabled Hospital Portal user sees
// — designed to read as a deliberate onboarding step, not a restricted-access
// wall: a Stepper for progress, the same Card/IconBadge language as the rest
// of the app, no red "you can't be here" styling anywhere.
export default function HospitalAccessGate({ status, myRequests, onChanged, refreshing }: HospitalAccessGateProps) {
  const [allHospitals, setAllHospitals] = useState<Hospital[]>([]);
  const [loadingHospitals, setLoadingHospitals] = useState(true);
  const [search, setSearch] = useState("");
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");

  // Set the instant the request succeeds, so "Permission sent" renders
  // immediately rather than waiting on the background reconciliation below.
  const [optimisticHospitalName, setOptimisticHospitalName] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "none") return;
    let cancelledEffect = false;
    listAllHospitals()
      .then((hospitals) => {
        if (!cancelledEffect) setAllHospitals(hospitals);
      })
      .catch((err) => {
        if (!cancelledEffect) setError(err instanceof Error ? err.message : "Could not load hospitals.");
      })
      .finally(() => {
        if (!cancelledEffect) setLoadingHospitals(false);
      });
    return () => {
      cancelledEffect = true;
    };
  }, [status]);

  // Once the real record catches up (status genuinely becomes "pending"),
  // the optimistic override agrees with it and can be dropped.
  useEffect(() => {
    if (status === "pending") setOptimisticHospitalName(null);
  }, [status]);

  const effectiveStatus = optimisticHospitalName ? "pending" : status;
  const liveEntry = myRequests.find((r) => r.status === status);
  const currentHospitalName = optimisticHospitalName ?? liveEntry?.hospitalName ?? "your hospital";

  async function handleRequest(hospital: Hospital) {
    setError("");
    setRequestingId(hospital.id);
    try {
      await requestHospitalAccess(hospital.id);
      setOptimisticHospitalName(hospital.name);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your request.");
    } finally {
      setRequestingId(null);
    }
  }

  async function handleCancel() {
    if (!liveEntry) return;
    setError("");
    setCancelling(true);
    try {
      await cancelAccessRequest(liveEntry.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel your request.");
    } finally {
      setCancelling(false);
    }
  }

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
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Access paused</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Your access to <span className="font-medium text-slate-700 dark:text-slate-300">{currentHospitalName}</span>{" "}
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
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Permission sent</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Your request has been sent to the hospital administrator. Please wait for approval.
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Hospital: <span className="font-medium text-slate-600 dark:text-slate-300">{currentHospitalName}</span>
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

      {error && (
        <div className="mb-6">
          <Alert variant="error">{error}</Alert>
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

          {loadingHospitals ? (
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
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-800"
                >
                  <p className="min-w-0 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
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
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {myRequests.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {r.hospitalName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Requested {formatDate(r.createdAt)}</p>
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
