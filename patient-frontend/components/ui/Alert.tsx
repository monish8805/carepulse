import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type AlertVariant = "error" | "success" | "info";

interface AlertProps {
  children: ReactNode;
  variant?: AlertVariant;
}

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  error:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400",
  success:
    "border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-400",
  info: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-400",
};

const VARIANT_ICON_CLASSES: Record<AlertVariant, string> = {
  error: "text-red-600 dark:text-red-400",
  success: "text-green-600 dark:text-green-400",
  info: "text-teal-600 dark:text-teal-400",
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
