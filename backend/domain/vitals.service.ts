import { Types } from "mongoose";
import { VITALS, Vital, VITALS_CONSENT_CATEGORY } from "../config/vitals";
import { VitalsReadingModel } from "../models/vitalsReading.model";
import { SepsisPredictionModel } from "../models/sepsisPrediction.model";
import { UserModel } from "../models/user.model";
import { HttpError } from "../utils/httpError";
import { scoreAfterReading } from "./inference.service";
import { assertActiveConsent } from "./patientConsent.service";

// recordedAt comes from the client because readings aren't always sent the
// moment they're taken (and the demo replay sends a whole stay at once). A
// little clock skew is allowed; anything further ahead, or older than the
// model's 14-day history window, is rejected.
const MAX_FUTURE_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
// Enough for a full 14-day hourly history.
const MAX_LISTED = 400;

export type VitalsInput = { recordedAt: Date } & Record<Vital, number | null>;

export interface VitalsReadingSummary extends Record<Vital, number | null> {
  id: string;
  recordedAt: Date;
}

export interface SepsisPredictionSummary {
  id: string;
  readingId: string;
  status: string;
  sepsisProbability: number | null;
  riskLevel: string | null;
  modelKey: string | null;
  modelVersion: string | null;
  warning: string | null;
  createdAt: Date;
}

interface ReadingDocument extends Partial<Record<Vital, number | null>> {
  _id: Types.ObjectId;
  recordedAt: Date;
}

interface PredictionDocument {
  _id: Types.ObjectId;
  readingId: Types.ObjectId;
  status: string;
  sepsisProbability?: number | null;
  riskLevel?: string | null;
  modelKey?: string | null;
  modelVersion?: string | null;
  warning?: string | null;
  createdAt: Date;
}

function toReadingSummary(reading: ReadingDocument): VitalsReadingSummary {
  const values = Object.fromEntries(VITALS.map((vital) => [vital, reading[vital] ?? null])) as Record<
    Vital,
    number | null
  >;
  return { id: reading._id.toString(), recordedAt: reading.recordedAt, ...values };
}

function toPredictionSummary(prediction: PredictionDocument): SepsisPredictionSummary {
  return {
    id: prediction._id.toString(),
    readingId: prediction.readingId.toString(),
    status: prediction.status,
    sepsisProbability: prediction.sepsisProbability ?? null,
    riskLevel: prediction.riskLevel ?? null,
    modelKey: prediction.modelKey ?? null,
    modelVersion: prediction.modelVersion ?? null,
    warning: prediction.warning ?? null,
    createdAt: prediction.createdAt,
  };
}

export async function recordVitals(
  patientId: string,
  input: VitalsInput
): Promise<{ reading: VitalsReadingSummary; prediction: SepsisPredictionSummary }> {
  const now = Date.now();
  const recordedAt = input.recordedAt.getTime();
  if (recordedAt > now + MAX_FUTURE_MS) {
    throw new HttpError(400, "recordedAt can't be in the future.");
  }
  if (recordedAt < now - MAX_AGE_MS) {
    throw new HttpError(400, "recordedAt can't be more than 14 days ago.");
  }

  const reading = await VitalsReadingModel.create({ patientId, ...input });
  const prediction = await scoreAfterReading(patientId);
  return { reading: toReadingSummary(reading), prediction: toPredictionSummary(prediction) };
}

async function listVitals(
  patientId: string
): Promise<{ readings: VitalsReadingSummary[]; predictions: SepsisPredictionSummary[] }> {
  const readings = await VitalsReadingModel.find({ patientId }).sort({ recordedAt: -1 }).limit(MAX_LISTED);
  const predictions = await SepsisPredictionModel.find({ patientId }).sort({ createdAt: -1 }).limit(MAX_LISTED);
  return {
    readings: readings.reverse().map(toReadingSummary),
    predictions: predictions.reverse().map(toPredictionSummary),
  };
}

// The patient's own data, so no consent check: consent governs who ELSE sees it.
export async function listMyVitals(patientId: string) {
  return listVitals(patientId);
}

// The doctor's view of one patient. Callers must also hold vitals.view
// (requirePermission at the route); this adds the consent half of the gate.
export async function listPatientVitals(doctorId: string, patientId: string) {
  await assertActiveConsent(doctorId, patientId, VITALS_CONSENT_CATEGORY);
  const patient = await UserModel.findById(patientId);
  if (!patient) {
    throw new HttpError(404, "Patient not found.");
  }
  const { readings, predictions } = await listVitals(patientId);
  return {
    patient: {
      id: patient._id.toString(),
      name: patient.name,
      dateOfBirth: patient.dateOfBirth ?? null,
      gender: patient.gender ?? null,
      bloodType: patient.bloodType ?? null,
      guardianPhone: patient.guardianPhone ?? null,
    },
    readings,
    predictions,
  };
}
