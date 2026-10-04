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
import * as hospitalService from "../domain/hospital.service";
import { hashValue } from "../utils/hash";

// The sepsis model service is faked at the fetch level: every other fetch
// (Brevo, for the welcome emails createHospitalWithAdmin/addStaff send) goes
// through untouched. The model itself is tested in ml-service/, not here.
const HOUR_MS = 60 * 60 * 1000;
const realFetch = globalThis.fetch;
let mlCalls: { history: Record<string, number | null>[] }[] = [];
let mlRespond: () => Promise<Response>;

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

async function createPatient(label: string): Promise<{ id: string; token: string }> {
  const email = `vitals.patient.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
  const password = "PatientPass1!";
  const user = await UserModel.create({
    name: `Patient ${label}`,
    email,
    passwordHash: await hashValue(password),
    roles: ["patient"],
    isVerified: true,
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
      mlCalls.push(JSON.parse(String(init?.body)));
      return mlRespond();
    }
    return realFetch(input, init);
  });
});

beforeEach(() => {
  mlCalls = [];
  mlReturns("LOW");
});

afterAll(async () => {
  vi.restoreAllMocks();
  const users = await UserModel.find({ email: { $in: cleanupUserEmails } });
  const userIds = users.map((u) => u._id);
  await VitalsReadingModel.deleteMany({ patientId: { $in: userIds } });
  await SepsisPredictionModel.deleteMany({ patientId: { $in: userIds } });
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
    expect(res.body.reading.SBP).toBeNull();
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
    expect(Object.keys(sent)).toEqual(["history"]);
    const nulls = { O2Sat: null, SBP: null, MAP: null, DBP: null, Resp: null };
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
