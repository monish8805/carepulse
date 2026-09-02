"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PERMISSIONS } from "@shared/types";
import type { SessionUser, AccessRole, AccessRequest, MyAccessRequest, Hospital } from "@shared/types";
import {
  restoreSession,
  getMe,
  listAllHospitals,
  listAccessRoles,
  createAccessRole,
  requestHospitalAccess,
  listMyAccessRequests,
  listPendingAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
} from "@/lib/api";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Label,
  LoadingState,
  PageContainer,
  PageHeader,
  Select,
  TextField,
  toneForStatus,
} from "@/components/ui";

// "patient.view" -> "Patient — View", matching the permission catalogue in
// backend/config/permissions.ts (area.action strings) to a readable label.
function formatPermissionLabel(permission: string): string {
  return permission
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" — ");
}

// Covers AccessRole management (admin) and the staff access-request
// workflow (everyone) in one page — see ARCHITECTURE.md for the underlying
// endpoints this exercises.
export default function AccessPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  // Distinct from `user === null` (confirmed logged out) — avoids a flash of
  // "Log in first" before the session-restore sequence has finished.
  const [checkingSession, setCheckingSession] = useState(true);
  const [myRequests, setMyRequests] = useState<MyAccessRequest[]>([]);
  const [allHospitals, setAllHospitals] = useState<Hospital[]>([]);
  const [accessRoles, setAccessRoles] = useState<AccessRole[]>([]);
  const [pendingRequests, setPendingRequests] = useState<AccessRequest[]>([]);

  const [hospitalSearch, setHospitalSearch] = useState("");
  const [selectedHospitalId, setSelectedHospitalId] = useState("");
  // Visible by default (so it's never hidden-until-you-click, per the earlier
  // bug), closed after picking a hospital or clicking anywhere outside it.
  const [showSuggestions, setShowSuggestions] = useState(true);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const [roleName, setRoleName] = useState("");
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [approveRoleByRequest, setApproveRoleByRequest] = useState<Record<string, string>>({});

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isAdmin = user?.hospital?.role === "admin";

  // A hospital you already have any request/membership for isn't "available"
  // to request again — the backend would just reject it as a duplicate.
  const requestedHospitalIds = new Set(myRequests.map((r) => r.hospitalId));
  const availableHospitals = allHospitals.filter((h) => !requestedHospitalIds.has(h.id));
  const filteredHospitals = availableHospitals.filter((h) =>
    h.name.toLowerCase().includes(hospitalSearch.toLowerCase())
  );

  useEffect(() => {
    load();
  }, []);

  // Closes the suggestion list on any click outside the search box —
  // more reliable than relying on the input's blur event alone.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
      setMyRequests(await listMyAccessRequests());
      setAllHospitals(await listAllHospitals());

      if (me.hospital?.role === "admin") {
        setAccessRoles(await listAccessRoles());
        setPendingRequests(await listPendingAccessRequests());
      }
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

  function handlePickHospital(hospital: Hospital) {
    setSelectedHospitalId(hospital.id);
    setHospitalSearch(hospital.name);
    setShowSuggestions(false);
  }

  async function handleRequestAccess(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!selectedHospitalId) {
      setError("Pick a hospital from the list first.");
      return;
    }
    try {
      await requestHospitalAccess(selectedHospitalId);
      setMessage(`Requested access to ${hospitalSearch}.`);
      setHospitalSearch("");
      setSelectedHospitalId("");
      setMyRequests(await listMyAccessRequests());
    } catch (err) {
      showError(err);
    }
  }

  function togglePermission(permission: string) {
    setRolePermissions((prev) =>
      prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission]
    );
  }

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await createAccessRole({ name: roleName, permissions: rolePermissions });
      setMessage(`Created AccessRole "${roleName}".`);
      setRoleName("");
      setRolePermissions([]);
      setAccessRoles(await listAccessRoles());
    } catch (err) {
      showError(err);
    }
  }

  async function handleApprove(requestId: string) {
    setError("");
    const accessRoleId = approveRoleByRequest[requestId];
    if (!accessRoleId) {
      setError("Pick an AccessRole to assign first.");
      return;
    }
    try {
      await approveAccessRequest(requestId, accessRoleId);
      setMessage("Request approved.");
      setPendingRequests(await listPendingAccessRequests());
    } catch (err) {
      showError(err);
    }
  }

  async function handleReject(requestId: string) {
    setError("");
    try {
      await rejectAccessRequest(requestId);
      setMessage("Request rejected.");
      setPendingRequests(await listPendingAccessRequests());
    } catch (err) {
      showError(err);
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
          <Link href="/login" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
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
        title="Access & Roles"
        description={`Current hospital: ${user.hospital ? `${user.hospital.name} (${user.hospital.role})` : "none selected"}`}
      />

      <div className="mb-6 space-y-3">
        {message && <Alert variant="success">{message}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
      </div>

      <div className="space-y-8">
        <Card
          title="Request hospital access"
          description={`${availableHospitals.length} hospital(s) available to join.`}
        >
          <form onSubmit={handleRequestAccess} className="space-y-3">
            <div>
              <Label htmlFor="hospital-search">Search hospitals</Label>
              <div ref={searchBoxRef} className="relative">
                <Input
                  id="hospital-search"
                  placeholder="Search hospitals..."
                  value={hospitalSearch}
                  onChange={(e) => {
                    setHospitalSearch(e.target.value);
                    setSelectedHospitalId("");
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  autoComplete="off"
                />
                {showSuggestions && availableHospitals.length > 0 && (
                  <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    {filteredHospitals.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                        No matching hospitals.
                      </li>
                    ) : (
                      filteredHospitals.map((h) => (
                        <li key={h.id}>
                          <button
                            type="button"
                            onClick={() => handlePickHospital(h)}
                            className="block w-full px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-700"
                          >
                            {h.name}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            </div>
            <Button type="submit" disabled={!selectedHospitalId}>
              Request access
            </Button>
          </form>
        </Card>

        <Card title="My requests">
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
                    <p className="text-xs text-slate-500 dark:text-slate-400">{r.role}</p>
                  </div>
                  <Badge tone={toneForStatus(r.status)}>{r.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {isAdmin && (
          <>
            <Card title="Access Roles" description={user.hospital!.name}>
              <form onSubmit={handleCreateRole} className="space-y-4">
                <TextField
                  label="Role name"
                  placeholder="e.g. Nurse"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  required
                />
                <div>
                  <Label>Permissions</Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {PERMISSIONS.map((permission) => (
                      <Checkbox
                        key={permission}
                        label={formatPermissionLabel(permission)}
                        checked={rolePermissions.includes(permission)}
                        onChange={() => togglePermission(permission)}
                      />
                    ))}
                  </div>
                </div>
                <Button type="submit">Create role</Button>
              </form>

              {accessRoles.length > 0 && (
                <ul className="mt-6 divide-y divide-slate-200 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {accessRoles.map((role) => (
                    <li key={role.id} className="py-3 first:pt-3 last:pb-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{role.name}</p>
                        <Badge tone={role.isActive ? "success" : "neutral"}>
                          {role.isActive ? "active" : "inactive"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        {role.permissions.length > 0
                          ? role.permissions.map(formatPermissionLabel).join(", ")
                          : "No permissions"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Pending staff requests" description={user.hospital!.name}>
              {pendingRequests.length === 0 ? (
                <EmptyState title="No pending requests" />
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {pendingRequests.map((req) => (
                    <li key={req.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{req.userName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{req.userEmail}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          aria-label={`Assign a role to ${req.userName}`}
                          value={approveRoleByRequest[req.id] ?? ""}
                          onChange={(e) =>
                            setApproveRoleByRequest((prev) => ({ ...prev, [req.id]: e.target.value }))
                          }
                          className="w-auto min-w-[10rem]"
                        >
                          <option value="">Choose a role...</option>
                          {accessRoles
                            .filter((r) => r.isActive)
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                        </Select>
                        <Button variant="primary" onClick={() => handleApprove(req.id)}>
                          Approve
                        </Button>
                        <Button variant="destructive" onClick={() => handleReject(req.id)}>
                          Reject
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </PageContainer>
  );
}
