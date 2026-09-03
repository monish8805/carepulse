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

async function createPatient(label: string): Promise<{ email: string; token: string }> {
  const email = `patientconsent.patient.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
  const password = "PatientPass1!";
  const passwordHash = await hashValue(password);
  await UserModel.create({ name: `Patient ${label}`, email, passwordHash, roles: ["patient"], isVerified: true });
  cleanupUserEmails.push(email);
  const token = await loginAs(email, password, "patient");
  return { email, token };
}

// Creates a hospital + admin, an AccessRole with the given permissions, and an
// active staff member holding it — the "real, currently active doctor" shape
// lookupDoctorByEmail requires.
async function createDoctor(
  label: string,
  permissions: string[]
): Promise<{ email: string; token: string; hospitalId: string; hospitalName: string; membershipId: string }> {
  const hospitalName = `Patient Consent Hospital ${label} ${Date.now()}`;
  const hospital = await hospitalService.createHospitalWithAdmin({
    hospitalName,
    adminName: "Admin",
    adminEmail: `patientconsent.admin.${label}.${Date.now()}@example.com`,
  });
  cleanupHospitalIds.push(hospital.hospital.id);
  cleanupUserEmails.push(hospital.admin.email);
  const adminRaw = await loginAs(hospital.admin.email, hospital.temporaryPassword, "hospital");
  const adminToken = await selectHospital(adminRaw, hospital.hospital.id);

  const roleRes = await request(app)
    .post("/api/hospital/access-roles")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: `DoctorRole ${label} ${Date.now()}`, permissions });
  const roleId = roleRes.body.accessRole.id;

  const doctorEmail = `patientconsent.doctor.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
  const addRes = await request(app)
    .post("/api/hospital/staff")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: `Dr. ${label}`, email: doctorEmail, accessRoleId: roleId });
  expect(addRes.status).toBe(201);
  cleanupUserEmails.push(doctorEmail);

  const doctorUser = await UserModel.findOne({ email: doctorEmail });
  // addStaffDirectly emails a temp password rather than returning it over
  // HTTP (see staffManagement.test.ts's own note on this) — overwrite it with
  // a known one directly for test control, same shortcut used there.
  const knownPassword = "DoctorPass1!";
  await UserModel.updateOne(
    { _id: doctorUser!._id },
    { specialization: `${label} Specialist`, passwordHash: await hashValue(knownPassword) }
  );
  const token = await loginAs(doctorEmail, knownPassword, "hospital");
  const doctorToken = await selectHospital(token, hospital.hospital.id);

  return {
    email: doctorEmail,
    token: doctorToken,
    hospitalId: hospital.hospital.id,
    hospitalName,
    membershipId: addRes.body.membershipId,
  };
}

beforeAll(async () => {
  await connectToDatabase();
});

afterAll(async () => {
  await PatientConsentModel.deleteMany({ patientId: { $exists: true } }).then(async () => {
    const emails = cleanupUserEmails;
    const users = await UserModel.find({ email: { $in: emails } });
    const userIds = users.map((u) => u._id);
    await PatientConsentModel.deleteMany({ $or: [{ patientId: { $in: userIds } }, { doctorId: { $in: userIds } }] });
  });
  await AccessRoleModel.deleteMany({ hospital: { $in: cleanupHospitalIds } });
  await HospitalMembershipModel.deleteMany({ hospitalId: { $in: cleanupHospitalIds } });
  await HospitalModel.deleteMany({ _id: { $in: cleanupHospitalIds } });
  await UserModel.deleteMany({ email: { $in: cleanupUserEmails } });
  await mongoose.disconnect();
});

