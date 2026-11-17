// Demo data for the Sepsis Watch: replays the six held-out ICU stays in
// ml-service/sample_patients.json as simulated patients, so the page can be
// shown without real data. Each stay becomes one patient account whose hourly
// readings are stored with source "simulated", then every hour is scored by
// every model (the same call a live reading triggers) and the doctor you name
// is given a vitals.continuous grant.
//
//   npm run seed:sepsis-demo -- doctor@hospital.example            # all six stays
//   npm run seed:sepsis-demo -- doctor@hospital.example p012210    # one stay
//
// The doctor must already be a Hospital Portal account, and ml-service must be
// running (the risk curve is computed by the model, never by this script).
// Safe to rerun: it replaces its own simulated patients' data and nothing else.
//
// The sample file holds no age or gender, but the model needs both, so each
// simulated patient gets a made-up one (below). They only exist to make the
// model run; they say nothing about the real ICU patient behind the stay.
import dotenv from "dotenv";
dotenv.config(); // must run before any other local import that reads process.env at load time

import crypto from "crypto";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { connectToDatabase } from "../config/db";
import { VITALS, VITALS_CONSENT_CATEGORY, Vital } from "../config/vitals";
import { refreshRiskSeries } from "../domain/inference.service";
import { AlertModel } from "../models/alert.model";
import { HourlyRiskModel } from "../models/hourlyRisk.model";
import { PatientConsentModel } from "../models/patientConsent.model";
import { SepsisPredictionModel } from "../models/sepsisPrediction.model";
import { SimulatedStayModel } from "../models/simulatedStay.model";
import { UserModel } from "../models/user.model";
import { VitalsReadingModel } from "../models/vitalsReading.model";
import { hashValue } from "../utils/hash";

const HOUR_MS = 60 * 60 * 1000;

interface SamplePatient {
  id: string;
  label_hour: number | null;
  hours: Record<string, number | null>[];
}

const DEMO_PROFILES: Record<string, { age: number; gender: "male" | "female" }> = {
  p012210: { age: 67, gender: "male" },
  p009914: { age: 54, gender: "female" },
  p102671: { age: 72, gender: "male" },
  p003688: { age: 61, gender: "female" },
  p013449: { age: 48, gender: "male" },
  p108460: { age: 79, gender: "female" },
};

async function seed() {
  const [doctorEmail, onlySampleId] = process.argv.slice(2);
  if (!doctorEmail) {
    console.error("Usage: npm run seed:sepsis-demo -- <hospital doctor email> [sample id]");
    process.exit(1);
  }

  const samples: SamplePatient[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../ml-service/sample_patients.json"), "utf8")
  );
  const chosen = onlySampleId ? samples.filter((sample) => sample.id === onlySampleId) : samples;
  if (chosen.length === 0) {
    console.error(`No sample patient "${onlySampleId}". Choose one of: ${samples.map((s) => s.id).join(", ")}`);
    process.exit(1);
  }

  await connectToDatabase();

  const doctor = await UserModel.findOne({ email: doctorEmail.toLowerCase(), roles: "hospital" });
  if (!doctor) {
    console.error(`${doctorEmail} isn't a Hospital Portal account.`);
    process.exit(1);
  }

  for (const sample of chosen) {
    const profile = DEMO_PROFILES[sample.id] ?? { age: 60, gender: "male" as const };
    const email = `sim.${sample.id}@carepulse.invalid`;
    const born = new Date();
    born.setUTCFullYear(born.getUTCFullYear() - profile.age);
    born.setUTCDate(born.getUTCDate() - 1);
    born.setUTCHours(0, 0, 0, 0);

    // Nobody can log in as a simulated patient: its password is random and discarded.
    const patient =
      (await UserModel.findOne({ email })) ??
      (await UserModel.create({
        name: `Simulated ${sample.id}`,
        email,
        passwordHash: await hashValue(crypto.randomBytes(24).toString("hex")),
        roles: ["patient"],
        isVerified: true,
        bloodType: "unknown",
      }));
    patient.dateOfBirth = born;
    patient.gender = profile.gender;
    await patient.save();

    await Promise.all([
      VitalsReadingModel.deleteMany({ patientId: patient._id }),
      HourlyRiskModel.deleteMany({ patientId: patient._id }),
      SepsisPredictionModel.deleteMany({ patientId: patient._id }),
      AlertModel.deleteMany({ patientId: patient._id }),
      SimulatedStayModel.deleteMany({ patientId: patient._id }),
    ]);

    // Every hour is stored, even one with nothing measured: hour 0 anchors the
    // timeline, so stored hour numbers equal the original ICU hours and the
    // label hour below lines up.
    const start = Date.now() - (sample.hours.length - 1) * HOUR_MS;
    await VitalsReadingModel.insertMany(
      sample.hours.map((values, hour) => ({
        patientId: patient._id,
        recordedAt: new Date(start + hour * HOUR_MS),
        source: "simulated",
        ...(Object.fromEntries(VITALS.map((vital) => [vital, values[vital] ?? null])) as Record<Vital, number | null>),
      }))
    );
    await SimulatedStayModel.create({ patientId: patient._id, sampleId: sample.id, labelHour: sample.label_hour });

    await refreshRiskSeries(patient._id);
    const scored = await HourlyRiskModel.countDocuments({ patientId: patient._id });
    if (scored === 0) {
      console.error("The model service didn't score the stay. Is ml-service running (and ML_SERVICE_URL right)?");
      process.exit(1);
    }

    await PatientConsentModel.findOneAndUpdate(
      { patientId: patient._id, doctorId: doctor._id },
      { dataCategories: [VITALS_CONSENT_CATEGORY], status: "active" },
      { upsert: true }
    );
    console.log(
      `${sample.id}: ${sample.hours.length} hours, ${scored} scored, label ${sample.label_hour ?? "never"} → patient ${patient._id}`
    );
  }

  await mongoose.disconnect();
  console.log(`Done. Open Sepsis Watch as ${doctorEmail}.`);
}

seed().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await mongoose.disconnect();
  process.exit(1);
});
