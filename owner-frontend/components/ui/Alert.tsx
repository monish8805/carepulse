import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type AlertVariant = "error" | "success" | "info";

interface AlertProps {
  children: ReactNode;
  variant?: AlertVariant;
}

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  // Error/destructive has no CarePulse light value — kept as existing red; dark uses the given error tokens.
  error: "border-red-200 bg-red-50 text-red-700 dark:border-cp-error-text-dark/30 dark:bg-cp-error-bg-dark dark:text-cp-error-text-dark",
  success:
    "border-cp-success-text/20 bg-cp-success-bg text-cp-success-text dark:border-cp-success-text-dark/30 dark:bg-cp-success-bg-dark dark:text-cp-success-text-dark",
  info: "border-cp-focus-border/40 bg-cp-icon-soft text-cp-primary dark:border-cp-primary-dark/40 dark:bg-cp-icon-soft-dark dark:text-cp-primary-dark",
};

const VARIANT_ICON_CLASSES: Record<AlertVariant, string> = {
  error: "text-red-600 dark:text-cp-error-text-dark",
  success: "text-cp-success-text dark:text-cp-success-text-dark",
  info: "text-cp-primary dark:text-cp-primary-dark",
};

const VARIANT_ICONS: Record<AlertVariant, LucideIcon> = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

// Replaces the old `<p style={{color:"red"}}>...</p>` / green equivalents —
// error uses role="alert" so screen readers announce it immediately.
export default function Alert({ children, variant = "info" }: AlertProps) {
  const Icon = VARIANT_ICONS[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${VARIANT_CLASSES[variant]}`}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${VARIANT_ICON_CLASSES[variant]}`} aria-hidden="true" strokeWidth={2} />
      <div>{children}</div>
    </div>
  );
}
