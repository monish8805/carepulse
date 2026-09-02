import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "destructive" | "destructive-subtle" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-teal-700 text-white hover:bg-teal-800 disabled:bg-teal-300 dark:disabled:bg-teal-900/60",
  secondary:
    "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
  destructive: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  // Low-emphasis row variant — for a destructive action inline in a list row
  // (e.g. "Remove"/"Reject"), as opposed to the full-weight `destructive`
  // reserved for a confirmation step's final button.
  "destructive-subtle":
    "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:text-red-300 disabled:bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50",
  ghost:
    "text-slate-600 hover:bg-slate-100 disabled:text-slate-300 dark:text-slate-300 dark:hover:bg-slate-800",
};

// The one button primitive for all of CarePulse — variant covers every case
// used across the app today (primary action, secondary/neutral, destructive
// like reject/logout, and ghost for low-emphasis controls like collapse toggles).
export default function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
