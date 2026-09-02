import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import IconBadge from "./IconBadge";

interface CardProps {
  title?: string;
  description?: string;
  // Decorative only — shown next to the title when both are present.
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}

export default function Card({ title, description, icon, children, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {(title || description) && (
        <div className="mb-4 flex items-start gap-3">
          {icon && <IconBadge icon={icon} />}
          <div className="min-w-0">
            {title && (
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
            )}
            {description && (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
