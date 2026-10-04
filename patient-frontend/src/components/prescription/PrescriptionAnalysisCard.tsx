import { Lock, Sparkles } from "lucide-react";
import { Badge, Button, Card } from "@carepulse/ui";
import { PRESCRIPTION_ANALYSIS_AVAILABLE } from "@/lib/prescription";

// Where the future AI analysis starts. Disabled on purpose and labelled as
// such — it must never look like a feature that works today. When
// analyzePrescription() is implemented, enable this and call it.
export default function PrescriptionAnalysisCard() {
  return (
    <Card title="Prescription Analysis" icon={Sparkles} iconTone="neutral">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Badge tone="neutral">Coming soon</Badge>
          <p className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
            AI analysis will be available soon. Your image has not been sent anywhere or read by any AI.
          </p>
        </div>
        {/* Grey, locked and faded rather than the primary style: a disabled
            primary button still reads as clickable teal in dark mode. */}
        <Button variant="secondary" disabled={!PRESCRIPTION_ANALYSIS_AVAILABLE} className="disabled:opacity-60">
          <Lock className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
          Analyze Prescription
        </Button>
      </div>
    </Card>
  );
}
