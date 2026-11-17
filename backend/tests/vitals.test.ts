import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import app from "../app";
import { connectToDatabase } from "../config/db";
import { ML_SERVICE_URL } from "../config/env";
import { UserModel } from "../models/user.model";
import { HospitalModel } from "../models/hospital.model";
import { HospitalMembershipModel } from "../models/hospitalMembership.model";
import { AccessRoleModel } from "../models/accessRole.model";
import { PatientConsentModel } from "../models/patientConsent.model";
import { VitalsReadingModel } from "../models/vitalsReading.model";
import { SepsisPredictionModel } from "../models/sepsisPrediction.model";
import { AlertModel } from "../models/alert.model";
import { HourlyRiskModel } from "../models/hourlyRisk.model";
import { SimulatedStayModel } from "../models/simulatedStay.model";
import * as hospitalService from "../domain/hospital.service";
import { hashValue } from "../utils/hash";

// The sepsis model service is faked at the fetch level: every other fetch
// (Brevo, for the welcome emails createHospitalWithAdmin/addStaff send) goes
// through untouched. The model itself is tested in ml-service/, not here.
const HOUR_MS = 60 * 60 * 1000;
const realFetch = globalThis.fetch;
let mlCalls: { history: Record<string, number | null>[]; age: number; gender: number }[] = [];
let mlRespond: () => Promise<Response>;

// The model service's other endpoints, faked at the same level. The series
// fake scores every hour of whatever history it is sent: HIGH where
// `highFromHour` says so, LOW before. `modelInfoDown` makes /models and
// /comparison unreachable.
let highFromHour = Infinity;
let seriesRespond: ((body: { history: { hour: number }[] }) => Promise<Response>) | null = null;
let modelInfoDown = false;

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function defaultSeries(body: { history: { hour: number }[] }) {
  const score = (hour: number) => {
    const high = hour >= highFromHour;
    return { hour, model_score: high ? 0.4 : 0.1, sepsis_probability: high ? 0.08 : 0.02, risk_level: high ? "HIGH" : "LOW" };
  };
  const hours = body.history.map((row) => row.hour);
  return json({
    hours,
    hour_warnings: hours.map((hour) => (hour < 5 ? [`Only ${hour + 1} of 6 hours of history so far.`] : [])),
    warnings: [],
    model_version: "stage1-test",
    models: { xgboost: hours.map(score), ssl_lstm: hours.map(score) },
  });
}

const MODEL_INFO: Record<string, unknown> = {
  "/models": {
    primary: "ssl_lstm",
    models: [
      { key: "xgboost", name: "XGBoost" },
      { key: "ssl_lstm", name: "Self-Supervised LSTM + Classifier" },
    ],
    thresholds: {
      xgboost: { high_probability: 0.058, elevated_probability: 0.03 },
      ssl_lstm: { high_probability: 0.057, elevated_probability: 0.025 },
    },
  },
  "/comparison": { rows: [{ Model: "XGBoost", AUROC: "0.7056", Precision: "0.0609" }] },
};

