// Prescription analysis — the shape of the future pipeline:
//
//   prescription image → backend upload → OCR / handwriting model → extracted
//   prescription → this page
//
// None of it exists yet. The page keeps the chosen image in browser memory
// only; nothing is uploaded, stored or read. When the backend and model land,
// analyzePrescription() is the one place that changes: upload the file, return
// the extracted medicines, and enable the page's Analyze button
// (PRESCRIPTION_ANALYSIS_AVAILABLE).

export const PRESCRIPTION_ANALYSIS_AVAILABLE = false;

// One line of a prescription as the model will return it. Each field is
// optional text: handwriting is often partly unreadable, and a missing field
// must stay visibly missing rather than be guessed.
export interface ExtractedMedicine {
  medicine: string | null;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
}

export interface PrescriptionAnalysis {
  medicines: ExtractedMedicine[];
}

export async function analyzePrescription(image: File): Promise<PrescriptionAnalysis> {
  throw new Error(`Can't analyse "${image.name}": prescription analysis isn't available yet.`);
}
