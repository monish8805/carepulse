import HospitalLayout from "@/components/layout/HospitalLayout";

// A route group, not a URL segment — "/" and "/access" are unaffected.
// Keeps the shell out of /login, /register, /forgot-password, which stay
// as bare pages outside this group.
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <HospitalLayout>{children}</HospitalLayout>;
}
