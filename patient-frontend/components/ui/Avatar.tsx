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

// Small fixed palette so the same name always maps to the same color (a
// simple hash of the name picks the index) — purely decorative, never used
// to convey meaning the way Badge's tone does.
const PALETTE = [
  "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400",
  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
];

function paletteIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % PALETTE.length;
  }
  return Math.abs(hash) % PALETTE.length;
}

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
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZE_CLASSES[size]} ${PALETTE[paletteIndex(name)]} ${className}`}
    >
      {getInitials(name)}
    </span>
  );
}
