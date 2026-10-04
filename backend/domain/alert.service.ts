import { Types } from "mongoose";
import { AlertModel } from "../models/alert.model";
import { SepsisPredictionModel } from "../models/sepsisPrediction.model";
import { VitalsReadingModel } from "../models/vitalsReading.model";
import { VITALS_CONSENT_CATEGORY } from "../config/vitals";
import { HttpError } from "../utils/httpError";
import { isDuplicateKeyError } from "../utils/mongoError";
import { consentedPatientIds } from "./patientConsent.service";

interface PopulatedPatient {
  _id: Types.ObjectId;
  name: string;
  dateOfBirth?: Date | null;
  gender?: string | null;
}

interface PopulatedPrediction {
  _id: Types.ObjectId;
  readingId: Types.ObjectId;
  sepsisProbability: number | null;
  riskLevel: string | null;
  warning: string | null;
}

// A score with the time of the reading it is "as of" — the clinically
// meaningful time, as opposed to when the score or alert row was written
// (which a batch upload or replay compresses into a few seconds).
export interface ScoreSummary {
  status: string;
  sepsisProbability: number | null;
  riskLevel: string | null;
  recordedAt: Date | null;
}

export interface AlertSummary {
  id: string;
  patientId: string;
  patientName: string;
  patientDateOfBirth: Date | null;
  patientGender: string | null;
  status: string;
  createdAt: Date;
  // The HIGH score that raised the alert. An alert stays active until
  // acknowledged while the patient's risk keeps moving, so it is always shown
  // next to `current` — the patient's latest score — never on its own as if
  // it were the present state.
  trigger: ScoreSummary & { warning: string | null };
  current: ScoreSummary | null;
}

// Called after a HIGH score. The partial unique index on Alert (one active
// alert per patient) is what decides whether this creates anything: a
// duplicate-key error means the patient already has an active alert, which is
// the expected outcome for every HIGH hour after the first — not a failure.
// Creating directly rather than checking first keeps it race-free when two
// readings are scored at once.
export async function raiseAlertIfNoneActive(patientId: Types.ObjectId | string, predictionId: Types.ObjectId) {
  try {
    await AlertModel.create({ patientId, predictionId });
  } catch (err) {
    if (isDuplicateKeyError(err)) return;
    throw err;
  }
}

// Active alerts for every patient who currently shares continuous vitals with
// this doctor. Callers must also hold alerts.view (requirePermission at the
// route) — the consent filter here is the other half of that gate.
export async function listAlerts(doctorId: string): Promise<AlertSummary[]> {
  const patientIds = await consentedPatientIds(doctorId, VITALS_CONSENT_CATEGORY);
  const alerts = await AlertModel.find({ patientId: { $in: patientIds }, status: "active" })
    .sort({ createdAt: -1 })
    .populate<{ patientId: PopulatedPatient | null }>("patientId")
    .populate<{ predictionId: PopulatedPrediction | null }>("predictionId");

  // Each patient's most recent score. Every score is as of the newest reading
  // that existed when it was made, so the latest one is the current risk.
  const latestScores: { _id: Types.ObjectId; prediction: PopulatedPrediction & { status: string } }[] =
    await SepsisPredictionModel.aggregate([
      { $match: { patientId: { $in: alerts.map((alert) => alert.patientId?._id) } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$patientId", prediction: { $first: "$$ROOT" } } },
    ]);
  const latestByPatient = new Map(latestScores.map((row) => [row._id.toString(), row.prediction]));

  const readingIds = [
    ...alerts.map((alert) => alert.predictionId?.readingId),
    ...latestScores.map((row) => row.prediction.readingId),
  ];
  const readings = await VitalsReadingModel.find({ _id: { $in: readingIds } }, { recordedAt: 1 });
  const recordedAtByReading = new Map(readings.map((reading) => [reading._id.toString(), reading.recordedAt]));
  const recordedAt = (readingId: Types.ObjectId | undefined) =>
    (readingId && recordedAtByReading.get(readingId.toString())) ?? null;

  return alerts.flatMap((alert) => {
    if (!alert.patientId) return [];
    const trigger = alert.predictionId;
    const latest = latestByPatient.get(alert.patientId._id.toString());
    return [
      {
        id: alert._id.toString(),
        patientId: alert.patientId._id.toString(),
        patientName: alert.patientId.name,
        patientDateOfBirth: alert.patientId.dateOfBirth ?? null,
        patientGender: alert.patientId.gender ?? null,
        status: alert.status,
        createdAt: alert.createdAt,
        trigger: {
          status: "scored",
          sepsisProbability: trigger?.sepsisProbability ?? null,
          riskLevel: trigger?.riskLevel ?? null,
          warning: trigger?.warning ?? null,
          recordedAt: recordedAt(trigger?.readingId),
        },
        current: latest
          ? {
              status: latest.status,
              sepsisProbability: latest.sepsisProbability ?? null,
              riskLevel: latest.riskLevel ?? null,
              recordedAt: recordedAt(latest.readingId),
            }
          : null,
      },
    ];
  });
}

// Query-scoped to the doctor's consented patients, so an alert for anyone else
// simply isn't found — no fetch-then-check.
export async function acknowledgeAlert(doctorId: string, alertId: string): Promise<{ id: string; status: string }> {
  const patientIds = await consentedPatientIds(doctorId, VITALS_CONSENT_CATEGORY);
  const alert = await AlertModel.findOne({ _id: alertId, patientId: { $in: patientIds } });
  if (!alert) {
    throw new HttpError(404, "Alert not found.");
  }
  if (alert.status !== "active") {
    throw new HttpError(409, "This alert is already acknowledged.");
  }

  alert.status = "acknowledged";
  alert.acknowledgedBy = new Types.ObjectId(doctorId);
  alert.acknowledgedAt = new Date();
  await alert.save();
  return { id: alert._id.toString(), status: alert.status };
}
