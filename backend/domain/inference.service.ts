import { Types } from "mongoose";
import { ML_SERVICE_URL } from "../config/env";
import { VITALS, Vital } from "../config/vitals";
import { VitalsReadingModel } from "../models/vitalsReading.model";
import { SepsisPredictionModel, RISK_LEVELS, RiskLevel } from "../models/sepsisPrediction.model";
import { raiseAlertIfNoneActive } from "./alert.service";

const HOUR_MS = 60 * 60 * 1000;
// The model only ever uses the latest 336 hours (its longest training stay).
const MAX_HISTORY_HOURS = 336;
const ML_TIMEOUT_MS = 5000;

export type HistoryRow = { hour: number } & Record<Vital, number | null>;

type ReadingValues = { recordedAt: Date } & Partial<Record<Vital, number | null>>;

interface ModelResult {
  sepsisProbability: number;
  riskLevel: RiskLevel;
  modelKey: string | null;
  modelVersion: string | null;
  warning: string | null;
}

// Turns stored readings into the model's input. Two rules from the model
// itself (ml-service/sepsis_core.py::_parse):
// - `hour` is whole hours since the first reading, not a row number — the
//   model treats a gap between hours as unmeasured hours, so numbering rows
//   0, 1, 2… would silently squash real gaps out of the timeline.
// - each hour may appear once (a duplicate is a 422), so readings in the same
//   hour are merged, a later measured value replacing an earlier one.
// The whole history goes, not just the last 6 hours: the network sees only 6,
// but the forward-fill that decides what a gap in those 6 becomes reaches
// further back.
export function buildHistory(readings: ReadingValues[]): HistoryRow[] {
  if (readings.length === 0) return [];
  const sorted = [...readings].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const start = sorted[0].recordedAt.getTime();

  const rows = new Map<number, HistoryRow>();
  for (const reading of sorted) {
    const hour = Math.floor((reading.recordedAt.getTime() - start) / HOUR_MS);
    let row = rows.get(hour);
    if (!row) {
      row = { hour, HR: null, O2Sat: null, Temp: null, SBP: null, MAP: null, DBP: null, Resp: null };
      rows.set(hour, row);
    }
    for (const vital of VITALS) {
      const value = reading[vital];
      if (value !== null && value !== undefined) row[vital] = value;
    }
  }
  return [...rows.values()].sort((a, b) => a.hour - b.hour);
}

// Also returns the newest reading: the model scores the latest hour, so that
// reading — not necessarily the one just sent, which may be older — is what
// the score is "as of".
async function loadHistory(patientId: Types.ObjectId | string) {
  const latest = await VitalsReadingModel.findOne({ patientId }).sort({ recordedAt: -1 });
  if (!latest) return null;
  const since = new Date(latest.recordedAt.getTime() - MAX_HISTORY_HOURS * HOUR_MS);
  const readings = await VitalsReadingModel.find({ patientId, recordedAt: { $gt: since } });
  return { history: buildHistory(readings), asOfReadingId: latest._id };
}

// Nothing identifying is sent — only the hourly vitals.
async function requestPrediction(history: HistoryRow[]): Promise<ModelResult> {
  const response = await fetch(`${ML_SERVICE_URL}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ history }),
    signal: AbortSignal.timeout(ML_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`model service responded ${response.status}`);
  }

  const body = (await response.json()) as Record<string, unknown>;
  const riskLevel = body.risk_level;
  if (
    typeof body.sepsis_probability !== "number" ||
    typeof riskLevel !== "string" ||
    !(RISK_LEVELS as readonly string[]).includes(riskLevel)
  ) {
    throw new Error("model service returned an unexpected response");
  }
  return {
    sepsisProbability: body.sepsis_probability,
    riskLevel: riskLevel as RiskLevel,
    modelKey: typeof body.model === "string" ? body.model : null,
    modelVersion: typeof body.model_version === "string" ? body.model_version : null,
    warning: typeof body.warning === "string" ? body.warning : null,
  };
}

// Scores the patient's history right after a reading is saved. A model
// failure (down, slow, rejected input) is recorded as "unavailable" instead
// of failing the request: the reading is already safely stored, and the UI
// shows "risk unknown" — never a missing score dressed up as low risk.
//
// The score is linked to the newest reading, not the one just saved: a
// late-arriving older reading changes the history but the model still scores
// the latest hour, and attaching that score to the older reading would put a
// current risk at a past time.
export async function scoreAfterReading(patientId: Types.ObjectId | string) {
  const loaded = await loadHistory(patientId);
  if (!loaded) throw new Error("scoreAfterReading called for a patient with no readings");
  const { history, asOfReadingId } = loaded;

  let result: ModelResult | null = null;
  try {
    result = await requestPrediction(history);
  } catch (err) {
    console.error("Sepsis model unavailable:", err instanceof Error ? err.message : "unknown error");
  }

  const base = { patientId, readingId: asOfReadingId };
  const prediction = await SepsisPredictionModel.create(
    result ? { ...base, status: "scored", ...result } : { ...base, status: "unavailable" }
  );

  // Alert off the model's own tier, never a probability cut-off chosen here:
  // the thresholds are calibrated per model, so a retrain moves them.
  if (prediction.riskLevel === "HIGH") {
    await raiseAlertIfNoneActive(patientId, prediction._id);
  }
  return prediction;
}
