"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PERMISSIONS } from "@shared/types";
import type { SessionUser, AccessRole, AccessRequest, MyAccessRequest, StaffMember } from "@shared/types";
import {
  restoreSession,
  getMe,
  listAccessRoles,
  createAccessRole,
  deleteAccessRole,
  listMyAccessRequests,
  listPendingAccessRequests,
  approveAccessRequest,
  rejectAccessRequest,
  listStaff,
  removeStaffMember,
} from "@/lib/api";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Label,
  LoadingState,
  Modal,
  PageContainer,
  PageHeader,
  SectionHeading,
  Select,
  TextField,
  toneForStatus,
} from "@/components/ui";
import EditRoleModal from "@/components/access/EditRoleModal";

// "patient.view" -> "Patient — View", matching the permission catalogue in
// backend/config/permissions.ts (area.action strings) to a readable label.
function formatPermissionLabel(permission: string): string {
  return permission
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" — ");
}

// Hospital-application navigation, not account/personal actions — the
// "Request hospital access" action itself now lives in the Header's account
// menu (see AccountMenu.tsx / RequestAccessModal.tsx and DESIGN.md's
// account-nav vs. hospital-nav split). This page covers what's left:
// tracking your own requests, and hospital administration — Roles &
// Permissions and reviewing pending requests (admin only), and Staff
// (admin, or a staff member whose current AccessRole includes staff.manage —
// see HospitalContext.canManageStaff and domain/staff.service.ts).
export default function AccessPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  // Distinct from `user === null` (confirmed logged out) — avoids a flash of
  // "Log in first" before the session-restore sequence has finished.
  const [checkingSession, setCheckingSession] = useState(true);
  const [myRequests, setMyRequests] = useState<MyAccessRequest[]>([]);
  const [accessRoles, setAccessRoles] = useState<AccessRole[]>([]);
  const [pendingRequests, setPendingRequests] = useState<AccessRequest[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);

  const [roleName, setRoleName] = useState("");
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [approveRoleByRequest, setApproveRoleByRequest] = useState<Record<string, string>>({});

  const [editingRole, setEditingRole] = useState<AccessRole | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<AccessRole | null>(null);
  const [staffToRemove, setStaffToRemove] = useState<StaffMember | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isAdmin = user?.hospital?.role === "admin";
  const canManageStaff = user?.hospital?.canManageStaff ?? false;

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
      const me = await getMe();
      setUser(me);
      setMyRequests(await listMyAccessRequests());

      if (me.hospital?.role === "admin") {
        setAccessRoles(await listAccessRoles());
        setPendingRequests(await listPendingAccessRequests());
      }
      if (me.hospital?.canManageStaff) {
        setStaff(await listStaff());
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

  function handleRoleSaved(updated: AccessRole) {
    setAccessRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setMessage(`Updated "${updated.name}".`);
  }

  async function handleDeleteRole() {
    if (!roleToDelete) return;
    setError("");
    try {
      await deleteAccessRole(roleToDelete.id);
      setMessage(`Deleted "${roleToDelete.name}".`);
      setAccessRoles((prev) => prev.filter((r) => r.id !== roleToDelete.id));
      setRoleToDelete(null);
    } catch (err) {
      showError(err);
    }
  }

  async function handleRemoveStaff() {
    if (!staffToRemove) return;
    setError("");
    try {
      await removeStaffMember(staffToRemove.id);
      setMessage(`Removed ${staffToRemove.userName}.`);
      setStaff((prev) => prev.filter((s) => s.id !== staffToRemove.id));
      setStaffToRemove(null);
    } catch (err) {
      showError(err);
    }
  }

  // Clears any stale error before opening a confirmation, so a message from
  // an earlier, unrelated action can't linger and read as if it applies here.
  function openDeleteRole(role: AccessRole) {
    setError("");
    setMessage("");
    setRoleToDelete(role);
  }

  function openRemoveStaff(member: StaffMember) {
    setError("");
    setMessage("");
    setStaffToRemove(member);
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
        <Card title="My requests" description="Hospitals you've requested access to, and their status.">
          {myRequests.length === 0 ? (
            <EmptyState
              title="No requests yet"
              description="Use Request hospital access in the account menu (top right) to join a hospital."
            />
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

        {(isAdmin || canManageStaff) && (
          <div>
            <SectionHeading title="Hospital administration" description={user.hospital!.name} />
            <div className="space-y-8">
              {isAdmin && (
                <Card title="Roles & Permissions">
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
                        <li
                          key={role.id}
                          className="flex items-center justify-between gap-3 py-3 first:pt-3 last:pb-0"
                        >
                          <div className="min-w-0">
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
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button variant="secondary" onClick={() => setEditingRole(role)}>
                              Edit
                            </Button>
                            <Button variant="destructive" onClick={() => openDeleteRole(role)}>
                              Delete
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}

              {canManageStaff && (
                <Card title="Staff" description="Current active staff members.">
                  {staff.length === 0 ? (
                    <EmptyState title="No staff members yet" />
                  ) : (
                    <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                      {staff.map((member) => {
                        // A staff.manage holder (not an admin) can't remove
                        // another staff.manage holder — matches the backend's
                        // peer-protection rule, shown here so the button
                        // isn't offered for a request that would just 403.
                        const canRemove = isAdmin || !member.canManageStaff;
                        return (
                          <li
                            key={member.id}
                            className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                {member.userName}
                              </p>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {member.userEmail}
                                {member.accessRoleName ? ` · ${member.accessRoleName}` : ""}
                              </p>
                            </div>
                            <Button
                              variant="destructive"
                              disabled={!canRemove}
                              title={canRemove ? undefined : "You can't remove another staff member who also manages staff."}
                              onClick={() => openRemoveStaff(member)}
                            >
                              Remove
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
              )}

              {isAdmin && (
                <Card title="Pending requests" description="Review pending staff access requests.">
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
              )}
            </div>
          </div>
        )}
      </div>

      {editingRole && (
        <EditRoleModal
          key={editingRole.id}
          role={editingRole}
          onClose={() => setEditingRole(null)}
          onSaved={handleRoleSaved}
        />
      )}

      <Modal open={!!roleToDelete} onClose={() => setRoleToDelete(null)} title="Delete role">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Delete &quot;{roleToDelete?.name}&quot;? This can&apos;t be undone. If any active staff member currently
            holds this role, deletion will be blocked.
          </p>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRoleToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteRole}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!staffToRemove} onClose={() => setStaffToRemove(null)} title="Remove staff member">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Remove {staffToRemove?.userName} from this hospital? They&apos;ll need to request access again to
            rejoin.
          </p>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStaffToRemove(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveStaff}>
              Remove
            </Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
