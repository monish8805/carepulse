import { DataCategory } from "./dataCategories";

// The four hourly vitals the sepsis model (ml-service/, Stage 1: ICU data) is
// trained on, with the plausible ranges from its artifacts/config.json. These
// names are the model's own field names, sent to it unchanged — keep them in
// sync with that file if the model is ever retrained on different inputs. The
// model also takes the patient's age and gender (see inference.service.ts).
export const VITALS = ["HR", "O2Sat", "Temp", "Resp"] as const;

export type Vital = (typeof VITALS)[number];

export const VITAL_RANGES: Record<Vital, { min: number; max: number }> = {
  HR: { min: 20, max: 300 },
  O2Sat: { min: 50, max: 100 },
  Temp: { min: 30, max: 43 },
  Resp: { min: 3, max: 70 },
};

// The consent category a doctor needs from the patient to see this data —
// readings, the sepsis risk scored from them, and alerts raised on that score.
// This feed is hourly, model-driven monitoring, i.e. "continuous" vitals; a
// patient who shared only "vitals.occasional" has not shared it.
export const VITALS_CONSENT_CATEGORY: DataCategory = "vitals.continuous";

// Usual adult resting ranges, drawn as a faint band behind each vital on the
// Sepsis Watch. Reference bands for reading the chart, not model inputs and
// not alarm limits.
export const NORMAL_RANGES: Record<Vital, { min: number; max: number }> = {
  HR: { min: 60, max: 100 },
  O2Sat: { min: 95, max: 100 },
  Temp: { min: 36.1, max: 37.8 },
  Resp: { min: 12, max: 20 },
};
