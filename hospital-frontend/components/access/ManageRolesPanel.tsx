"use client";

import { useState } from "react";
import { PERMISSIONS } from "@shared/types";
import type { AccessRole } from "@shared/types";
import { createAccessRole, updateAccessRole, deleteAccessRole } from "@/lib/api";
import { Alert, Badge, Button, Checkbox, Divider, EmptyState, Input, Label } from "@/components/ui";

// "patient.view" -> "Patient — View", matching the permission catalogue in
// backend/config/permissions.ts (area.action strings) to a readable label.
function formatPermissionLabel(permission: string): string {
  return permission
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" — ");
}

type View = { type: "list" } | { type: "edit"; role: AccessRole } | { type: "delete"; role: AccessRole };

interface ManageRolesPanelProps {
  accessRoles: AccessRole[];
  onChanged: () => void;
}

// Create + list + edit + delete, all rendered inline inside the Roles &
// Permissions Card (toggled open/closed by the "Manage roles" button in
// access/page.tsx) instead of a Modal overlay — the parent conditionally
// mounts this only while expanded, so `view` always starts fresh at "list"
// each time it's opened. Editing/deleting swap this panel's own content (the
// `view` state below) rather than opening anything else on top.
export default function ManageRolesPanel({ accessRoles, onChanged }: ManageRolesPanelProps) {
  const [view, setView] = useState<View>({ type: "list" });

  const [roleName, setRoleName] = useState("");
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [listError, setListError] = useState("");
  const [listMessage, setListMessage] = useState("");

  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function toggleCreatePermission(permission: string) {
    setRolePermissions((prev) =>
      prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission]
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setListError("");
    setListMessage("");
    setCreating(true);
    try {
      await createAccessRole({ name: roleName, permissions: rolePermissions });
      setListMessage(`Created "${roleName}".`);
      setRoleName("");
      setRolePermissions([]);
      onChanged();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not create role.");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(role: AccessRole) {
    setEditPermissions(role.permissions);
    setEditError("");
    setView({ type: "edit", role });
  }

  function toggleEditPermission(permission: string) {
    setEditPermissions((prev) =>
      prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission]
    );
  }

  async function handleSaveEdit() {
    if (view.type !== "edit") return;
    setSaving(true);
    setEditError("");
    try {
      await updateAccessRole(view.role.id, editPermissions);
      onChanged();
      setView({ type: "list" });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not update role.");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (view.type !== "delete") return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteAccessRole(view.role.id);
      onChanged();
      setView({ type: "list" });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete role.");
    } finally {
      setDeleting(false);
    }
  }

  if (view.type === "edit") {
    return (
      <div className="space-y-4">
        <Divider />
        <h4 className="text-sm font-semibold text-cp-text dark:text-cp-text-dark">Edit &quot;{view.role.name}&quot;</h4>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PERMISSIONS.map((permission) => (
            <Checkbox
              key={permission}
              label={formatPermissionLabel(permission)}
              checked={editPermissions.includes(permission)}
              onChange={() => toggleEditPermission(permission)}
            />
          ))}
        </div>
        {editError && <Alert variant="error">{editError}</Alert>}
        <div className="flex justify-between gap-2">
          <Button type="button" variant="ghost" onClick={() => setView({ type: "list" })}>
            ← Back to roles
          </Button>
          <Button type="button" onClick={handleSaveEdit} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    );
  }

  if (view.type === "delete") {
    return (
      <div className="space-y-3">
        <Divider />
        <h4 className="text-sm font-semibold text-cp-text dark:text-cp-text-dark">Delete role</h4>
        <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
          Delete &quot;{view.role.name}&quot;? This can&apos;t be undone. If any active staff member currently holds
          this role, deletion will be blocked.
        </p>
        {deleteError && <Alert variant="error">{deleteError}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setView({ type: "list" })}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Divider />
      <form onSubmit={handleCreate} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="new-role-name">Role name</Label>
            <Input
              id="new-role-name"
              placeholder="e.g. Nurse"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create role"}
          </Button>
        </div>
        <div>
          <Label>Permissions</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PERMISSIONS.map((permission) => (
              <Checkbox
                key={permission}
                label={formatPermissionLabel(permission)}
                checked={rolePermissions.includes(permission)}
                onChange={() => toggleCreatePermission(permission)}
              />
            ))}
          </div>
        </div>
        {listMessage && <Alert variant="success">{listMessage}</Alert>}
        {listError && <Alert variant="error">{listError}</Alert>}
      </form>

      <div>
        {accessRoles.length === 0 ? (
          <EmptyState title="No roles yet" />
        ) : (
          <ul className="divide-y divide-cp-border border-t border-cp-border dark:divide-cp-border-dark dark:border-cp-border-dark">
            {accessRoles.map((role) => (
              <li key={role.id} className="flex items-center justify-between gap-3 py-3 first:pt-3 last:pb-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-cp-text dark:text-cp-text-dark">{role.name}</p>
                    <Badge tone={role.isActive ? "success" : "neutral"}>
                      {role.isActive ? "active" : "inactive"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
                    {role.permissions.length > 0
                      ? role.permissions.map(formatPermissionLabel).join(", ")
                      : "No permissions"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" onClick={() => openEdit(role)}>
                    Edit
                  </Button>
                  <Button variant="destructive" onClick={() => setView({ type: "delete", role })}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