describe("Doctor lookup (patient-facing)", () => {
  it("finds a real, currently active doctor by email", async () => {
    const doctor = await createDoctor("lookupfound", ["patient.view"]);
    const patient = await createPatient("lookupfound");

    const res = await request(app)
      .get(`/api/patient/doctors?email=${encodeURIComponent(doctor.email)}`)
      .set("Authorization", `Bearer ${patient.token}`);
    expect(res.status).toBe(200);
    expect(res.body.doctor.name).toBe("Dr. lookupfound");
    expect(res.body.doctor.specialization).toBe("lookupfound Specialist");
    expect(res.body.doctor.hospitalName).toBe(doctor.hospitalName);
  });

  it("returns the same generic not-found for a nonexistent email", async () => {
    const patient = await createPatient("lookupnonexistent");
    const res = await request(app)
      .get(`/api/patient/doctors?email=nobody.${Date.now()}@example.com`)
      .set("Authorization", `Bearer ${patient.token}`);
    expect(res.status).toBe(404);
  });

  it("returns the same generic not-found for a non-hospital (e.g. patient) account", async () => {
    const patient = await createPatient("lookupself");
    const otherPatient = await createPatient("lookuptarget");
    const res = await request(app)
      .get(`/api/patient/doctors?email=${encodeURIComponent(otherPatient.email)}`)
      .set("Authorization", `Bearer ${patient.token}`);
    expect(res.status).toBe(404);
  });

  it("returns the same generic not-found for a hospital account with no active membership", async () => {
    const doctor = await createDoctor("lookupremoved", ["patient.view"]);
    // Flip the membership to removed directly via the model — re-deriving an
    // admin session just to call the real removal endpoint would duplicate
    // createDoctor's own setup for no additional coverage.
    await HospitalMembershipModel.updateOne({ _id: doctor.membershipId }, { status: "removed" });

    const patient = await createPatient("lookupremovedpatient");
    const res = await request(app)
      .get(`/api/patient/doctors?email=${encodeURIComponent(doctor.email)}`)
      .set("Authorization", `Bearer ${patient.token}`);
    expect(res.status).toBe(404);
  });
});

