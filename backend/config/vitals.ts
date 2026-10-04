import { DataCategory } from "./dataCategories";

// The seven hourly vitals the sepsis model (ml-service/) is trained on, with
// the plausible ranges from its artifacts/config.json. These names are the
// model's own field names, sent to it unchanged — keep them in sync with that
// file if the model is ever retrained on different inputs.
export const VITALS = ["HR", "O2Sat", "Temp", "SBP", "MAP", "DBP", "Resp"] as const;

export type Vital = (typeof VITALS)[number];

export const VITAL_RANGES: Record<Vital, { min: number; max: number }> = {
  HR: { min: 20, max: 300 },
  O2Sat: { min: 50, max: 100 },
  Temp: { min: 30, max: 43 },
  SBP: { min: 40, max: 280 },
  MAP: { min: 20, max: 220 },
  DBP: { min: 10, max: 200 },
  Resp: { min: 3, max: 70 },
};

// The consent category a doctor needs from the patient to see this data —
// readings, the sepsis risk scored from them, and alerts raised on that score.
// This feed is hourly, model-driven monitoring, i.e. "continuous" vitals; a
// patient who shared only "vitals.occasional" has not shared it.
export const VITALS_CONSENT_CATEGORY: DataCategory = "vitals.continuous";
