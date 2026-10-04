// Demo ingestion: replays one of the six held-out ICU stays in
// ml-service/sample_patients.json into a patient account, through the real
// HTTP API (POST /api/patient/vitals), so every reading is validated, stored
// and scored exactly like a real one.
//
//   npm run replay:vitals                    # p012210, all hours at once
//   npm run replay:vitals -- p009914 1000    # another stay, 1 s between hours
//
// The patient logs in with REPLAY_PATIENT_EMAIL / REPLAY_PATIENT_PASSWORD from
// backend/.env (not command-line flags, which would end up in shell history).
// The backend (and ml-service, or every score is "unavailable") must be running.
//
// Of the six stays, only p012210 (septic; label onset hour 37) reaches HIGH
// with the primary model, so it's the one that produces an alert.
import dotenv from "dotenv";
dotenv.config(); // must run before any other local import that reads process.env at load time

import fs from "fs";
import path from "path";
import { VITALS } from "../config/vitals";

const API_URL = process.env.REPLAY_API_URL || "http://localhost:5001";
const EMAIL = process.env.REPLAY_PATIENT_EMAIL;
const PASSWORD = process.env.REPLAY_PATIENT_PASSWORD;
const HOUR_MS = 60 * 60 * 1000;

interface SamplePatient {
  id: string;
  label_hour: number | null;
  hours: Record<string, number | null>[];
}

async function api(pathname: string, init: RequestInit & { token?: string } = {}) {
  const response = await fetch(`${API_URL}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${pathname} → ${response.status}: ${body.message ?? "request failed"}`);
  }
  return body;
}

async function replay() {
  const [sampleId = "p012210", delayArg = "0"] = process.argv.slice(2);
  const delayMs = Number(delayArg);

  if (!EMAIL || !PASSWORD) {
    console.error("Set REPLAY_PATIENT_EMAIL and REPLAY_PATIENT_PASSWORD in backend/.env (a verified patient account).");
    process.exit(1);
  }

  const samplesPath = path.join(__dirname, "../../ml-service/sample_patients.json");
  const samples: SamplePatient[] = JSON.parse(fs.readFileSync(samplesPath, "utf8"));
  const sample = samples.find((candidate) => candidate.id === sampleId);
  if (!sample) {
    console.error(`No sample patient "${sampleId}". Choose one of: ${samples.map((s) => s.id).join(", ")}`);
    process.exit(1);
  }

  const { accessToken } = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, role: "patient" }),
  });

  // A second replay into the same account would interleave two stays on one
  // timeline (the model merges readings in the same hour), so refuse instead.
  const existing = await api("/api/patient/vitals", { token: accessToken });
  if (existing.readings.length > 0) {
    console.error(`${EMAIL} already has ${existing.readings.length} readings. Replay into a fresh patient account.`);
    process.exit(1);
  }

  // The stay is laid out hour by hour ending now, so its timeline matches the
  // original ICU hours.
  const start = Date.now() - (sample.hours.length - 1) * HOUR_MS;
  console.log(`Replaying ${sample.id} (${sample.hours.length} h, sepsis label from hour ${sample.label_hour ?? "never"})`);

  for (const [hour, values] of sample.hours.entries()) {
    const vitals = Object.fromEntries(VITALS.map((vital) => [vital, values[vital] ?? null]));
    if (Object.values(vitals).every((value) => value === null)) {
      console.log(`hour ${hour}: nothing measured, skipped`);
      continue;
    }
    const { prediction } = await api("/api/patient/vitals", {
      method: "POST",
      token: accessToken,
      body: JSON.stringify({ recordedAt: new Date(start + hour * HOUR_MS).toISOString(), ...vitals }),
    });
    const score =
      prediction.status === "scored" ? `${prediction.riskLevel} (${(prediction.sepsisProbability * 100).toFixed(1)}%)` : "unavailable";
    console.log(`hour ${hour}: ${score}`);
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

replay().catch((error) => {
  console.error("Replay failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