function mlReturns(riskLevel: "LOW" | "ELEVATED" | "HIGH", sepsisProbability = 0.02) {
  mlRespond = async () =>
    new Response(
      JSON.stringify({
        sepsis_probability: sepsisProbability,
        risk_level: riskLevel,
        history_hours: 1,
        warning: null,
        model: "ssl_lstm",
        model_version: "1.0",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
}

const cleanupHospitalIds: string[] = [];
const cleanupUserEmails: string[] = [];

async function loginAs(email: string, password: string, role: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password, role });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

async function selectHospital(token: string, hospitalId: string): Promise<string> {
  const res = await request(app)
    .post("/api/hospital/select")
    .set("Authorization", `Bearer ${token}`)
    .send({ hospitalId });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

// A patient who has filled in the profile the model needs (age and gender);
// pass `profile` to override, e.g. { gender: "other" } or { dateOfBirth: undefined }.
async function createPatient(
  label: string,
  profile: Record<string, unknown> = {}
): Promise<{ id: string; token: string }> {
  const email = `vitals.patient.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
  const password = "PatientPass1!";
  const user = await UserModel.create({
    name: `Patient ${label}`,
    email,
    passwordHash: await hashValue(password),
    roles: ["patient"],
    isVerified: true,
    dateOfBirth: new Date(Date.UTC(1960, 5, 15)),
    gender: "male",
    ...profile,
  });
  cleanupUserEmails.push(email);
  return { id: user._id.toString(), token: await loginAs(email, password, "patient") };
}

// A hospital + admin, an AccessRole with the given permissions, and an active
// staff member holding it — same shape as patientConsent.test.ts's helper.
async function createDoctor(
  label: string,
  permissions: string[]
): Promise<{ email: string; token: string; membershipId: string }> {
  const hospital = await hospitalService.createHospitalWithAdmin({
    hospitalName: `Vitals Hospital ${label} ${Date.now()}`,
    adminName: "Admin",
    adminEmail: `vitals.admin.${label}.${Date.now()}@example.com`,
  });
  cleanupHospitalIds.push(hospital.hospital.id);
  cleanupUserEmails.push(hospital.admin.email);
  const adminToken = await selectHospital(
    await loginAs(hospital.admin.email, hospital.temporaryPassword, "hospital"),
    hospital.hospital.id
  );

  const roleRes = await request(app)
    .post("/api/hospital/access-roles")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: `Role ${label} ${Date.now()}`, permissions });
  expect(roleRes.status).toBe(201);

  const email = `vitals.doctor.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
  const addRes = await request(app)
    .post("/api/hospital/staff")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: `Dr. ${label}`, email, accessRoleId: roleRes.body.accessRole.id });
  expect(addRes.status).toBe(201);
  cleanupUserEmails.push(email);

  // addStaffDirectly only emails the temporary password; set a known one.
  const knownPassword = "DoctorPass1!";
  await UserModel.updateOne({ email }, { passwordHash: await hashValue(knownPassword) });
  const token = await selectHospital(await loginAs(email, knownPassword, "hospital"), hospital.hospital.id);
  return { email, token, membershipId: addRes.body.membershipId };
}

async function grant(patientToken: string, doctorEmail: string, dataCategories: string[]): Promise<string> {
  const res = await request(app)
    .post("/api/patient/consents")
    .set("Authorization", `Bearer ${patientToken}`)
    .send({ doctorEmail, dataCategories });
  expect(res.status).toBe(201);
  return res.body.grant.id as string;
}

async function record(patientToken: string, body: Record<string, unknown>) {
  return request(app).post("/api/patient/vitals").set("Authorization", `Bearer ${patientToken}`).send(body);
}

function reading(overrides: Record<string, unknown> = {}) {
  return { recordedAt: new Date().toISOString(), HR: 92, O2Sat: 96, Temp: 37.4, Resp: 20, ...overrides };
}

beforeAll(async () => {
  await connectToDatabase();
  // The alert tests depend on the one-active-alert partial unique index. Mongoose
  // builds it in the background on connect; waiting here means a failed build
  // fails loudly instead of letting duplicate alerts through unnoticed.
  await AlertModel.init();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith(ML_SERVICE_URL)) {
      const path = url.slice(ML_SERVICE_URL.length);
      if (path === "/predict_series") {
        const body = JSON.parse(String(init?.body));
        return seriesRespond ? seriesRespond(body) : defaultSeries(body);
      }
      if (path in MODEL_INFO) {
        if (modelInfoDown) throw new TypeError("fetch failed");
        return json(MODEL_INFO[path]);
      }
      mlCalls.push(JSON.parse(String(init?.body)));
      return mlRespond();
    }
    return realFetch(input, init);
  });
});

beforeEach(() => {
  mlCalls = [];
  mlReturns("LOW");
  highFromHour = Infinity;
  seriesRespond = null;
  modelInfoDown = false;
});

afterAll(async () => {
  vi.restoreAllMocks();
  const users = await UserModel.find({ email: { $in: cleanupUserEmails } });
  const userIds = users.map((u) => u._id);
  await VitalsReadingModel.deleteMany({ patientId: { $in: userIds } });
  await SepsisPredictionModel.deleteMany({ patientId: { $in: userIds } });
  await HourlyRiskModel.deleteMany({ patientId: { $in: userIds } });
  await SimulatedStayModel.deleteMany({ patientId: { $in: userIds } });
  await AlertModel.deleteMany({ patientId: { $in: userIds } });
  await PatientConsentModel.deleteMany({ $or: [{ patientId: { $in: userIds } }, { doctorId: { $in: userIds } }] });
  await AccessRoleModel.deleteMany({ hospital: { $in: cleanupHospitalIds } });
  await HospitalMembershipModel.deleteMany({ hospitalId: { $in: cleanupHospitalIds } });
  await HospitalModel.deleteMany({ _id: { $in: cleanupHospitalIds } });
  await UserModel.deleteMany({ email: { $in: cleanupUserEmails } });
  await mongoose.disconnect();
});

