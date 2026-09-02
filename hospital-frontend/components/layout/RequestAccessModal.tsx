"use client";

import { useEffect, useRef, useState } from "react";
import type { Hospital } from "@shared/types";
import { listAllHospitals, listMyAccessRequests, requestHospitalAccess } from "@/lib/api";
import { Alert, Button, Input, Label, LoadingState, Modal } from "@/components/ui";

interface RequestAccessModalProps {
  open: boolean;
  onClose: () => void;
}

// Self-contained: fetches its own data and owns its own form state, so it
// can be triggered from the account menu (in the Header, present on every
// page) without coupling to whichever page happens to be mounted. Moved
// here from being a page section on /access — see DESIGN.md for the
// account-nav vs. hospital-nav split this reflects.
export default function RequestAccessModal({ open, onClose }: RequestAccessModalProps) {
  const [loading, setLoading] = useState(false);
  const [allHospitals, setAllHospitals] = useState<Hospital[]>([]);
  const [requestedHospitalIds, setRequestedHospitalIds] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState("");
  const [selectedHospitalId, setSelectedHospitalId] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(true);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    // Reset on every open so a previous visit's search/selection doesn't
    // linger — synchronizing form state to the modal opening, not a
    // derived/cascading update.
    /* eslint-disable react-hooks/set-state-in-effect -- resets form state in response to the modal opening, not a cascading update */
    setSearch("");
    setSelectedHospitalId("");
    setShowSuggestions(true);
    setMessage("");
    setError("");
    setLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    Promise.all([listAllHospitals(), listMyAccessRequests()])
      .then(([hospitals, myRequests]) => {
        setAllHospitals(hospitals);
        setRequestedHospitalIds(new Set(myRequests.map((r) => r.hospitalId)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load hospitals."))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // A hospital you already have any request/membership for isn't "available"
  // to request again — the backend would just reject it as a duplicate.
  const availableHospitals = allHospitals.filter((h) => !requestedHospitalIds.has(h.id));
  const filteredHospitals = availableHospitals.filter((h) =>
    h.name.toLowerCase().includes(search.toLowerCase())
  );

  function handlePick(hospital: Hospital) {
    setSelectedHospitalId(hospital.id);
    setSearch(hospital.name);
    setShowSuggestions(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!selectedHospitalId) {
      setError("Pick a hospital from the list first.");
      return;
    }
    setSubmitting(true);
    try {
      await requestHospitalAccess(selectedHospitalId);
      setMessage(`Requested access to ${search}.`);
      setRequestedHospitalIds((prev) => new Set(prev).add(selectedHospitalId));
      setSearch("");
      setSelectedHospitalId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Request hospital access">
      {loading ? (
        <LoadingState />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {availableHospitals.length} hospital(s) available to join.
          </p>

          <div>
            <Label htmlFor="account-hospital-search">Search hospitals</Label>
            <div ref={searchBoxRef} className="relative">
              <Input
                id="account-hospital-search"
                placeholder="Search hospitals..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
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
                          onClick={() => handlePick(h)}
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

          {message && <Alert variant="success">{message}</Alert>}
          {error && <Alert variant="error">{error}</Alert>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              {message ? "Done" : "Cancel"}
            </Button>
            <Button type="submit" disabled={!selectedHospitalId || submitting}>
              {submitting ? "Requesting..." : "Request access"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
