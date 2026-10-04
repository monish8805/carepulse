import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import app from "../app";
import { connectToDatabase } from "../config/db";
import { UserModel } from "../models/user.model";
import { HospitalModel } from "../models/hospital.model";
import { HospitalMembershipModel } from "../models/hospitalMembership.model";
import { AccessRoleModel } from "../models/accessRole.model";
import { PatientConsentModel } from "../models/patientConsent.model";
import * as hospitalService from "../domain/hospital.service";
import { hashValue } from "../utils/hash";

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
  const email = `profile.patient.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
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

// A hospital + admin, a role holding vitals.view, and an active staff member
// with it — same shape as vitals.test.ts's helper.
async function createDoctor(label: string): Promise<{ email: string; token: string }> {
  const hospital = await hospitalService.createHospitalWithAdmin({
    hospitalName: `Profile Hospital ${label} ${Date.now()}`,
    adminName: "Admin",
    adminEmail: `profile.admin.${label}.${Date.now()}@example.com`,
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
    .send({ name: `Role ${label} ${Date.now()}`, permissions: ["vitals.view", "patient.view"] });
  const email = `profile.doctor.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
  const addRes = await request(app)
    .post("/api/hospital/staff")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: `Dr. ${label}`, email, accessRoleId: roleRes.body.accessRole.id });
  expect(addRes.status).toBe(201);
  cleanupUserEmails.push(email);
  const knownPassword = "DoctorPass1!";
  await UserModel.updateOne({ email }, { passwordHash: await hashValue(knownPassword) });
  return { email, token: await selectHospital(await loginAs(email, knownPassword, "hospital"), hospital.hospital.id) };
}

function updateProfile(token: string, body: Record<string, unknown>) {
  return request(app).patch("/api/patient/profile").set("Authorization", `Bearer ${token}`).send(body);
}

beforeAll(async () => {
  await connectToDatabase();
});

afterAll(async () => {
  const users = await UserModel.find({ email: { $in: cleanupUserEmails } });
  const userIds = users.map((u) => u._id);
  await PatientConsentModel.deleteMany({ $or: [{ patientId: { $in: userIds } }, { doctorId: { $in: userIds } }] });
  await AccessRoleModel.deleteMany({ hospital: { $in: cleanupHospitalIds } });
  await HospitalMembershipModel.deleteMany({ hospitalId: { $in: cleanupHospitalIds } });
  await HospitalModel.deleteMany({ _id: { $in: cleanupHospitalIds } });
  await UserModel.deleteMany({ email: { $in: cleanupUserEmails } });
  await mongoose.disconnect();
});

const VALID = { dateOfBirth: "1990-01-01", gender: "male", bloodType: "O+" };

describe("Patient profile: date of birth, gender, blood type, guardian phone", () => {
  it("starts empty, is saved, and comes back on /me", async () => {
    const patient = await createPatient("save");
    const before = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${patient.token}`);
    expect(before.body.user).toMatchObject({ dateOfBirth: null, gender: null, bloodType: null, guardianPhone: null });

    const saved = {
      dateOfBirth: "1981-04-12T00:00:00.000Z",
      gender: "female",
      bloodType: "AB-",
      guardianPhone: "+91 98765 43210",
    };
    const res = await updateProfile(patient.token, { ...saved, dateOfBirth: "1981-04-12" });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject(saved);

    const after = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${patient.token}`);
    expect(after.body.user).toMatchObject(saved);
  });

  it("treats the guardian phone as optional, and clears it when sent empty", async () => {
    const patient = await createPatient("guardian");
    const withoutGuardian = await updateProfile(patient.token, { ...VALID, bloodType: "unknown" });
    expect(withoutGuardian.status).toBe(200);
    expect(withoutGuardian.body.user).toMatchObject({ bloodType: "unknown", guardianPhone: null });

    await updateProfile(patient.token, { ...VALID, guardianPhone: "0123 456 789" });
    const cleared = await updateProfile(patient.token, { ...VALID, guardianPhone: "" });
    expect(cleared.body.user.guardianPhone).toBeNull();
  });

  it("rejects a future or implausibly old date, a bad gender, and missing fields", async () => {
    const patient = await createPatient("invalid");
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const cases = [
      { ...VALID, dateOfBirth: tomorrow },
      { ...VALID, dateOfBirth: "1850-01-01" },
      { ...VALID, gender: "unknown" },
      { ...VALID, dateOfBirth: "not a date" },
      { ...VALID, bloodType: "C+" },
      { ...VALID, guardianPhone: "call my mum" },
      { ...VALID, guardianPhone: "12345" },
      { ...VALID, guardianPhone: 9876543210 },
      { gender: "male", bloodType: "O+" },
      { dateOfBirth: "1990-01-01", bloodType: "O+" },
      { dateOfBirth: "1990-01-01", gender: "male" },
    ];
    for (const body of cases) {
      expect((await updateProfile(patient.token, body)).status).toBe(400);
    }
    const stored = await UserModel.findById(patient.id);
    expect(stored!.dateOfBirth).toBeUndefined();
  });

  it("is Patient Portal only", async () => {
    const doctor = await createDoctor("portal");
    const res = await updateProfile(doctor.token, VALID);
    expect(res.status).toBe(403);
  });

  it("reaches a doctor only through the consent-gated reads", async () => {
    const doctor = await createDoctor("visible");
    const patient = await createPatient("visible");
    await updateProfile(patient.token, {
      dateOfBirth: "1979-09-30",
      gender: "other",
      bloodType: "B+",
      guardianPhone: "+1 555 010 0199",
    });

    const before = await request(app)
      .get(`/api/hospital/patients/${patient.id}/vitals`)
      .set("Authorization", `Bearer ${doctor.token}`);
    expect(before.status).toBe(404);

    await request(app)
      .post("/api/patient/consents")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ doctorEmail: doctor.email, dataCategories: ["vitals.continuous"] });

    const vitals = await request(app)
      .get(`/api/hospital/patients/${patient.id}/vitals`)
      .set("Authorization", `Bearer ${doctor.token}`);
    expect(vitals.body.patient).toMatchObject({
      dateOfBirth: "1979-09-30T00:00:00.000Z",
      gender: "other",
      bloodType: "B+",
      guardianPhone: "+1 555 010 0199",
    });

    const list = await request(app).get("/api/hospital/patient-consents").set("Authorization", `Bearer ${doctor.token}`);
    expect(list.body.patients[0]).toMatchObject({
      patientDateOfBirth: "1979-09-30T00:00:00.000Z",
      patientGender: "other",
    });
  });
});