describe("Grant / edit / revoke", () => {
  it("grants access with valid categories", async () => {
    const doctor = await createDoctor("grant", ["patient.view"]);
    const patient = await createPatient("grant");

    const res = await request(app)
      .post("/api/patient/consents")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ doctorEmail: doctor.email, dataCategories: ["vitals.continuous"] });
    expect(res.status).toBe(201);
    expect(res.body.grant.status).toBe("active");
    expect(res.body.grant.dataCategories).toEqual(["vitals.continuous"]);
  });

  it("rejects an unknown data category", async () => {
    const doctor = await createDoctor("badcategory", ["patient.view"]);
    const patient = await createPatient("badcategory");

    const res = await request(app)
      .post("/api/patient/consents")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ doctorEmail: doctor.email, dataCategories: ["not.a.real.category"] });
    expect(res.status).toBe(400);
  });

  it("rejects an empty category list", async () => {
    const doctor = await createDoctor("emptycategory", ["patient.view"]);
    const patient = await createPatient("emptycategory");

    const res = await request(app)
      .post("/api/patient/consents")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ doctorEmail: doctor.email, dataCategories: [] });
    expect(res.status).toBe(400);
  });

  it("rejects granting to a non-doctor email", async () => {
    const patient = await createPatient("grantbad1");
    const otherPatient = await createPatient("grantbad2");

    const res = await request(app)
      .post("/api/patient/consents")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ doctorEmail: otherPatient.email, dataCategories: ["vitals.continuous"] });
    expect(res.status).toBe(404);
  });

  it("lets the patient edit categories on an active grant", async () => {
    const doctor = await createDoctor("edit", ["patient.view"]);
    const patient = await createPatient("edit");
    const created = await request(app)
      .post("/api/patient/consents")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ doctorEmail: doctor.email, dataCategories: ["vitals.continuous"] });
    const grantId = created.body.grant.id;

    const res = await request(app)
      .patch(`/api/patient/consents/${grantId}`)
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ dataCategories: ["vitals.occasional"] });
    expect(res.status).toBe(200);
    expect(res.body.grant.dataCategories).toEqual(["vitals.occasional"]);
  });

  it("a doctor's hospital-portal session cannot reach the patient-only edit route at all (portal isolation)", async () => {
    const doctor = await createDoctor("editblocked", ["patient.view"]);
    const patient = await createPatient("editblocked");
    const created = await request(app)
      .post("/api/patient/consents")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ doctorEmail: doctor.email, dataCategories: ["vitals.continuous"] });
    const grantId = created.body.grant.id;

    const res = await request(app)
      .patch(`/api/patient/consents/${grantId}`)
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({ dataCategories: ["vitals.occasional"] });
    expect(res.status).toBe(403);
  });

  it("the patient can revoke, and the doctor's granted-patients list reflects it", async () => {
    const doctor = await createDoctor("revokepatient", ["patient.view"]);
    const patient = await createPatient("revokepatient");
    const created = await request(app)
      .post("/api/patient/consents")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ doctorEmail: doctor.email, dataCategories: ["vitals.continuous"] });
    const grantId = created.body.grant.id;

    const revoke = await request(app)
      .post(`/api/patient/consents/${grantId}/revoke`)
      .set("Authorization", `Bearer ${patient.token}`);
    expect(revoke.status).toBe(200);
    expect(revoke.body.grant.status).toBe("revoked");

    const list = await request(app)
      .get("/api/hospital/patient-consents")
      .set("Authorization", `Bearer ${doctor.token}`);
    expect(list.status).toBe(200);
    expect(list.body.patients.find((p: { id: string }) => p.id === grantId)).toBeUndefined();
  });

  it("the doctor can revoke their own granted access", async () => {
    const doctor = await createDoctor("revokedoctor", ["patient.view"]);
    const patient = await createPatient("revokedoctor");
    const created = await request(app)
      .post("/api/patient/consents")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ doctorEmail: doctor.email, dataCategories: ["vitals.continuous"] });
    const grantId = created.body.grant.id;

    const res = await request(app)
      .post(`/api/hospital/patient-consents/${grantId}/revoke`)
      .set("Authorization", `Bearer ${doctor.token}`);
    expect(res.status).toBe(200);
    expect(res.body.grant.status).toBe("revoked");
  });

  it("a doctor cannot revoke a grant that doesn't name them", async () => {
    const doctorA = await createDoctor("revokecrossa", ["patient.view"]);
    const doctorB = await createDoctor("revokecrossb", ["patient.view"]);
    const patient = await createPatient("revokecross");
    const created = await request(app)
      .post("/api/patient/consents")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ doctorEmail: doctorA.email, dataCategories: ["vitals.continuous"] });
    const grantId = created.body.grant.id;

    const res = await request(app)
      .post(`/api/hospital/patient-consents/${grantId}/revoke`)
      .set("Authorization", `Bearer ${doctorB.token}`);
    expect(res.status).toBe(404);
  });

  it("cannot revoke an already-revoked grant", async () => {
    const doctor = await createDoctor("doublerevoke", ["patient.view"]);
    const patient = await createPatient("doublerevoke");
    const created = await request(app)
      .post("/api/patient/consents")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ doctorEmail: doctor.email, dataCategories: ["vitals.continuous"] });
    const grantId = created.body.grant.id;
    await request(app)
      .post(`/api/patient/consents/${grantId}/revoke`)
      .set("Authorization", `Bearer ${patient.token}`);

    const res = await request(app)
      .post(`/api/patient/consents/${grantId}/revoke`)
      .set("Authorization", `Bearer ${patient.token}`);
    expect(res.status).toBe(409);
  });

  it("cannot edit a revoked grant", async () => {
    const doctor = await createDoctor("editrevoked", ["patient.view"]);
    const patient = await createPatient("editrevoked");
    const created = await request(app)
      .post("/api/patient/consents")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ doctorEmail: doctor.email, dataCategories: ["vitals.continuous"] });
    const grantId = created.body.grant.id;
    await request(app)
      .post(`/api/patient/consents/${grantId}/revoke`)
      .set("Authorization", `Bearer ${patient.token}`);

    const res = await request(app)
      .patch(`/api/patient/consents/${grantId}`)
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ dataCategories: ["vitals.occasional"] });
    expect(res.status).toBe(409);
  });

  it("a revoked grant can be re-granted, reusing the same document", async () => {
    const doctor = await createDoctor("regrant", ["patient.view"]);
    const patient = await createPatient("regrant");
    const created = await request(app)
      .post("/api/patient/consents")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ doctorEmail: doctor.email, dataCategories: ["vitals.continuous"] });
    const grantId = created.body.grant.id;
    await request(app)
      .post(`/api/patient/consents/${grantId}/revoke`)
      .set("Authorization", `Bearer ${patient.token}`);

    const res = await request(app)
      .post("/api/patient/consents")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ doctorEmail: doctor.email, dataCategories: ["vitals.occasional"] });
    expect(res.status).toBe(201);
    expect(res.body.grant.id).toBe(grantId);
    expect(res.body.grant.status).toBe("active");
    expect(res.body.grant.dataCategories).toEqual(["vitals.occasional"]);
  });

  it("a patient sees their full grant history (any status) via listMyGrants", async () => {
    const doctor = await createDoctor("mine", ["patient.view"]);
    const patient = await createPatient("mine");
    await request(app)
      .post("/api/patient/consents")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ doctorEmail: doctor.email, dataCategories: ["vitals.continuous"] });

    const res = await request(app).get("/api/patient/consents").set("Authorization", `Bearer ${patient.token}`);
    expect(res.status).toBe(200);
    expect(res.body.grants).toHaveLength(1);
    expect(res.body.grants[0].doctorName).toBe("Dr. mine");
  });
});

