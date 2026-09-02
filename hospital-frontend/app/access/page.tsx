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

// A single test page covering AccessRoles + the staff access-request workflow.
// Not a polished UI — just enough to exercise every endpoint by hand.
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
      <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
        <p>Loading...</p>
      </main>
    );
  }

  if (user === null) {
    return (
      <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
        {error && <p style={{ color: "red" }}>{error}</p>}
        <p>
          <Link href="/login">Log in</Link> first.
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: 640 }}>
      <p>
        <Link href="/">← Home</Link>
      </p>
      <h1>Access &amp; Roles (test page)</h1>
      <p>
        Current hospital: {user.hospital ? `${user.hospital.name} (${user.hospital.role})` : "none selected"}
      </p>

      {message && <p style={{ color: "green" }}>{message}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      <hr style={{ margin: "1.5rem 0" }} />

      <h2>Request access to a hospital</h2>
      <p>{availableHospitals.length} hospital(s) available to join.</p>
      <form onSubmit={handleRequestAccess}>
        <div ref={searchBoxRef} style={{ position: "relative", width: "20rem" }}>
          <input
            placeholder="Search hospitals..."
            value={hospitalSearch}
            onChange={(e) => {
              setHospitalSearch(e.target.value);
              setSelectedHospitalId("");
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            style={{ width: "100%" }}
          />
          {showSuggestions && availableHospitals.length > 0 && (
            <ul
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                margin: 0,
                padding: "0.25rem 0",
                listStyle: "none",
                background: "white",
                color: "#111", // fixed regardless of the page's (possibly dark-mode) inherited text color
                border: "1px solid #ccc",
                maxHeight: "12rem",
                overflowY: "auto",
                zIndex: 1,
              }}
            >
              {filteredHospitals.length === 0 ? (
                <li style={{ padding: "0.25rem 0.5rem", color: "#666" }}>No matching hospitals.</li>
              ) : (
                filteredHospitals.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => handlePickHospital(h)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "0.25rem 0.5rem",
                        border: "none",
                        background: "none",
                        color: "#111",
                        cursor: "pointer",
                      }}
                    >
                      {h.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
        <button type="submit" disabled={!selectedHospitalId} style={{ marginTop: "0.5rem" }}>
          Request access
        </button>
      </form>

      <h3>My requests</h3>
      {myRequests.length === 0 ? (
        <p>No requests yet.</p>
      ) : (
        <ul>
          {myRequests.map((r) => (
            <li key={r.id}>
              {r.hospitalName} — {r.status} ({r.role})
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <>
          <hr style={{ margin: "1.5rem 0" }} />

          <h2>Access Roles — {user.hospital!.name}</h2>
          <form onSubmit={handleCreateRole}>
            <input
              placeholder="Role name (e.g. Nurse)"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              required
            />
            <div>
              {PERMISSIONS.map((permission) => (
                <label key={permission} style={{ marginRight: "1rem" }}>
                  <input
                    type="checkbox"
                    checked={rolePermissions.includes(permission)}
                    onChange={() => togglePermission(permission)}
                  />
                  {permission}
                </label>
              ))}
            </div>
            <button type="submit">Create role</button>
          </form>

          {accessRoles.length === 0 ? (
            <p>No roles yet.</p>
          ) : (
            <ul>
              {accessRoles.map((role) => (
                <li key={role.id}>
                  {role.name} — {role.isActive ? "active" : "inactive"} — {role.permissions.join(", ") || "no permissions"}
                </li>
              ))}
            </ul>
          )}

          <hr style={{ margin: "1.5rem 0" }} />

          <h2>Pending staff requests — {user.hospital!.name}</h2>
          {pendingRequests.length === 0 ? (
            <p>No pending requests.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {pendingRequests.map((req) => (
                <li key={req.id} style={{ marginBottom: "0.75rem" }}>
                  {req.userName} ({req.userEmail}){" "}
                  <select
                    value={approveRoleByRequest[req.id] ?? ""}
                    onChange={(e) =>
                      setApproveRoleByRequest((prev) => ({ ...prev, [req.id]: e.target.value }))
                    }
                  >
                    <option value="">Choose a role...</option>
                    {accessRoles
                      .filter((r) => r.isActive)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>{" "}
                  <button onClick={() => handleApprove(req.id)}>Approve</button>{" "}
                  <button onClick={() => handleReject(req.id)}>Reject</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
