"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, ClipboardList } from "lucide-react";
import type { SessionUser, Hospital, MyAccessRequest } from "@shared/types";
import {
  restoreSession,
  getMe,
  listAllHospitals,
  listMyAccessRequests,
  requestHospitalAccess,
  cancelAccessRequest,
} from "@/lib/api";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  LoadingState,
  PageContainer,
  PageHeader,
  toneForStatus,
} from "@/components/ui";

// Mirrors the backend's actual rule (domain/accessRequest.service.ts::
// requestAccess): pending/active/rejected block a new request; removed and
// cancelled don't — the backend reuses that document and revives it to pending.
const BLOCKED_STATUSES = new Set(["pending", "active", "rejected"]);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// The dedicated home for requesting hospital access — reachable from the
// account menu (see HospitalLayout.tsx), not the Sidebar. This is a personal/
// account action, not hospital-application navigation — see the account-nav
// vs. hospital-nav split in DESIGN.md.
export default function AccessRequestPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  // Distinct from `user === null` (confirmed logged out) — avoids a flash of
  // "Log in first" before the session-restore sequence has finished.
  const [checkingSession, setCheckingSession] = useState(true);
  const [allHospitals, setAllHospitals] = useState<Hospital[]>([]);
  const [myRequests, setMyRequests] = useState<MyAccessRequest[]>([]);
  const [search, setSearch] = useState("");
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
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
      const [hospitals, requests] = await Promise.all([listAllHospitals(), listMyAccessRequests()]);
      setAllHospitals(hospitals);
      setMyRequests(requests);
    } catch (err) {
      // A logged-in session may exist (restoreSession succeeded) but a later
      // call failed — show that clearly rather than silently looking logged
      // out with no explanation.
      showError(err);
    } finally {
      setCheckingSession(false);
    }
  }

  function showError(err: unknown) {
    setMessage("");
    setError(err instanceof Error ? err.message : "Something went wrong.");
  }

  const requestedHospitalIds = new Set(
    myRequests.filter((r) => BLOCKED_STATUSES.has(r.status)).map((r) => r.hospitalId)
  );
  const availableHospitals = allHospitals.filter((h) => !requestedHospitalIds.has(h.id));
  const filteredHospitals = availableHospitals.filter((h) =>
    h.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleRequest(hospital: Hospital) {
    setError("");
    setMessage("");
    setRequestingId(hospital.id);
    try {
      await requestHospitalAccess(hospital.id);
      setMessage(`Requested access to ${hospital.name}.`);
      setMyRequests(await listMyAccessRequests());
    } catch (err) {
      showError(err);
    } finally {
      setRequestingId(null);
    }
  }

  async function handleCancel(requestId: string, hospitalName: string) {
    setError("");
    setMessage("");
    setCancellingId(requestId);
    try {
      await cancelAccessRequest(requestId);
      setMessage(`Cancelled your request to ${hospitalName}.`);
      setMyRequests(await listMyAccessRequests());
    } catch (err) {
      showError(err);
    } finally {
      setCancellingId(null);
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
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <Link href="/login" className="font-medium text-teal-700 hover:underline dark:text-teal-400">
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
        title="Request hospital access"
        description="Find hospitals and request access to join their team."
      />

      <div className="mb-6 space-y-3">
        {message && <Alert variant="success">{message}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>

      <div className="space-y-8">
        <Card
          title="Find hospitals"
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

          {allHospitals.length === 0 ? (
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
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {hospital.name}
                    </p>
                    <p className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                      {hospital.id}
                    </p>
                  </div>
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

        <Card
          title="My requests"
          description="Hospitals you've requested access to, and their status."
          icon={ClipboardList}
        >
          {myRequests.length === 0 ? (
            <EmptyState title="No requests yet" />
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {myRequests.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {r.hospitalName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {r.role} · Requested {formatDate(r.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={toneForStatus(r.status)}>{r.status}</Badge>
                    {r.status === "pending" && (
                      <Button
                        variant="destructive"
                        disabled={cancellingId === r.id}
                        onClick={() => handleCancel(r.id, r.hospitalName)}
                      >
                        {cancellingId === r.id ? "Cancelling..." : "Cancel"}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