describe("Doctor-side visibility requires patient.view", () => {
  it("a staff member without patient.view gets 403 listing granted patients, even with a real grant naming them", async () => {
    const doctor = await createDoctor("nopermission", []); // no patient.view
    const patient = await createPatient("nopermission");
    await request(app)
      .post("/api/patient/consents")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ doctorEmail: doctor.email, dataCategories: ["vitals.continuous"] });

    const res = await request(app)
      .get("/api/hospital/patient-consents")
      .set("Authorization", `Bearer ${doctor.token}`);
    expect(res.status).toBe(403);
  });

  it("a doctor only ever sees grants naming them, not another doctor's patients", async () => {
    const doctorA = await createDoctor("isolationa", ["patient.view"]);
    const doctorB = await createDoctor("isolationb", ["patient.view"]);
    const patient = await createPatient("isolation");
    await request(app)
      .post("/api/patient/consents")
      .set("Authorization", `Bearer ${patient.token}`)
      .send({ doctorEmail: doctorA.email, dataCategories: ["vitals.continuous"] });

    const resA = await request(app)
      .get("/api/hospital/patient-consents")
      .set("Authorization", `Bearer ${doctorA.token}`);
    expect(resA.body.patients).toHaveLength(1);

    const resB = await request(app)
      .get("/api/hospital/patient-consents")
      .set("Authorization", `Bearer ${doctorB.token}`);
    expect(resB.body.patients).toHaveLength(0);
  });
});

describe("Doctor profile (specialization)", () => {
  it("lets a hospital-portal user set their own specialization, reflected in GET /me", async () => {
    const doctor = await createDoctor("profile", ["patient.view"]);

    const update = await request(app)
      .patch("/api/hospital/profile")
      .set("Authorization", `Bearer ${doctor.token}`)
      .send({ specialization: "Neurologist" });
    expect(update.status).toBe(200);
    expect(update.body.user.specialization).toBe("Neurologist");

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${doctor.token}`);
    expect(me.body.user.specialization).toBe("Neurologist");
  });
});
