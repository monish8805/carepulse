import { Outlet, createFileRoute } from "@tanstack/react-router";
import HospitalLayout from "@/components/layout/HospitalLayout";

// A pathless layout route, not a URL segment — "/" and "/access" are
// unaffected. Keeps the shell out of /login, /register, /forgot-password,
// which stay as bare pages outside it.
export const Route = createFileRoute("/_portal")({
  component: PortalLayout,
});

function PortalLayout() {
  return (
    <HospitalLayout>
      <Outlet />
    </HospitalLayout>
  );
}
