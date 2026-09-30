import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, ShieldCheck, ChevronDown } from "lucide-react";
import type { StaffMember } from "@shared/types";
import {
  removeStaffMember,
  disableStaffMember,
  enableStaffMember,
  updateStaffRole,
} from "@/lib/api";
import { useMe } from "@/lib/session";
import {
  accessRolesQuery,
  cachedHospitalContext,
  pendingRequestsQuery,
  prefetch,
  staffQuery as staffQueryOptions,
} from "@/lib/queries";
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
  SkeletonList,
  useToast,
} from "@/components/ui";
import AddStaffModal from "@/components/access/AddStaffModal";
import ManageRolesPanel from "@/components/access/ManageRolesPanel";

// Hospital administration: Staff is the primary, permanent content here.
// Adding/reviewing staff lives behind a Modal (AddStaffModal); Roles &
// Permissions lives behind an inline expand/collapse toggle in its own Card
// (ManageRolesPanel) rather than a second modal — see DESIGN.md's account-nav
// vs. hospital-nav split for why "Request hospital access" isn't here at all
// anymore (it's its own page, reachable from the account menu).
export const Route = createFileRoute("/_portal/access")({
  loader: ({ context: { queryClient } }) => {
    const hospital = cachedHospitalContext(queryClient);
    if (hospital?.role === "admin") {
      prefetch(queryClient, accessRolesQuery);
      prefetch(queryClient, pendingRequestsQuery);
    }
    if (hospital?.canManageStaff) prefetch(queryClient, staffQueryOptions);
  },
  component: AccessPage,
});

function AccessPage() {
  const queryClient = useQueryClient();
  const { isPending, user, error: meError } = useMe();
  const isAdmin = user?.hospital?.role === "admin";
  const canManageStaff = user?.hospital?.canManageStaff ?? false;

  const rolesQuery = useQuery({ ...accessRolesQuery, enabled: isAdmin });
  const pendingQuery = useQuery({ ...pendingRequestsQuery, enabled: isAdmin });
  const staffQuery = useQuery({ ...staffQueryOptions, enabled: canManageStaff });

  const [staffSearch, setStaffSearch] = useState("");
  const [staffToRemove, setStaffToRemove] = useState<StaffMember | null>(null);
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [rolesExpanded, setRolesExpanded] = useState(false);

  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRoleValue, setEditRoleValue] = useState("");

  const toast = useToast();
  // Remove is confirmed in a modal, so its failure is shown there; the other
  // row actions report through toasts.
  const [removeError, setRemoveError] = useState("");

  // Handed to child components (AddStaffModal, ManageRolesPanel) as their
  // "something changed" callbacks. A failed refetch surfaces through the
  // query's own error (shown below), never as an unhandled rejection.
  function refetchRoles() {
    queryClient.invalidateQueries({ queryKey: ["accessRoles"] });
  }

  function refetchPending() {
    queryClient.invalidateQueries({ queryKey: ["accessRequests", "pending"] });
  }

  function refetchStaffOnly() {
    queryClient.invalidateQueries({ queryKey: ["staff"] });
  }

  function refetchPendingAndStaff() {
    refetchPending();
    refetchStaffOnly();
  }

  // Not optimistic: removal can't be undone, so the modal waits for the
  // server's answer and shows a failure in place.
  const removeMutation = useMutation({
    mutationFn: (member: StaffMember) => removeStaffMember(member.id),
    onSuccess: (_, member) => {
      toast.success(`Removed ${member.userName}.`);
      setStaffToRemove(null);
      refetchStaffOnly();
    },
    onError: (err) => setRemoveError(err.message || "Could not remove staff member."),
  });

  // Not optimistic: which role (and so which permissions) someone holds is
  // the server's decision to confirm, not something to show before it has.
  const roleMutation = useMutation({
    mutationFn: (input: { member: StaffMember; accessRoleId: string }) =>
      updateStaffRole(input.member.id, input.accessRoleId),
    onSuccess: (_, { member }) => {
      toast.success(`Updated ${member.userName}'s role.`);
      setEditingRoleId(null);
      refetchStaffOnly();
    },
    onError: (err) => toast.error(err.message || "Could not update role."),
  });

  // Toggles between disable/enable depending on the member's current status —
  // a reversible suspension, distinct from Remove below. The row flips
  // instantly; the server's answer confirms or reverts it.
  const toggleMutation = useMutation({
    mutationFn: (member: StaffMember) =>
      member.status === "active" ? disableStaffMember(member.id) : enableStaffMember(member.id),
    onMutate: async (member) => {
      await queryClient.cancelQueries({ queryKey: staffQueryOptions.queryKey });
      const previous = queryClient.getQueryData(staffQueryOptions.queryKey);
      queryClient.setQueryData(staffQueryOptions.queryKey, (list) =>
        (list ?? []).map((s) =>
          s.id === member.id ? { ...s, status: member.status === "active" ? "disabled" : "active" } : s
        )
      );
      return { previous };
    },
    onSuccess: (_, member) =>
      toast.success(`${member.status === "active" ? "Disabled" : "Enabled"} ${member.userName}.`),
    onError: (err, _, context) => {
      queryClient.setQueryData(staffQueryOptions.queryKey, context?.previous);
      toast.error(err.message || "Could not update staff member.");
    },
    onSettled: refetchStaffOnly,
  });

  function handleRemoveStaff() {
    if (!staffToRemove || removeMutation.isPending) return;
    setRemoveError("");
    removeMutation.mutate(staffToRemove);
  }

  // Clears any stale error before opening a confirmation, so a failure from
  // an earlier, unrelated removal can't linger and read as if it applies here.
  function openRemoveStaff(member: StaffMember) {
    setRemoveError("");
    setStaffToRemove(member);
  }

  function startEditRole(member: StaffMember) {
    setEditingRoleId(member.id);
    setEditRoleValue(member.accessRoleId ?? "");
  }

  function cancelEditRole() {
    setEditingRoleId(null);
  }

  function handleSaveRole(member: StaffMember) {
    if (!editRoleValue) return;
    roleMutation.mutate({ member, accessRoleId: editRoleValue });
  }

  const accessRoles = rolesQuery.data ?? [];
  const pendingRequests = pendingQuery.data ?? [];
  const staff = staffQuery.data ?? [];
  const savingRoleId = roleMutation.isPending ? roleMutation.variables.member.id : null;
  const togglingStatusId = toggleMutation.isPending ? toggleMutation.variables.id : null;
  const removingStaff = removeMutation.isPending;
  const loadError =
    meError?.message ||
    [rolesQuery, pendingQuery, staffQuery].find((q) => q.isError)?.error?.message ||
    "";

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
        {loadError && (
          <div className="mb-4">
            <Alert variant="error">{loadError}</Alert>
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
        {loadError && <Alert variant="error">{loadError}</Alert>}
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

              {staffQuery.isPending ? (
                <SkeletonList />
              ) : staff.length === 0 ? (
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
                              onClick={() => toggleMutation.mutate(member)}
                            >
                              {isActive ? "Disable" : "Enable"}
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
          {removeError && <Alert variant="error">{removeError}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStaffToRemove(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={removingStaff} onClick={handleRemoveStaff}>
              {removingStaff ? "Removing..." : "Remove"}
            </Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
