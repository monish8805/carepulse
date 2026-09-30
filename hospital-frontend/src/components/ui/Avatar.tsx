interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
};

// One fixed CarePulse avatar treatment (DESIGN.md gives a single avatar
// color, not a palette) — every avatar looks the same regardless of name;
// purely decorative, never used to convey meaning the way Badge's tone does.
const AVATAR_CLASSES = "bg-cp-avatar text-cp-primary dark:bg-cp-avatar-dark dark:text-cp-primary-dark";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default function Avatar({ name, size = "md", className = "" }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZE_CLASSES[size]} ${AVATAR_CLASSES} ${className}`}
    >
      {getInitials(name)}
    </span>
  );
}
