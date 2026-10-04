import { createFileRoute, Link } from "@tanstack/react-router";
import { ChestXrayUpload, useSession } from "@carepulse/portal";
import { LoadingState, PageContainer, PageHeader } from "@carepulse/ui";

// A placeholder for future chest X-ray analysis. The image is previewed in
// this browser only — nothing is uploaded, stored or analysed yet.
export const Route = createFileRoute("/_portal/xray")({
  component: XrayPage,
});

function XrayPage() {
  const session = useSession();

  if (session.isPending) {
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }

  if (!session.data) {
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
      <PageHeader title="Chest X-ray" description="Automated X-ray analysis is coming later. For now you can preview an image." />
      <ChestXrayUpload />
    </PageContainer>
  );
}
