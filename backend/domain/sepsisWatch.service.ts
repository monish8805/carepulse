import { ML_SERVICE_URL } from "../config/env";
import { NORMAL_RANGES, VITALS, VITALS_CONSENT_CATEGORY, Vital } from "../config/vitals";
import { HourlyRiskModel } from "../models/hourlyRisk.model";
import { SimulatedStayModel } from "../models/simulatedStay.model";
import { UserModel } from "../models/user.model";
import { VitalsReadingModel } from "../models/vitalsReading.model";
import { HttpError } from "../utils/httpError";
import { buildHistory, staticInputsFor } from "./inference.service";
import { assertActiveConsent } from "./patientConsent.service";

const HOUR_MS = 60 * 60 * 1000;
// The model's own history limit; the stored risk curve covers the same window.
const MAX_HOURS = 336;
const ML_INFO_TIMEOUT_MS = 3000;
// The dataset's SepsisLabel turns on 6 hours before the defined sepsis onset.
const LABEL_TO_ONSET_HOURS = 6;

interface ModelsResponse {
  primary: string;
  models: { key: string; name: string }[];
  thresholds: Record<string, { high_probability: number; elevated_probability: number }>;
}

// Thresholds and test metrics come from the model service itself rather than
// being copied here, so a retrain moves the alert line and the numbers with
// it. Best effort: the stored curves are still shown when the service is down.
async function fetchFromModelService<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${ML_SERVICE_URL}${path}`, { signal: AbortSignal.timeout(ML_INFO_TIMEOUT_MS) });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

// One patient's stay for the Sepsis Watch: hourly vitals, every model's stored
// risk per hour, and the alert state. Gated like every clinical read — the
// route's vitals.view permission AND an active vitals.continuous grant (a
// patient who hasn't shared is a 404, same as one who doesn't exist).
export async function getSepsisWatch(doctorId: string, patientId: string) {
  await assertActiveConsent(doctorId, patientId, VITALS_CONSENT_CATEGORY);
  const patient = await UserModel.findById(patientId);
  if (!patient) {
    throw new HttpError(404, "Patient not found.");
  }

  const latest = await VitalsReadingModel.findOne({ patientId }).sort({ recordedAt: -1 });
  const readings = latest
    ? await VitalsReadingModel.find({
        patientId,
        recordedAt: { $gt: new Date(latest.recordedAt.getTime() - MAX_HOURS * HOUR_MS) },
      })
    : [];

  // Same hour numbering the model was given (buildHistory), with the unmeasured
  // hours filled in as nulls so the shared axis has no holes.
  const measured = new Map(buildHistory(readings).map((row) => [row.hour, row]));
  const lastHour = Math.max(-1, ...measured.keys());
  const startsAt = readings.length ? new Date(Math.min(...readings.map((reading) => reading.recordedAt.getTime()))) : null;
  const hours = Array.from({ length: lastHour + 1 }, (_, hour) => {
    const row = measured.get(hour);
    return {
      hour,
      ...(Object.fromEntries(VITALS.map((vital) => [vital, row?.[vital] ?? null])) as Record<Vital, number | null>),
    };
  });

  const [models, comparison] = await Promise.all([
    fetchFromModelService<ModelsResponse>("/models"),
    fetchFromModelService<{ rows: Record<string, string>[] }>("/comparison"),
  ]);

  const risk: Record<string, { hour: number; probability: number; riskLevel: string; alert: boolean }[]> = {};
  const warnings: { hour: number; warnings: string[] }[] = [];
  if (startsAt) {
    const stored = await HourlyRiskModel.find({
      patientId,
      hourStart: { $gte: new Date(startsAt.getTime() - HOUR_MS / 2), $lte: new Date(startsAt.getTime() + lastHour * HOUR_MS + HOUR_MS / 2) },
    }).sort({ hourStart: 1 });
    for (const doc of stored) {
      const hour = Math.round((doc.hourStart.getTime() - startsAt.getTime()) / HOUR_MS);
      for (const [key, score] of doc.models) {
        (risk[key] ??= []).push({ hour, probability: score.probability, riskLevel: score.riskLevel, alert: score.alert });
      }
      if (doc.warnings.length > 0) warnings.push({ hour, warnings: doc.warnings });
    }
  }

  const stay = await SimulatedStayModel.findOne({ patientId });
  const labelStartsHour = stay?.labelHour ?? null;
  const patientInputs = latest ? staticInputsFor(patient, latest.recordedAt) : null;

  return {
    patient: {
      id: patient._id.toString(),
      name: patient.name,
      age: patientInputs?.age ?? null,
      gender: patient.gender ?? null,
    },
    startsAt,
    hours,
    normalRanges: NORMAL_RANGES,
    risk,
    alertHours: Object.fromEntries(
      Object.entries(risk).map(([key, series]) => [key, series.filter((point) => point.alert).map((point) => point.hour)])
    ),
    models: models?.models ?? Object.keys(risk).map((key) => ({ key, name: key })),
    primary: models?.primary ?? null,
    alertLevels: models
      ? Object.fromEntries(
          Object.entries(models.thresholds).map(([key, t]) => [key, { high: t.high_probability, elevated: t.elevated_probability }])
        )
      : null,
    comparison: comparison?.rows ?? null,
    warnings,
    // Only a replayed retrospective stay has a known label/onset; a live
    // patient's never does, so this is null for them.
    simulation: stay
      ? {
          sampleId: stay.sampleId,
          labelStartsHour,
          onsetHour: labelStartsHour === null ? null : labelStartsHour + LABEL_TO_ONSET_HOURS,
        }
      : null,
  };
}
