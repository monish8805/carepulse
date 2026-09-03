"use client";

import { useEffect, useId } from "react";
import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

// Minimal dialog primitive: overlay click, Escape, and a close button all
// call onClose — the caller owns the open state (usually a Layout, since a
// page-level component can't render above the shell that triggers it).
export default function Modal({ open, onClose, title, children }: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-xl border border-cp-border bg-cp-card p-5 shadow-lg dark:border-cp-border-dark dark:bg-cp-card-dark"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-base font-semibold text-cp-text dark:text-cp-text-dark">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-cp-text-muted hover:bg-cp-workspace focus-visible:outline focus-visible:outline-2 focus-visible:outline-cp-primary dark:text-cp-text-muted-dark dark:hover:bg-cp-workspace-dark"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
