import { createFileRoute, Link } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import { useSession } from "@carepulse/portal";
import { Card, LoadingState, PageContainer, PageHeader, useToast } from "@carepulse/ui";
import PatientProfileForm from "@/components/profile/PatientProfileForm";

export const Route = createFileRoute("/_portal/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const session = useSession();
  const toast = useToast();
  const user = session.data;

  if (session.isPending) {
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }

  if (!user) {
    return (
      <PageContainer>
        <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
          <Link to="/login" className="font-medium text-cp-primary hover:underline dark:text-cp-primary-dark">
            Log in
          </Link>{" "}
          first.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Profile"
        description="Your details are shown to a doctor only for data you have chosen to share with them."
      />
      <Card title={user.name} description={user.email} icon={UserRound}>
        <PatientProfileForm user={user} submitLabel="Save" onSaved={() => toast.success("Profile updated.")} />
      </Card>
    </PageContainer>
  );
}
