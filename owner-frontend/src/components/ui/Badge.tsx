import type { ReactNode } from "react";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-cp-workspace text-cp-text-muted dark:bg-cp-workspace-dark dark:text-cp-text-muted-dark",
  success: "bg-cp-success-bg text-cp-success-text dark:bg-cp-success-bg-dark dark:text-cp-success-text-dark",
  warning: "bg-cp-pending-bg text-cp-pending-text dark:bg-cp-pending-bg-dark dark:text-cp-pending-text-dark",
  // Error/destructive has no CarePulse light value — kept as existing red; dark uses the given error tokens.
  danger: "bg-red-100 text-red-700 dark:bg-cp-error-bg-dark dark:text-cp-error-text-dark",
  info: "bg-cp-icon-soft text-cp-primary dark:bg-cp-icon-soft-dark dark:text-cp-primary-dark",
};

const DOT_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-cp-text-subtle dark:bg-cp-text-subtle-dark",
  success: "bg-cp-success-text dark:bg-cp-success-text-dark",
  warning: "bg-cp-pending-text dark:bg-cp-pending-text-dark",
  danger: "bg-red-500 dark:bg-cp-error-text-dark",
  info: "bg-cp-primary dark:bg-cp-primary-dark",
};

export default function Badge({ children, tone = "neutral" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASSES[tone]}`} />
      {children}
    </span>
  );
}

// Maps the status/role strings that already come back from the backend
// (HospitalMembership.status, .role) to a tone — display only, never used
// for any access decision.
export function toneForStatus(status: string): BadgeTone {
  switch (status) {
    case "active":
      return "success";
    case "pending":
      return "warning";
    case "rejected":
      return "danger";
    case "admin":
      return "info";
    default:
      return "neutral";
  }
}
