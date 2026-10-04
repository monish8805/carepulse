import Alert from "./Alert";

// Shown wherever a sepsis risk score or alert appears — the model's own
// disclaimer (ml-service/sepsis_core.py's DISCLAIMER), which every one of
// its responses carries.
export default function ResearchDisclaimer() {
  return (
    <Alert variant="info">
      Sepsis risk comes from a research prototype trained on retrospective ICU data (PhysioNet/CinC 2019). It is not
      a diagnostic tool and not clinically validated — do not use it for patient care decisions.
    </Alert>
  );
}
