import OwnerLayout from "@/components/layout/OwnerLayout";

// A route group, not a URL segment — "/" and "/hospitals" are unaffected.
// Keeps the shell out of /login, which stays a bare page outside this group.
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <OwnerLayout>{children}</OwnerLayout>;
}
