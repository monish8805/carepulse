import { ClipboardList } from "lucide-react";
import { Card } from "@carepulse/ui";
import type { ExtractedMedicine } from "@/lib/prescription";

const COLUMNS: { key: keyof ExtractedMedicine; label: string }[] = [
  { key: "medicine", label: "Medicine" },
  { key: "dosage", label: "Dosage" },
  { key: "frequency", label: "Frequency" },
  { key: "duration", label: "Duration" },
];

const EMPTY_ROW: ExtractedMedicine = { medicine: null, dosage: null, frequency: null, duration: null };

// The extracted prescription, in the shape analyzePrescription() will return.
// With no result yet (always, for now) it shows one placeholder row, so the
// layout of the future result is visible. A field the model couldn't read
// stays "—", never a guess.
export default function ExtractedPrescriptionTable({ medicines }: { medicines: ExtractedMedicine[] | null }) {
  const rows = medicines && medicines.length > 0 ? medicines : [EMPTY_ROW];
  return (
    <Card title="Extracted Prescription" icon={ClipboardList}>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="border-b border-cp-border text-xs text-cp-text-muted dark:border-cp-border-dark dark:text-cp-text-muted-dark">
              {COLUMNS.map((column) => (
                <th key={column.key} className="py-2 pr-3 font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-cp-border dark:divide-cp-border-dark">
            {rows.map((row, index) => (
              <tr key={index} className="text-cp-text dark:text-cp-text-dark">
                {COLUMNS.map((column) => (
                  <td key={column.key} className="py-3 pr-3">
                    {row[column.key] ?? <span className="text-cp-text-subtle dark:text-cp-text-subtle-dark">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
        AI-extracted information will appear here after analysis.
      </p>
    </Card>
  );
}
