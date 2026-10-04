import { UserRound } from "lucide-react";
import type { AuthUser } from "@carepulse/api/types";
import { Card } from "@carepulse/ui";
import PatientProfileForm from "./PatientProfileForm";

// Shown by PatientLayout in place of every page until the patient has saved a
// date of birth, gender and blood type. A UX requirement, not a security boundary —
// nothing server-side depends on these fields being set.
export default function CompleteProfileGate({ user }: { user: AuthUser }) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12">
      <Card
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description="Before you continue, tell us your date of birth, gender and blood type. Your doctors see them next to your vitals, and you can change them later."
        icon={UserRound}
      >
        <PatientProfileForm user={user} submitLabel="Save and continue" />
      </Card>
    </div>
  );
}
