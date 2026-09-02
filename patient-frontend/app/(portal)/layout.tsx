import PatientLayout from "@/components/layout/PatientLayout";

// A route group, not a URL segment — "/" is unaffected. Keeps the shell out
// of /login, /register, /forgot-password, which stay bare pages outside
// this group.
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PatientLayout>{children}</PatientLayout>;
}
