import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BLOOD_TYPES, GENDERS } from "@carepulse/api/types";
import type { AuthUser, BloodType, Gender } from "@carepulse/api/types";
import { genderLabel } from "@carepulse/portal";
import { Alert, Button, Label, Select, TextField } from "@carepulse/ui";
import { updatePatientProfile } from "@/lib/api";

interface PatientProfileFormProps {
  user: AuthUser;
  submitLabel: string;
  onSaved?: () => void;
  onCancel?: () => void;
}

// Date of birth, gender and blood type (required) plus an optional guardian
// phone. Used by the first-login gate (CompleteProfileGate) and by the home
// page's profile edit. Saving writes the returned user straight into the
// cached session, which is what lets PatientLayout open the portal without
// another round-trip.
export default function PatientProfileForm({ user, submitLabel, onSaved, onCancel }: PatientProfileFormProps) {
  const queryClient = useQueryClient();
  const genderId = useId();
  const bloodTypeId = useId();
  const [dateOfBirth, setDateOfBirth] = useState(user.dateOfBirth?.slice(0, 10) ?? "");
  const [gender, setGender] = useState<Gender | "">(user.gender ?? "");
  const [bloodType, setBloodType] = useState<BloodType | "">(user.bloodType ?? "");
  const [guardianPhone, setGuardianPhone] = useState(user.guardianPhone ?? "");
  const today = new Date().toISOString().slice(0, 10);

  const saveMutation = useMutation({
    mutationFn: () => updatePatientProfile({ dateOfBirth, gender, bloodType, guardianPhone }),
    onSuccess: ({ user: saved }) => {
      queryClient.setQueryData(["session"], saved);
      onSaved?.();
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        saveMutation.mutate();
      }}
    >
      {saveMutation.isError && <Alert variant="error">{saveMutation.error.message}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Date of birth"
          type="date"
          required
          max={today}
          value={dateOfBirth}
          onChange={(event) => setDateOfBirth(event.target.value)}
        />
        <div>
          <Label htmlFor={genderId}>Gender</Label>
          <Select
            id={genderId}
            required
            value={gender}
            onChange={(event) => setGender(event.target.value as Gender)}
          >
            <option value="" disabled>
              Select…
            </option>
            {GENDERS.map((option) => (
              <option key={option} value={option}>
                {genderLabel(option)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={bloodTypeId}>Blood type</Label>
          <Select
            id={bloodTypeId}
            required
            value={bloodType}
            onChange={(event) => setBloodType(event.target.value as BloodType)}
          >
            <option value="" disabled>
              Select…
            </option>
            {BLOOD_TYPES.map((option) => (
              <option key={option} value={option}>
                {option === "unknown" ? "Don't know" : option}
              </option>
            ))}
          </Select>
        </div>
        <TextField
          label="Guardian phone (optional)"
          type="tel"
          autoComplete="off"
          placeholder="+91 98765 43210"
          hint="Someone your care team can contact for you."
          value={guardianPhone}
          onChange={(event) => setGuardianPhone(event.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={saveMutation.isPending}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={saveMutation.isPending || !dateOfBirth || !gender || !bloodType}>
          {saveMutation.isPending ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
