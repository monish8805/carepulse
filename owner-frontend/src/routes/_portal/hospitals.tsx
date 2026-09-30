import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusCircle, Building2 } from "lucide-react";
import type { Hospital } from "@shared/types";
import { createHospital, disableHospital, enableHospital, deleteHospital } from "@/lib/api";
import { useSession } from "@/lib/session";
import { hospitalsQuery as hospitalsQueryOptions, prefetch } from "@/lib/queries";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  Modal,
  PageContainer,
  PageHeader,
  TextField,
} from "@/components/ui";

export const Route = createFileRoute("/_portal/hospitals")({
  loader: ({ context }) => prefetch(context.queryClient, hospitalsQueryOptions),
  component: HospitalsPage,
});

function HospitalsPage() {
  const queryClient = useQueryClient();
  const session = useSession();
  const hospitalsQuery = useQuery({ ...hospitalsQueryOptions, enabled: !!session.data });

  const [hospitalName, setHospitalName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [hospitalToDelete, setHospitalToDelete] = useState<Hospital | null>(null);

  function showError(err: unknown) {
    setMessage("");
    setError(err instanceof Error ? err.message : "Something went wrong.");
  }

  function refreshHospitals() {
    return queryClient.invalidateQueries({ queryKey: ["hospitals"] });
  }

  const createMutation = useMutation({
    mutationFn: createHospital,
    onSuccess: (result) => {
      setMessage(`Created "${result.hospital.name}". Login credentials were emailed to ${result.admin.email}.`);
      setHospitalName("");
      setAdminName("");
      setAdminEmail("");
      return refreshHospitals();
    },
    onError: showError,
  });

  // Toggles between disable/enable depending on the hospital's current state
  // — a reversible pause, distinct from Delete below.
  const toggleMutation = useMutation({
    mutationFn: (hospital: Hospital) => (hospital.isActive ? disableHospital(hospital.id) : enableHospital(hospital.id)),
    onSuccess: (_, hospital) => {
      setMessage(`${hospital.isActive ? "Disabled" : "Enabled"} "${hospital.name}".`);
      return refreshHospitals();
    },
    onError: showError,
  });

  const deleteMutation = useMutation({
    mutationFn: (hospital: Hospital) => deleteHospital(hospital.id),
    onSuccess: (_, hospital) => {
      setMessage(`Deleted "${hospital.name}".`);
      setHospitalToDelete(null);
      return refreshHospitals();
    },
    onError: showError,
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    createMutation.mutate({ hospitalName, adminName, adminEmail });
  }

  function handleToggleActive(hospital: Hospital) {
    setError("");
    setMessage("");
    toggleMutation.mutate(hospital);
  }

  // Clears any stale error before opening a confirmation, so a message from
  // an earlier, unrelated action can't linger and read as if it applies here.
  function openDeleteConfirm(hospital: Hospital) {
    setError("");
    setMessage("");
    setHospitalToDelete(hospital);
  }

  function handleConfirmDelete() {
    if (!hospitalToDelete) return;
    setError("");
    deleteMutation.mutate(hospitalToDelete);
  }

  if (session.isPending) {
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }

  if (!session.data) {
    return (
      <PageContainer>
        <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
          <Link to="/login" className="font-medium text-cp-primary hover:underline dark:text-cp-primary-dark">
            Log in
          </Link>{" "}
          to manage hospitals.
        </p>
      </PageContainer>
    );
  }

  const hospitals = hospitalsQuery.data ?? [];
  const togglingId = toggleMutation.isPending ? toggleMutation.variables.id : null;

  return (
    <PageContainer>
      <PageHeader title="Hospitals" description="Manage hospitals and administrators." />

      <div className="mb-6 space-y-3">
        {message && <Alert variant="success">{message}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}
        {hospitalsQuery.isError && (
          // A logged-in session exists but loading hospitals failed — show that
          // clearly rather than silently leaving the list empty with no explanation.
          <Alert variant="error">{hospitalsQuery.error.message || "Could not load hospitals. Try refreshing."}</Alert>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Create a hospital" icon={PlusCircle}>
          <form onSubmit={handleCreate} className="space-y-4">
            <TextField
              label="Hospital name"
              value={hospitalName}
              onChange={(e) => setHospitalName(e.target.value)}
              required
            />
            <TextField
              label="Administrator name"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              required
            />
            <TextField
              label="Administrator email"
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
            />

            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create hospital"}
            </Button>
          </form>
        </Card>

        <Card title="Existing hospitals" icon={Building2}>
          {hospitalsQuery.isPending ? (
            <LoadingState />
          ) : hospitals.length === 0 ? (
            <EmptyState title="No hospitals yet" />
          ) : (
            <ul className="divide-y divide-cp-border dark:divide-cp-border-dark">
              {hospitals.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-cp-text dark:text-cp-text-dark">{h.name}</p>
                      {!h.isActive && <Badge tone="neutral">disabled</Badge>}
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-cp-text-muted dark:text-cp-text-muted-dark">Hospital ID: {h.id}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="secondary"
                      disabled={togglingId === h.id}
                      onClick={() => handleToggleActive(h)}
                    >
                      {togglingId === h.id ? "..." : h.isActive ? "Disable" : "Enable"}
                    </Button>
                    <Button variant="destructive-subtle" onClick={() => openDeleteConfirm(h)}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={!!hospitalToDelete} onClose={() => setHospitalToDelete(null)} title="Delete hospital">
        <div className="space-y-3">
          <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
            Delete <span className="font-medium text-cp-text dark:text-cp-text-dark">{hospitalToDelete?.name}</span>?
            This permanently deletes the hospital along with every staff and admin membership and every access role
            tied to it. Their accounts stay — they just lose access to this hospital. This cannot be undone.
          </p>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setHospitalToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={handleConfirmDelete}>
              {deleteMutation.isPending ? "Deleting..." : "Delete hospital"}
            </Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
