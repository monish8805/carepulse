"use client";

import { useState } from "react";
import type { AccessRole, AccessRequest } from "@shared/types";
import { addStaff, approveAccessRequest, rejectAccessRequest } from "@/lib/api";
import { Alert, Avatar, Button, Divider, Label, Modal, Select, TextField } from "@/components/ui";

interface AddStaffModalProps {
  onClose: () => void;
  accessRoles: AccessRole[];
  pendingRequests: AccessRequest[];
  // Approving changes both pendingRequests and staff; adding/rejecting each
  // change one — separate callbacks so the page only refetches what moved.
  onStaffAdded: () => void;
  onApproved: () => void;
  onRejected: () => void;
}

// Everything an admin needs to bring a new person onto the staff: either add
// them directly (a real account gets created or granted access immediately),
// or review requests people have already submitted themselves. Two sections
// in one modal rather than two separate entry points, since both end at the
// same place — one more active staff member. The caller renders this only
// while open (see access/page.tsx), so it always mounts fresh.
export default function AddStaffModal({
  onClose,
  accessRoles,
  pendingRequests,
  onStaffAdded,
  onApproved,
  onRejected,
}: AddStaffModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accessRoleId, setAccessRoleId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [addMessage, setAddMessage] = useState("");
  const [addError, setAddError] = useState("");

  const [approveRoleByRequest, setApproveRoleByRequest] = useState<Record<string, string>>({});
  const [pendingError, setPendingError] = useState("");
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);

  const activeRoles = accessRoles.filter((r) => r.isActive);

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    setAddMessage("");
    if (!accessRoleId) {
      setAddError("Pick a role first.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await addStaff({ name, email, accessRoleId });
      setAddMessage(
        result.createdNewUser
          ? `${name} was added and emailed a temporary password.`
          : `${name} was added using their existing CarePulse account.`
      );
      setName("");
      setEmail("");
      setAccessRoleId("");
      onStaffAdded();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not add staff member.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(requestId: string) {
    setPendingError("");
    const roleId = approveRoleByRequest[requestId];
    if (!roleId) {
      setPendingError("Pick an AccessRole to assign first.");
      return;
    }
    setActingRequestId(requestId);
    try {
      await approveAccessRequest(requestId, roleId);
      onApproved();
    } catch (err) {
      setPendingError(err instanceof Error ? err.message : "Could not approve request.");
    } finally {
      setActingRequestId(null);
    }
  }

  async function handleReject(requestId: string) {
    setPendingError("");
    setActingRequestId(requestId);
    try {
      await rejectAccessRequest(requestId);
      onRejected();
    } catch (err) {
      setPendingError(err instanceof Error ? err.message : "Could not reject request.");
    } finally {
      setActingRequestId(null);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add staff">
      <div className="space-y-6">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Add directly</h3>
          <form onSubmit={handleAddSubmit} className="space-y-3">
            <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div>
              <Label htmlFor="add-staff-role">Role</Label>
              <Select
                id="add-staff-role"
                value={accessRoleId}
                onChange={(e) => setAccessRoleId(e.target.value)}
                required
              >
                <option value="">Choose a role...</option>
                {activeRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>

            {addMessage && <Alert variant="success">{addMessage}</Alert>}
            {addError && <Alert variant="error">{addError}</Alert>}

            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding..." : "Add staff member"}
            </Button>
          </form>
        </div>

        <Divider />

        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Pending requests{pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ""}
          </h3>

          {pendingError && (
            <div className="mb-3">
              <Alert variant="error">{pendingError}</Alert>
            </div>
          )}

          {pendingRequests.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No pending requests.</p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {pendingRequests.map((req) => (
                <li key={req.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <Avatar name={req.userName} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {req.userName}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{req.userEmail}</p>
                    </div>
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
                      {activeRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variant="primary"
                      disabled={actingRequestId === req.id}
                      onClick={() => handleApprove(req.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={actingRequestId === req.id}
                      onClick={() => handleReject(req.id)}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
