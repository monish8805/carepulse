import { Outlet, createFileRoute } from "@tanstack/react-router";
import PatientLayout from "@/components/layout/PatientLayout";

// A pathless layout route, not a URL segment — "/" is unaffected. Keeps the
// shell out of /login, /register, /forgot-password, which stay bare pages
// outside it.
export const Route = createFileRoute("/_portal")({
  component: PortalLayout,
});

function PortalLayout() {
  return (
    <PatientLayout>
      <Outlet />
    </PatientLayout>
  );
}
