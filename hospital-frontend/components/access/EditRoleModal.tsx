"use client";

import { useState } from "react";
import { PERMISSIONS } from "@shared/types";
import type { AccessRole } from "@shared/types";
import { updateAccessRole } from "@/lib/api";
import { Alert, Button, Checkbox, Modal } from "@/components/ui";

// "patient.view" -> "Patient — View", same formatting as the create-role form.
function formatPermissionLabel(permission: string): string {
  return permission
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" — ");
}

interface EditRoleModalProps {
  role: AccessRole;
  onClose: () => void;
  onSaved: (updated: AccessRole) => void;
}

// The caller renders this only while a role is being edited and passes
// key={role.id} — that remount (rather than an effect watching `role`) is
// what resets `permissions` to the newly-selected role's current set.
export default function EditRoleModal({ role, onClose, onSaved }: EditRoleModalProps) {
  const [permissions, setPermissions] = useState<string[]>(role.permissions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function togglePermission(permission: string) {
    setPermissions((prev) =>
      prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission]
    );
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const { accessRole } = await updateAccessRole(role.id, permissions);
      onSaved(accessRole);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update role.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit "${role.name}"`}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PERMISSIONS.map((permission) => (
            <Checkbox
              key={permission}
              label={formatPermissionLabel(permission)}
              checked={permissions.includes(permission)}
              onChange={() => togglePermission(permission)}
            />
          ))}
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
