import { Outlet, createFileRoute } from "@tanstack/react-router";
import OwnerLayout from "@/components/layout/OwnerLayout";

// A pathless layout route, not a URL segment — "/" and "/hospitals" are
// unaffected. Keeps the shell out of /login, which stays a bare page outside it.
export const Route = createFileRoute("/_portal")({
  component: PortalLayout,
});

function PortalLayout() {
  return (
    <OwnerLayout>
      <Outlet />
    </OwnerLayout>
  );
}
