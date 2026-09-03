import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import IconBadge from "./IconBadge";

type CardIconTone = "teal" | "neutral" | "blue" | "amber" | "violet";

interface CardProps {
  title?: string;
  description?: string;
  // Decorative only — shown next to the title when both are present.
  icon?: LucideIcon;
  // Defaults to the accent (teal). Use "neutral" for a deliberately
  // deprioritized card (e.g. a "System" status card next to a primary one).
  iconTone?: CardIconTone;
  // Optional — a header-only card (title/description/icon, no body) is a
  // legitimate pattern for a non-actionable summary (e.g. a "see this
  // elsewhere" pointer card).
  children?: ReactNode;
  className?: string;
}

export default function Card({ title, description, icon, iconTone, children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-cp-border bg-cp-card p-5 shadow-sm dark:border-cp-border-dark dark:bg-cp-card-dark ${className}`}
    >
      {(title || description) && (
        <div className="mb-4 flex items-start gap-3">
          {icon && <IconBadge icon={icon} tone={iconTone} />}
          <div className="min-w-0">
            {title && (
              <h3 className="text-base font-semibold text-cp-text dark:text-cp-text-dark">{title}</h3>
            )}
            {description && (
              <p className="mt-1 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">{description}</p>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
