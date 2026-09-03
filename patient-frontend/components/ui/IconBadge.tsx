import type { LucideIcon } from "lucide-react";

type IconBadgeTone = "teal" | "neutral" | "blue" | "amber" | "violet";

interface IconBadgeProps {
  icon: LucideIcon;
  tone?: IconBadgeTone;
  className?: string;
}

// teal/amber are exact CarePulse tokens (DESIGN.md); blue/violet are one-off
// accents outside the given system, left as literal Tailwind classes.
const TONE_CLASSES: Record<IconBadgeTone, string> = {
  teal: "bg-cp-icon-soft text-cp-primary dark:bg-cp-icon-soft-dark dark:text-cp-primary-dark",
  neutral: "bg-cp-workspace text-cp-text-muted dark:bg-cp-workspace-dark dark:text-cp-text-muted-dark",
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
  amber: "bg-cp-pending-bg text-cp-pending-text dark:bg-cp-pending-bg-dark dark:text-cp-pending-text-dark",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
};

// A small colour-tinted icon container, used before a Card/section title —
// purely decorative (never the only way to identify what a section is for;
// the title text is always right next to it).
export default function IconBadge({ icon: Icon, tone = "teal", className = "" }: IconBadgeProps) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[tone]} ${className}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
    </span>
  );
}
