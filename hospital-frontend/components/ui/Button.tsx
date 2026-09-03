import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "destructive" | "destructive-subtle" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-cp-primary text-white hover:bg-cp-primary-hover disabled:bg-cp-primary/40 dark:bg-cp-primary-dark dark:hover:bg-cp-primary-hover-dark dark:disabled:bg-cp-primary-dark/40",
  secondary:
    "border border-cp-border bg-cp-card text-cp-text hover:border-cp-input-border hover:bg-cp-workspace disabled:text-cp-text-muted dark:border-cp-border-dark dark:bg-cp-card-dark dark:text-cp-text-dark dark:hover:bg-cp-workspace-dark",
  // Error/destructive has no CarePulse value for a solid fill (light or
  // dark) — kept as the existing plain Tailwind red, unchanged.
  destructive: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  // Low-emphasis row variant — for a destructive action inline in a list row
  // (e.g. "Remove"/"Reject"), as opposed to the full-weight `destructive`
  // reserved for a confirmation step's final button.
  "destructive-subtle":
    "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:text-red-300 disabled:bg-red-50/50 dark:border-cp-error-text-dark/30 dark:bg-cp-error-bg-dark dark:text-cp-error-text-dark dark:hover:bg-cp-error-bg-dark/70",
  ghost:
    "text-cp-text-muted hover:bg-cp-workspace disabled:text-cp-text-subtle dark:text-cp-text-muted-dark dark:hover:bg-cp-workspace-dark",
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
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cp-primary disabled:cursor-not-allowed dark:focus-visible:outline-cp-primary-dark ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
