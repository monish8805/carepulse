import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusCircle, Building2 } from "lucide-react";
import type { Hospital } from "@carepulse/api/types";
import { createHospital, disableHospital, enableHospital, deleteHospital } from "@/lib/api";
import { useSession, prefetch } from "@carepulse/portal";
import { hospitalsQuery as hospitalsQueryOptions } from "@/lib/queries";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  Modal,
  SkeletonList,
  PageContainer,
  PageHeader,
  TextField,
  useToast,
} from "@carepulse/ui";

export const Route = createFileRoute("/_portal/hospitals")({
  loader: ({ context }) => prefetch(context.queryClient, hospitalsQueryOptions),
  component: HospitalsPage,
});

function HospitalsPage() {
  const queryClient = useQueryClient();
  const session = useSession();
  const hospitalsQuery = useQuery({ ...hospitalsQueryOptions, enabled: !!session.data });

  const toast = useToast();

  const [hospitalName, setHospitalName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [createError, setCreateError] = useState("");
  const [hospitalToDelete, setHospitalToDelete] = useState<Hospital | null>(null);

  const hospitalsKey = hospitalsQueryOptions.queryKey;

  // Applies a change to the cached list immediately, returning the previous
  // list so a failed request can put it back (see rollback below).
  async function updateListOptimistically(change: (list: Hospital[]) => Hospital[]) {
    await queryClient.cancelQueries({ queryKey: hospitalsKey });
    const previous = queryClient.getQueryData(hospitalsKey);
    queryClient.setQueryData(hospitalsKey, (list) => change(list ?? []));
    return { previous };
  }

  function rollback(err: Error, context: { previous?: Hospital[] } | undefined) {
    queryClient.setQueryData(hospitalsKey, context?.previous);
    toast.error(err.message || "Something went wrong.");
  }

  function refreshHospitals() {
    return queryClient.invalidateQueries({ queryKey: hospitalsKey });
  }

  const createMutation = useMutation({
    mutationFn: createHospital,
    onSuccess: (result) => {
      toast.success(`Created "${result.hospital.name}". Login credentials were emailed to ${result.admin.email}.`);
      setHospitalName("");
      setAdminName("");
      setAdminEmail("");
      return refreshHospitals();
    },
    onError: (err) => setCreateError(err.message || "Could not create hospital."),
  });

  // Toggles between disable/enable depending on the hospital's current state
  // — a reversible pause, distinct from Delete below. The row flips instantly;
  // the server's answer then confirms or reverts it.
  const toggleMutation = useMutation({
    mutationFn: (hospital: Hospital) => (hospital.isActive ? disableHospital(hospital.id) : enableHospital(hospital.id)),
    onMutate: (hospital) =>
      updateListOptimistically((list) =>
        list.map((h) => (h.id === hospital.id ? { ...h, isActive: !hospital.isActive } : h))
      ),
    onSuccess: (_, hospital) => toast.success(`${hospital.isActive ? "Disabled" : "Enabled"} "${hospital.name}".`),
    onError: (err, _, context) => rollback(err, context),
    onSettled: refreshHospitals,
  });

  const deleteMutation = useMutation({
    mutationFn: (hospital: Hospital) => deleteHospital(hospital.id),
    onMutate: (hospital) => updateListOptimistically((list) => list.filter((h) => h.id !== hospital.id)),
    onSuccess: (_, hospital) => toast.success(`Deleted "${hospital.name}".`),
    onError: (err, _, context) => rollback(err, context),
    onSettled: refreshHospitals,
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    createMutation.mutate({ hospitalName, adminName, adminEmail });
  }

  function handleConfirmDelete() {
    if (!hospitalToDelete) return;
    deleteMutation.mutate(hospitalToDelete);
    setHospitalToDelete(null);
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
  // Guards against a second click racing the first while its request is out.
  const togglingId = toggleMutation.isPending ? toggleMutation.variables.id : null;

  return (
    <PageContainer>
      <PageHeader title="Hospitals" description="Manage hospitals and administrators." />

      <div className="mb-6 space-y-3">
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

            {createError && <Alert variant="error">{createError}</Alert>}

            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create hospital"}
            </Button>
          </form>
        </Card>

        <Card title="Existing hospitals" icon={Building2}>
          {hospitalsQuery.isPending ? (
            <SkeletonList />
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
                      onClick={() => toggleMutation.mutate(h)}
                    >
                      {h.isActive ? "Disable" : "Enable"}
                    </Button>
                    <Button variant="destructive-subtle" onClick={() => setHospitalToDelete(h)}>
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
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setHospitalToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete hospital
            </Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
