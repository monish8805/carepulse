import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSession } from "@carepulse/portal";
import { LoadingState, PageContainer, PageHeader } from "@carepulse/ui";
import PrescriptionUpload from "@/components/prescription/PrescriptionUpload";
import type { SelectedImage } from "@/components/prescription/PrescriptionUpload";
import PrescriptionAnalysisCard from "@/components/prescription/PrescriptionAnalysisCard";
import ExtractedPrescriptionTable from "@/components/prescription/ExtractedPrescriptionTable";

// Upload a handwritten prescription, ready for future AI extraction (see
// src/lib/prescription.ts for the planned pipeline). Frontend only for now:
// the image lives in this page's state as a local object URL and is never
// uploaded, stored or analysed.
export const Route = createFileRoute("/_portal/prescription")({
  component: PrescriptionPage,
});

function PrescriptionPage() {
  const session = useSession();
  const [image, setImage] = useState<SelectedImage | null>(null);

  // Object URLs hold the image in memory until revoked: release the previous
  // one whenever it's replaced or removed, and the last one on leaving the page.
  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.url);
  }, [image]);

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
      <PageHeader
        title="Prescription"
        description="Add a photo of a handwritten prescription. Reading it automatically is coming later."
      />
      <div className="space-y-6">
        <PrescriptionUpload
          image={image}
          onSelect={(file) => setImage({ file, url: URL.createObjectURL(file) })}
          onRemove={() => setImage(null)}
        />
        {image && <PrescriptionAnalysisCard />}
        <ExtractedPrescriptionTable medicines={null} />
      </div>
    </PageContainer>
  );
}
