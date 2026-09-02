import type { LucideIcon } from "lucide-react";

type IconBadgeTone = "indigo" | "blue" | "teal" | "amber" | "violet";

interface IconBadgeProps {
  icon: LucideIcon;
  tone?: IconBadgeTone;
  className?: string;
}

const TONE_CLASSES: Record<IconBadgeTone, string> = {
  indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400",
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
  teal: "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
};

// A small colour-tinted icon container, used before a Card/section title —
// purely decorative (never the only way to identify what a section is for;
// the title text is always right next to it).
export default function IconBadge({ icon: Icon, tone = "indigo", className = "" }: IconBadgeProps) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[tone]} ${className}`}
    >
      <Icon className="h-5 w-5" aria-hidden="true" strokeWidth={2} />
    </span>
  );
}