describe("Recording vitals (patient)", () => {
  it("stores the reading and the model's score", async () => {
    const patient = await createPatient("record");
    mlReturns("ELEVATED", 0.031);

    const res = await record(patient.token, reading());
    expect(res.status).toBe(201);
    expect(res.body.reading.HR).toBe(92);
    expect(res.body.reading.Resp).toBe(20);
    expect(res.body.prediction).toMatchObject({
      status: "scored",
      riskLevel: "ELEVATED",
      sepsisProbability: 0.031,
      modelKey: "ssl_lstm",
      modelVersion: "1.0",
    });

    const listed = await request(app).get("/api/patient/vitals").set("Authorization", `Bearer ${patient.token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.readings).toHaveLength(1);
    expect(listed.body.predictions[0].riskLevel).toBe("ELEVATED");
  });

  it("rejects malformed or out-of-range input", async () => {
    const patient = await createPatient("invalid");
    const cases = [
      reading({ HR: 500 }),
      reading({ HR: "92" }),
      reading({ recordedAt: undefined }),
      reading({ recordedAt: "not a date" }),
      { recordedAt: new Date().toISOString() },
      reading({ recordedAt: new Date(Date.now() + HOUR_MS).toISOString() }),
      reading({ recordedAt: new Date(Date.now() - 15 * 24 * HOUR_MS).toISOString() }),
    ];
    for (const body of cases) {
      const res = await record(patient.token, body);
      expect(res.status).toBe(400);
    }
    expect(await VitalsReadingModel.countDocuments({ patientId: patient.id })).toBe(0);
  });

  it("is Patient Portal only", async () => {
    const doctor = await createDoctor("portal", ["vitals.view"]);
    const res = await record(doctor.token, reading());
    expect(res.status).toBe(403);
  });
});

describe("Scoring", () => {
  it("still stores the reading when the model service fails, with the score marked unavailable", async () => {
    const patient = await createPatient("mldown");
    mlRespond = async () => new Response("boom", { status: 500 });

    const res = await record(patient.token, reading());
    expect(res.status).toBe(201);
    expect(res.body.prediction.status).toBe("unavailable");
    expect(res.body.prediction.riskLevel).toBeNull();
    expect(await AlertModel.countDocuments({ patientId: patient.id })).toBe(0);
  });

  it("sends whole years of age at the newest reading, and gender as 0/1", async () => {
    const now = new Date();
    const birthday = (daysLater: number) =>
      new Date(Date.UTC(now.getUTCFullYear() - 30, now.getUTCMonth(), now.getUTCDate() + daysLater));

    const birthdayToday = await createPatient("female", { gender: "female", dateOfBirth: birthday(0) });
    await record(birthdayToday.token, reading());
    expect(mlCalls[0]).toMatchObject({ age: 30, gender: 0 });

    const birthdayTomorrow = await createPatient("male", { dateOfBirth: birthday(1) });
    await record(birthdayTomorrow.token, reading());
    expect(mlCalls[1]).toMatchObject({ age: 29, gender: 1 });
  });

  it.each([
    ["gender is 'other'", { gender: "other" }],
    ["gender is missing", { gender: undefined }],
    ["date of birth is missing", { dateOfBirth: undefined }],
  ])("doesn't score, and never raises an alert, when %s", async (_label, profile) => {
    const patient = await createPatient("noprofile", profile);
    mlReturns("HIGH", 0.2);

    const res = await record(patient.token, reading());
    expect(res.status).toBe(201);
    expect(res.body.prediction.status).toBe("unavailable");
    expect(res.body.prediction.warning).toMatch(/date of birth/i);
    expect(mlCalls).toHaveLength(0);
    expect(await AlertModel.countDocuments({ patientId: patient.id })).toBe(0);
  });

  it("treats an unreachable model service the same way", async () => {
    const patient = await createPatient("mlunreachable");
    mlRespond = async () => {
      throw new TypeError("fetch failed");
    };

    const res = await record(patient.token, reading());
    expect(res.status).toBe(201);
    expect(res.body.prediction.status).toBe("unavailable");
  });

  it("sends the whole history as elapsed hours, merging readings in the same hour", async () => {
    const patient = await createPatient("history");
    const start = Date.now() - 3 * HOUR_MS;
    const at = (ms: number) => new Date(start + ms).toISOString();

    await record(patient.token, { recordedAt: at(0), HR: 80 });
    await record(patient.token, { recordedAt: at(10 * 60 * 1000), HR: 84, Temp: 37.5 });
    await record(patient.token, { recordedAt: at(3 * HOUR_MS), HR: 90 });

    const sent = mlCalls[mlCalls.length - 1];
    expect(Object.keys(sent)).toEqual(["history", "age", "gender"]);
    const nulls = { O2Sat: null, Resp: null };
    expect(sent.history).toEqual([
      { hour: 0, HR: 84, Temp: 37.5, ...nulls },
      { hour: 3, HR: 90, Temp: null, ...nulls },
    ]);
  });
});

describe("Alerts from HIGH scores", () => {
  it("raises one active alert per patient, however many HIGH hours follow", async () => {
    const patient = await createPatient("highrepeat");
    mlReturns("HIGH", 0.08);

    await record(patient.token, reading({ recordedAt: new Date(Date.now() - HOUR_MS).toISOString() }));
    await record(patient.token, reading());
    expect(await AlertModel.countDocuments({ patientId: patient.id, status: "active" })).toBe(1);
  });

  it("raises only one alert when two HIGH readings are scored at once", async () => {
    const patient = await createPatient("highrace");
    mlReturns("HIGH", 0.08);

    const results = await Promise.all([
      record(patient.token, reading({ recordedAt: new Date(Date.now() - HOUR_MS).toISOString() })),
      record(patient.token, reading()),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(await AlertModel.countDocuments({ patientId: patient.id, status: "active" })).toBe(1);
  });

  it("raises nothing for ELEVATED", async () => {
    const patient = await createPatient("elevated");
    mlReturns("ELEVATED");
    await record(patient.token, reading());
    expect(await AlertModel.countDocuments({ patientId: patient.id })).toBe(0);
  });
});

describe("Timing scores by their reading", () => {
  it("shows an alert's triggering reading next to the patient's current, lower score", async () => {
    const doctor = await createDoctor("stale", ["alerts.view"]);
    const patient = await createPatient("stale");
    await grant(patient.token, doctor.email, ["vitals.continuous"]);
    const highAt = new Date(Date.now() - 2 * HOUR_MS).toISOString();
    const nowAt = new Date().toISOString();

    mlReturns("HIGH", 0.08);
    await record(patient.token, reading({ recordedAt: highAt }));
    mlReturns("ELEVATED", 0.03);
    await record(patient.token, reading({ recordedAt: nowAt }));

    const res = await request(app).get("/api/hospital/alerts").set("Authorization", `Bearer ${doctor.token}`);
    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.alerts[0].trigger).toMatchObject({ riskLevel: "HIGH", sepsisProbability: 0.08, recordedAt: highAt });
    expect(res.body.alerts[0].current).toMatchObject({
      status: "scored",
      riskLevel: "ELEVATED",
      sepsisProbability: 0.03,
      recordedAt: nowAt,
    });
  });

  it("links a score to the newest reading, even when an older reading arrives late", async () => {
    const patient = await createPatient("late");
    const newest = await record(patient.token, reading({ recordedAt: new Date().toISOString() }));
    const late = await record(patient.token, reading({ recordedAt: new Date(Date.now() - 2 * HOUR_MS).toISOString() }));

    // The model scored the latest hour both times, so both scores belong to
    // the newest reading — not to the late one that triggered the rescore.
    expect(late.body.prediction.readingId).toBe(newest.body.reading.id);
    expect(late.body.reading.id).not.toBe(newest.body.reading.id);
  });
});

describe("Doctor's view of a patient's vitals (consent + live permission)", () => {
  it("is allowed with vitals.view and an active vitals.continuous grant", async () => {
    const doctor = await createDoctor("view", ["vitals.view"]);
    const patient = await createPatient("view");
    await grant(patient.token, doctor.email, ["vitals.continuous"]);
    await record(patient.token, reading());

    const res = await request(app)
      .get(`/api/hospital/patients/${patient.id}/vitals`)
      .set("Authorization", `Bearer ${doctor.token}`);
    expect(res.status).toBe(200);
    expect(res.body.patient.name).toBe("Patient view");
    expect(res.body.readings).toHaveLength(1);
    expect(res.body.predictions).toHaveLength(1);
  });

  it("is 404 without a grant, with only vitals.occasional, or after revoke", async () => {
    const doctor = await createDoctor("noconsent", ["vitals.view"]);
    const get = (patientId: string) =>
      request(app).get(`/api/hospital/patients/${patientId}/vitals`).set("Authorization", `Bearer ${doctor.token}`);

    const stranger = await createPatient("stranger");
    expect((await get(stranger.id)).status).toBe(404);

    const occasional = await createPatient("occasional");
    await grant(occasional.token, doctor.email, ["vitals.occasional"]);
    expect((await get(occasional.id)).status).toBe(404);

    const revoked = await createPatient("revoked");
    const grantId = await grant(revoked.token, doctor.email, ["vitals.continuous"]);
    expect((await get(revoked.id)).status).toBe(200);
    await request(app)
      .post(`/api/patient/consents/${grantId}/revoke`)
      .set("Authorization", `Bearer ${revoked.token}`);
    expect((await get(revoked.id)).status).toBe(404);
  });

  it("is 403 with a grant but without vitals.view", async () => {
    const doctor = await createDoctor("noperm", ["patient.view"]);
    const patient = await createPatient("noperm");
    await grant(patient.token, doctor.email, ["vitals.continuous"]);

    const res = await request(app)
      .get(`/api/hospital/patients/${patient.id}/vitals`)
      .set("Authorization", `Bearer ${doctor.token}`);
    expect(res.status).toBe(403);
  });

  it("is 403 once the doctor's membership is disabled, grant or not", async () => {
    const doctor = await createDoctor("disabled", ["vitals.view"]);
    const patient = await createPatient("disabled");
    await grant(patient.token, doctor.email, ["vitals.continuous"]);
    await HospitalMembershipModel.updateOne({ _id: doctor.membershipId }, { status: "disabled" });

    const res = await request(app)
      .get(`/api/hospital/patients/${patient.id}/vitals`)
      .set("Authorization", `Bearer ${doctor.token}`);
    expect(res.status).toBe(403);
  });

  it("is Hospital Portal only", async () => {
    const patient = await createPatient("patientportal");
    const res = await request(app)
      .get(`/api/hospital/patients/${patient.id}/vitals`)
      .set("Authorization", `Bearer ${patient.token}`);
    expect(res.status).toBe(403);
  });
});

describe("Sepsis Watch series", () => {
  const watch = (token: string, patientId: string) =>
    request(app).get(`/api/hospital/patients/${patientId}/sepsis-watch`).set("Authorization", `Bearer ${token}`);

  // Hourly readings ending now; null entries are hours with nothing recorded
  // (no reading is sent for them, so they stay gaps in the series).
  async function recordStay(token: string, hourly: (Record<string, number> | null)[]) {
    const start = Date.now() - hourly.length * HOUR_MS;
    for (const [hour, values] of hourly.entries()) {
      if (values) expect((await record(token, { recordedAt: new Date(start + hour * HOUR_MS).toISOString(), ...values })).status).toBe(201);
    }
  }

  it("returns hourly vitals, each model's risk, the alert hours and the alert levels", async () => {
    const doctor = await createDoctor("watch", ["vitals.view"]);
    const patient = await createPatient("watch");
    await grant(patient.token, doctor.email, ["vitals.continuous"]);
    highFromHour = 2;
    await recordStay(patient.token, [{ HR: 80 }, { HR: 85 }, { HR: 90 }, { HR: 95 }]);

    const res = await watch(doctor.token, patient.id);
    expect(res.status).toBe(200);
    expect(res.body.patient).toMatchObject({ name: "Patient watch", age: expect.any(Number), gender: "male" });
    expect(res.body.hours.map((h: { HR: number }) => h.HR)).toEqual([80, 85, 90, 95]);
    expect(res.body.risk.xgboost).toHaveLength(4);
    expect(res.body.risk.ssl_lstm[0]).toMatchObject({ hour: 0, probability: 0.02, riskLevel: "LOW", alert: false });
    expect(res.body.alertHours).toEqual({ xgboost: [2, 3], ssl_lstm: [2, 3] });
    expect(res.body.alertLevels.ssl_lstm).toEqual({ high: 0.057, elevated: 0.025 });
    expect(res.body.primary).toBe("ssl_lstm");
    expect(res.body.comparison[0].Model).toBe("XGBoost");
    expect(res.body.warnings[0]).toEqual({ hour: 0, warnings: ["Only 1 of 6 hours of history so far."] });
    // A live patient has no known label or onset, so there is nothing to mark.
    expect(res.body.simulation).toBeNull();
    expect(JSON.stringify(res.body)).not.toMatch(/diagnos|sepsis detected/i);
  });

  it("keeps hours with no reading as empty slots on the shared axis", async () => {
    const doctor = await createDoctor("gaps", ["vitals.view"]);
    const patient = await createPatient("gaps");
    await grant(patient.token, doctor.email, ["vitals.continuous"]);
    await recordStay(patient.token, [{ HR: 80 }, null, null, { O2Sat: 95 }]);

    const res = await watch(doctor.token, patient.id);
    expect(res.body.hours).toHaveLength(4);
    expect(res.body.hours[1]).toEqual({ hour: 1, HR: null, O2Sat: null, Temp: null, Resp: null });
    expect(res.body.hours[3]).toMatchObject({ HR: null, O2Sat: 95 });
    expect(res.body.risk.ssl_lstm.map((p: { hour: number }) => p.hour)).toEqual([0, 3]);
  });

  it("is an empty series for a patient with no readings yet", async () => {
    const doctor = await createDoctor("empty", ["vitals.view"]);
    const patient = await createPatient("empty");
    await grant(patient.token, doctor.email, ["vitals.continuous"]);

    const res = await watch(doctor.token, patient.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ hours: [], risk: {}, alertHours: {}, startsAt: null });
  });

  it("is 404 without an active vitals.continuous grant to THIS doctor (no cross-doctor or cross-hospital reads)", async () => {
    const doctorA = await createDoctor("isoa", ["vitals.view"]);
    const doctorB = await createDoctor("isob", ["vitals.view"]);
    const patient = await createPatient("iso");
    await record(patient.token, reading());
    await grant(patient.token, doctorA.email, ["vitals.continuous"]);

    expect((await watch(doctorA.token, patient.id)).status).toBe(200);
    expect((await watch(doctorB.token, patient.id)).status).toBe(404);
    expect((await watch(doctorB.token, new mongoose.Types.ObjectId().toString())).status).toBe(404);

    const occasionalOnly = await createPatient("isoocc");
    await grant(occasionalOnly.token, doctorB.email, ["vitals.occasional"]);
    expect((await watch(doctorB.token, occasionalOnly.id)).status).toBe(404);
  });

  it("is 403 without vitals.view even with a grant, and Hospital Portal only", async () => {
    const doctor = await createDoctor("noview", ["patient.view"]);
    const patient = await createPatient("noview");
    await grant(patient.token, doctor.email, ["vitals.continuous"]);

    expect((await watch(doctor.token, patient.id)).status).toBe(403);
    expect((await watch(patient.token, patient.id)).status).toBe(403);
  });

  it("still returns the stored curves when the model service is down at read time, without alert levels or metrics", async () => {
    const doctor = await createDoctor("down", ["vitals.view"]);
    const patient = await createPatient("down");
    await grant(patient.token, doctor.email, ["vitals.continuous"]);
    highFromHour = 1;
    await recordStay(patient.token, [{ HR: 80 }, { HR: 90 }]);

    modelInfoDown = true;
    const res = await watch(doctor.token, patient.id);
    expect(res.status).toBe(200);
    expect(res.body.alertHours.ssl_lstm).toEqual([1]);
    expect(res.body.alertLevels).toBeNull();
    expect(res.body.comparison).toBeNull();
    expect(res.body.primary).toBeNull();
    expect(res.body.models.map((m: { key: string }) => m.key).sort()).toEqual(["ssl_lstm", "xgboost"]);
  });

  it("shows vitals with no risk curve when the model service was down at ingestion", async () => {
    const doctor = await createDoctor("ingestdown", ["vitals.view"]);
    const patient = await createPatient("ingestdown");
    await grant(patient.token, doctor.email, ["vitals.continuous"]);
    seriesRespond = async () => new Response("boom", { status: 500 });
    await recordStay(patient.token, [{ HR: 80 }, { HR: 90 }]);

    const res = await watch(doctor.token, patient.id);
    expect(res.status).toBe(200);
    expect(res.body.hours).toHaveLength(2);
    expect(res.body.risk).toEqual({});
    expect(await AlertModel.countDocuments({ patientId: patient.id })).toBe(0);
  });

  it("doesn't store a curve for a patient the model can't score (no gender)", async () => {
    const doctor = await createDoctor("nogender", ["vitals.view"]);
    const patient = await createPatient("nogender", { gender: undefined });
    await grant(patient.token, doctor.email, ["vitals.continuous"]);
    await record(patient.token, reading());

    const res = await watch(doctor.token, patient.id);
    expect(res.body.hours).toHaveLength(1);
    expect(res.body.risk).toEqual({});
    expect(await HourlyRiskModel.countDocuments({ patientId: patient.id })).toBe(0);
  });

  it("reports the label and onset hours only for a simulated stay", async () => {
    const doctor = await createDoctor("sim", ["vitals.view"]);
    const patient = await createPatient("sim");
    await grant(patient.token, doctor.email, ["vitals.continuous"]);
    await record(patient.token, reading());
    await SimulatedStayModel.create({ patientId: patient.id, sampleId: "p012210", labelHour: 37 });

    const res = await watch(doctor.token, patient.id);
    expect(res.body.simulation).toEqual({ sampleId: "p012210", labelStartsHour: 37, onsetHour: 43 });
  });
});

describe("Alerts list and acknowledge", () => {
  it("lists active alerts only for consenting patients, and acknowledges them once", async () => {
    const doctor = await createDoctor("alerts", ["alerts.view", "alerts.acknowledge"]);
    const patient = await createPatient("alerts");
    const other = await createPatient("alertsother");
    await grant(patient.token, doctor.email, ["vitals.continuous"]);
    mlReturns("HIGH", 0.08);
    await record(patient.token, reading());
    await record(other.token, reading());

    const listed = await request(app).get("/api/hospital/alerts").set("Authorization", `Bearer ${doctor.token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.alerts).toHaveLength(1);
    expect(listed.body.alerts[0]).toMatchObject({
      patientId: patient.id,
      trigger: { riskLevel: "HIGH", sepsisProbability: 0.08 },
      current: { riskLevel: "HIGH", sepsisProbability: 0.08 },
    });

    const alertId = listed.body.alerts[0].id;
    const ack = (id: string) =>
      request(app).post(`/api/hospital/alerts/${id}/acknowledge`).set("Authorization", `Bearer ${doctor.token}`);
    expect((await ack(alertId)).status).toBe(200);
    expect((await ack(alertId)).status).toBe(409);

    const otherAlert = await AlertModel.findOne({ patientId: other.id });
    expect((await ack(otherAlert!._id.toString())).status).toBe(404);

    const after = await request(app).get("/api/hospital/alerts").set("Authorization", `Bearer ${doctor.token}`);
    expect(after.body.alerts).toHaveLength(0);

    // A HIGH after acknowledging is a new alert, not the old one reopened.
    await record(patient.token, reading());
    expect(await AlertModel.countDocuments({ patientId: patient.id, status: "active" })).toBe(1);
    expect(await AlertModel.countDocuments({ patientId: patient.id })).toBe(2);
  });

  it("needs alerts.view to list and alerts.acknowledge to acknowledge", async () => {
    const viewer = await createDoctor("viewonly", ["alerts.view"]);
    const nobody = await createDoctor("noalerts", ["patient.view"]);
    const patient = await createPatient("alertperms");
    await grant(patient.token, viewer.email, ["vitals.continuous"]);
    await grant(patient.token, nobody.email, ["vitals.continuous"]);
    mlReturns("HIGH", 0.08);
    await record(patient.token, reading());
    const alert = await AlertModel.findOne({ patientId: patient.id, status: "active" });

    const list = await request(app).get("/api/hospital/alerts").set("Authorization", `Bearer ${nobody.token}`);
    expect(list.status).toBe(403);

    const ack = await request(app)
      .post(`/api/hospital/alerts/${alert!._id}/acknowledge`)
      .set("Authorization", `Bearer ${viewer.token}`);
    expect(ack.status).toBe(403);
  });
});

describe("Capability flags on GET /me", () => {
  it("reflects the doctor's current vitals/alerts permissions", async () => {
    const doctor = await createDoctor("flags", ["vitals.view", "alerts.view"]);
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${doctor.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.hospital).toMatchObject({
      canViewVitals: true,
      canViewAlerts: true,
      canAcknowledgeAlerts: false,
      canViewPatients: false,
    });
  });
});
