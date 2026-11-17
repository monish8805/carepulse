import { Types } from "mongoose";
import { ML_SERVICE_URL } from "../config/env";
import { VITALS, Vital } from "../config/vitals";
import { VitalsReadingModel } from "../models/vitalsReading.model";
import { SepsisPredictionModel, RISK_LEVELS, RiskLevel } from "../models/sepsisPrediction.model";
import { UserModel } from "../models/user.model";
import { HourlyRiskModel } from "../models/hourlyRisk.model";
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
      row = { hour, HR: null, O2Sat: null, Temp: null, Resp: null };
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
  const startsAt = new Date(Math.min(...readings.map((reading) => reading.recordedAt.getTime())));
  return { history: buildHistory(readings), asOfReadingId: latest._id, asOf: latest.recordedAt, startsAt };
}

// Age and gender are inputs of the model itself (Stage 1), not identifiers:
// whole years at the newest reading, and 0 = female / 1 = male as in the
// training data. "other" has no value the model was trained on, so it (like a
// missing profile field) means no score rather than a guessed one.
export interface StaticInputs {
  age: number;
  gender: 0 | 1;
}

export function staticInputsFor(
  patient: { dateOfBirth?: Date | null; gender?: string | null },
  asOf: Date
): StaticInputs | null {
  if (!patient.dateOfBirth || (patient.gender !== "male" && patient.gender !== "female")) return null;
  const born = patient.dateOfBirth;
  let age = asOf.getUTCFullYear() - born.getUTCFullYear();
  const birthdayPassed =
    asOf.getUTCMonth() > born.getUTCMonth() ||
    (asOf.getUTCMonth() === born.getUTCMonth() && asOf.getUTCDate() >= born.getUTCDate());
  if (!birthdayPassed) age -= 1;
  return { age, gender: patient.gender === "male" ? 1 : 0 };
}

// Nothing identifying is sent — only the hourly vitals, age and gender.
async function requestPrediction(history: HistoryRow[], inputs: StaticInputs): Promise<ModelResult> {
  const response = await fetch(`${ML_SERVICE_URL}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ history, age: inputs.age, gender: inputs.gender }),
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
  const { history, asOfReadingId, asOf } = loaded;

  const patient = await UserModel.findById(patientId);
  const inputs = patient ? staticInputsFor(patient, asOf) : null;

  let result: ModelResult | null = null;
  if (inputs) {
    try {
      result = await requestPrediction(history, inputs);
    } catch (err) {
      console.error("Sepsis model unavailable:", err instanceof Error ? err.message : "unknown error");
    }
  }

  const base = { patientId, readingId: asOfReadingId };
  const prediction = await SepsisPredictionModel.create(
    result
      ? { ...base, status: "scored", ...result }
      : {
          ...base,
          status: "unavailable",
          warning: inputs ? null : "Date of birth and a male/female gender are needed to score risk.",
        }
  );

  // Alert off the model's own tier, never a probability cut-off chosen here:
  // the thresholds are calibrated per model, so a retrain moves them.
  if (prediction.riskLevel === "HIGH") {
    await raiseAlertIfNoneActive(patientId, prediction._id);
  }
  return prediction;
}

interface SeriesScore {
  hour: number;
  model_score: number;
  sepsis_probability: number;
  risk_level: RiskLevel;
}

interface SeriesResponse {
  hours: number[];
  hour_warnings: string[][];
  warnings: string[];
  model_version: string | null;
  models: Record<string, SeriesScore[]>;
}

async function requestSeries(history: HistoryRow[], inputs: StaticInputs): Promise<SeriesResponse> {
  const response = await fetch(`${ML_SERVICE_URL}/predict_series`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ history, age: inputs.age, gender: inputs.gender }),
    signal: AbortSignal.timeout(ML_TIMEOUT_MS * 4),
  });
  if (!response.ok) {
    throw new Error(`model service responded ${response.status}`);
  }
  const body = (await response.json()) as SeriesResponse;
  const keys = body.models ? Object.keys(body.models) : [];
  if (!Array.isArray(body.hours) || keys.length === 0 || keys.some((key) => body.models[key].length !== body.hours.length)) {
    throw new Error("model service returned an unexpected response");
  }
  return body;
}

// Re-scores every hour of the patient's stay with every model (one call: hour
// t only ever sees hours <= t, so it equals scoring each hour on its own) and
// stores the result for the Sepsis Watch. Best effort like scoreAfterReading —
// the reading is already saved, and a failure just leaves the earlier stored
// curve in place. Skipped, like scoring, when age/gender are unknown.
export async function refreshRiskSeries(patientId: Types.ObjectId | string) {
  const loaded = await loadHistory(patientId);
  if (!loaded) return;
  const patient = await UserModel.findById(patientId);
  const inputs = patient ? staticInputsFor(patient, loaded.asOf) : null;
  if (!inputs) return;

  try {
    const series = await requestSeries(loaded.history, inputs);
    const last = series.hours.length - 1;
    await HourlyRiskModel.bulkWrite(
      series.hours.map((hour, i) => ({
        updateOne: {
          filter: { patientId, hourStart: new Date(loaded.startsAt.getTime() + hour * HOUR_MS) },
          update: {
            $set: {
              models: new Map(
                Object.entries(series.models).map(([key, scores]) => [
                  key,
                  {
                    modelScore: scores[i].model_score,
                    probability: scores[i].sepsis_probability,
                    riskLevel: scores[i].risk_level,
                    alert: scores[i].risk_level === "HIGH",
                  },
                ])
              ),
              modelVersion: series.model_version ?? null,
              warnings: [...series.hour_warnings[i], ...(i === last ? series.warnings : [])],
            },
          },
          upsert: true,
        },
      }))
    );
  } catch (err) {
    console.error("Risk series not refreshed:", err instanceof Error ? err.message : "unknown error");
  }
}
