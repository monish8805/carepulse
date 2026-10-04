import { useId, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
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
  // Lets the reader hide the body (e.g. long charts/tables) and bring it back.
  // The title becomes the toggle button, with a visible Hide/Show label. Starts
  // open; the choice isn't remembered across pages.
  collapsible?: boolean;
}

export default function Card({
  title,
  description,
  icon,
  iconTone,
  children,
  className = "",
  collapsible = false,
}: CardProps) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  const showBody = !collapsible || open;

  return (
    <div
      className={`rounded-xl border border-cp-border bg-cp-card p-5 shadow-sm dark:border-cp-border-dark dark:bg-cp-card-dark ${className}`}
    >
      {(title || description) && (
        <div className={`flex items-start gap-3 ${showBody ? "mb-4" : ""}`}>
          {icon && <IconBadge icon={icon} tone={iconTone} />}
          <div className="min-w-0 flex-1">
            {title &&
              (collapsible ? (
                <h3 className="text-base font-semibold text-cp-text dark:text-cp-text-dark">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={bodyId}
                    onClick={() => setOpen((value) => !value)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cp-primary dark:focus-visible:outline-cp-primary-dark"
                  >
                    <span>{title}</span>
                    <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-cp-primary dark:text-cp-primary-dark">
                      {open ? "Hide" : "Show"}
                      <ChevronDown
                        aria-hidden="true"
                        className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
                        strokeWidth={2}
                      />
                    </span>
                  </button>
                </h3>
              ) : (
                <h3 className="text-base font-semibold text-cp-text dark:text-cp-text-dark">{title}</h3>
              ))}
            {description && (
              <p className="mt-1 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">{description}</p>
            )}
          </div>
        </div>
      )}
      {showBody && (collapsible ? <div id={bodyId}>{children}</div> : children)}
    </div>
  );
}
