"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, ShieldCheck, ChevronDown } from "lucide-react";
import type { SessionUser, AccessRole, AccessRequest, StaffMember } from "@shared/types";
import {
  restoreSession,
  getMe,
  listAccessRoles,
  listPendingAccessRequests,
  listStaff,
  removeStaffMember,
  disableStaffMember,
  enableStaffMember,
  updateStaffRole,
} from "@/lib/api";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  IconBadge,
  Input,
  Label,
  LoadingState,
  Modal,
  PageContainer,
  PageHeader,
  Select,
} from "@/components/ui";
import AddStaffModal from "@/components/access/AddStaffModal";
import ManageRolesPanel from "@/components/access/ManageRolesPanel";

// Hospital administration: Staff is the primary, permanent content here.
// Adding/reviewing staff lives behind a Modal (AddStaffModal); Roles &
// Permissions lives behind an inline expand/collapse toggle in its own Card
// (ManageRolesPanel) rather than a second modal — see DESIGN.md's account-nav
// vs. hospital-nav split for why "Request hospital access" isn't here at all
// anymore (it's its own page, reachable from the account menu).
export default function AccessPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  // Distinct from `user === null` (confirmed logged out) — avoids a flash of
  // "Log in first" before the session-restore sequence has finished.
  const [checkingSession, setCheckingSession] = useState(true);
  const [accessRoles, setAccessRoles] = useState<AccessRole[]>([]);
  const [pendingRequests, setPendingRequests] = useState<AccessRequest[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffSearch, setStaffSearch] = useState("");

  const [staffToRemove, setStaffToRemove] = useState<StaffMember | null>(null);
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [rolesExpanded, setRolesExpanded] = useState(false);

  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRoleValue, setEditRoleValue] = useState("");
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  const [togglingStatusId, setTogglingStatusId] = useState<string | null>(null);

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

  async function refetchRoles() {
    setAccessRoles(await listAccessRoles());
  }

  async function refetchPendingAndStaff() {
    setPendingRequests(await listPendingAccessRequests());
    setStaff(await listStaff());
  }

  async function refetchPending() {
    setPendingRequests(await listPendingAccessRequests());
  }

  async function refetchStaffOnly() {
    setStaff(await listStaff());
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
  function openRemoveStaff(member: StaffMember) {
    setError("");
    setMessage("");
    setStaffToRemove(member);
  }

  function startEditRole(member: StaffMember) {
    setError("");
    setMessage("");
    setEditingRoleId(member.id);
    setEditRoleValue(member.accessRoleId ?? "");
  }

  function cancelEditRole() {
    setEditingRoleId(null);
  }

  async function handleSaveRole(member: StaffMember) {
    if (!editRoleValue) return;
    setError("");
    setSavingRoleId(member.id);
    try {
      await updateStaffRole(member.id, editRoleValue);
      setMessage(`Updated ${member.userName}'s role.`);
      setEditingRoleId(null);
      await refetchStaffOnly();
    } catch (err) {
      showError(err);
    } finally {
      setSavingRoleId(null);
    }
  }

  // Toggles between disable/enable depending on the member's current status —
  // a reversible suspension, distinct from Remove below.
  async function handleToggleDisabled(member: StaffMember) {
    setError("");
    setMessage("");
    setTogglingStatusId(member.id);
    try {
      if (member.status === "active") {
        await disableStaffMember(member.id);
        setMessage(`Disabled ${member.userName}.`);
      } else {
        await enableStaffMember(member.id);
        setMessage(`Enabled ${member.userName}.`);
      }
      await refetchStaffOnly();
    } catch (err) {
      showError(err);
    } finally {
      setTogglingStatusId(null);
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
        <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
          <Link href="/login" className="font-medium text-cp-primary hover:underline dark:text-cp-primary-dark">
            Log in
          </Link>{" "}
          first.
        </p>
      </PageContainer>
    );
  }

  const filteredStaff = staff.filter((member) => {
    const query = staffSearch.trim().toLowerCase();
    if (!query) return true;
    return member.userName.toLowerCase().includes(query) || member.userEmail.toLowerCase().includes(query);
  });

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

      {!isAdmin && !canManageStaff ? (
        <EmptyState
          title="Nothing to manage here"
          description="Only a hospital administrator, or staff with the staff.manage permission, can view this page's content."
        />
      ) : (
        <div className="space-y-8">
          {canManageStaff && (
            <Card>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <IconBadge icon={Users} />
                  <div>
                    <h3 className="text-base font-semibold text-cp-text dark:text-cp-text-dark">Staff</h3>
                    <p className="mt-1 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">Current active staff members.</p>
                  </div>
                </div>
                {isAdmin && (
                  <Button onClick={() => setAddStaffOpen(true)}>
                    Add staff{pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ""}
                  </Button>
                )}
              </div>

              <div className="mb-4">
                <Label htmlFor="staff-search">Search staff</Label>
                <Input
                  id="staff-search"
                  placeholder="Search by name or email..."
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  autoComplete="off"
                />
              </div>

              {staff.length === 0 ? (
                <EmptyState title="No staff members yet" />
              ) : filteredStaff.length === 0 ? (
                <EmptyState title="No staff match your search" />
              ) : (
                <ul className="divide-y divide-cp-border dark:divide-cp-border-dark">
                  {filteredStaff.map((member) => {
                    // A staff.manage holder (not an admin) can't remove or
                    // disable another staff.manage holder — matches the
                    // backend's peer-protection rule, shown here so the
                    // button isn't offered for a request that would just 403.
                    // Enable has no such restriction server-side.
                    const canRemoveOrDisable = isAdmin || !member.canManageStaff;
                    const isEditingRole = editingRoleId === member.id;
                    const isActive = member.status === "active";
                    return (
                      <li
                        key={member.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={member.userName} size="sm" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium text-cp-text dark:text-cp-text-dark">
                                {member.userName}
                              </p>
                              {!isActive && <Badge tone="neutral">disabled</Badge>}
                            </div>
                            <p className="truncate text-xs text-cp-text-muted dark:text-cp-text-muted-dark">
                              {member.userEmail}
                              {member.accessRoleName ? ` · ${member.accessRoleName}` : ""}
                            </p>
                          </div>
                        </div>

                        {isEditingRole ? (
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <Select
                              aria-label={`Change ${member.userName}'s role`}
                              value={editRoleValue}
                              onChange={(e) => setEditRoleValue(e.target.value)}
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
                            <Button
                              disabled={!editRoleValue || savingRoleId === member.id}
                              onClick={() => handleSaveRole(member)}
                            >
                              {savingRoleId === member.id ? "Saving..." : "Save"}
                            </Button>
                            <Button variant="ghost" onClick={cancelEditRole}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex shrink-0 flex-wrap gap-2">
                            {isAdmin && (
                              <Button variant="secondary" onClick={() => startEditRole(member)}>
                                Edit
                              </Button>
                            )}
                            <Button
                              variant="secondary"
                              disabled={
                                (isActive && !canRemoveOrDisable) || togglingStatusId === member.id
                              }
                              title={
                                isActive && !canRemoveOrDisable
                                  ? "You can't disable another staff member who also manages staff."
                                  : undefined
                              }
                              onClick={() => handleToggleDisabled(member)}
                            >
                              {togglingStatusId === member.id ? "..." : isActive ? "Disable" : "Enable"}
                            </Button>
                            {isActive && (
                              <Button
                                variant="destructive"
                                disabled={!canRemoveOrDisable}
                                title={
                                  canRemoveOrDisable
                                    ? undefined
                                    : "You can't remove another staff member who also manages staff."
                                }
                                onClick={() => openRemoveStaff(member)}
                              >
                                Remove
                              </Button>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          {isAdmin && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <IconBadge icon={ShieldCheck} />
                  <div>
                    <h3 className="text-base font-semibold text-cp-text dark:text-cp-text-dark">
                      Roles &amp; Permissions
                    </h3>
                    <p className="mt-1 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
                      {accessRoles.length} role{accessRoles.length === 1 ? "" : "s"} defined for{" "}
                      {user.hospital!.name}.
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  aria-expanded={rolesExpanded}
                  onClick={() => setRolesExpanded((prev) => !prev)}
                >
                  Manage roles
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform ${rolesExpanded ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </Button>
              </div>

              {rolesExpanded && <ManageRolesPanel accessRoles={accessRoles} onChanged={refetchRoles} />}
            </Card>
          )}
        </div>
      )}

      {isAdmin && addStaffOpen && (
        <AddStaffModal
          onClose={() => setAddStaffOpen(false)}
          accessRoles={accessRoles}
          pendingRequests={pendingRequests}
          onStaffAdded={refetchStaffOnly}
          onApproved={refetchPendingAndStaff}
          onRejected={refetchPending}
        />
      )}

      <Modal open={!!staffToRemove} onClose={() => setStaffToRemove(null)} title="Remove staff member">
        <div className="space-y-3">
          <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
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
