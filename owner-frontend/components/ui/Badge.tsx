import type { ReactNode } from "react";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  success: "bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  danger: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  info: "bg-teal-50 text-teal-800 dark:bg-teal-900/40 dark:text-teal-400",
};

const DOT_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-slate-400 dark:bg-slate-500",
  success: "bg-green-600 dark:bg-green-400",
  warning: "bg-amber-600 dark:bg-amber-400",
  danger: "bg-red-500 dark:bg-red-400",
  info: "bg-teal-600 dark:bg-teal-400",
};

export default function Badge({ children, tone = "neutral" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE_CLASSES[tone]}`}
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
