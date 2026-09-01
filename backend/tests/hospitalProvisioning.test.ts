import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import app from "../app";
import { connectToDatabase } from "../config/db";
import { UserModel } from "../models/user.model";
import { HospitalModel } from "../models/hospital.model";
import { HospitalMembershipModel } from "../models/hospitalMembership.model";
import * as hospitalService from "../domain/hospital.service";

const OWNER_EMAIL = "monureddig@gmail.com";
const OWNER_PASSWORD = "123456";

const TEST_HOSPITAL_NAME = `Vitest Hospital ${Date.now()}`;
const TEST_ADMIN_NAME = "Vitest Admin";
const TEST_ADMIN_EMAIL = `vitest.admin.${Date.now()}@example.com`;

const cleanupHospitalIds: string[] = [];
const cleanupUserEmails: string[] = [TEST_ADMIN_EMAIL];

async function loginAs(email: string, password: string, role: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password, role });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

beforeAll(async () => {
  await connectToDatabase();
});

afterAll(async () => {
  await HospitalMembershipModel.deleteMany({ hospitalId: { $in: cleanupHospitalIds } });
  await HospitalModel.deleteMany({ _id: { $in: cleanupHospitalIds } });
  await UserModel.deleteMany({ email: { $in: cleanupUserEmails } });
  await mongoose.disconnect();
});

describe("Owner -> Hospital -> Hospital Administrator provisioning", () => {
  it("rejects hospital creation with no session", async () => {
    const res = await request(app)
      .post("/api/owner/hospitals")
      .send({ hospitalName: TEST_HOSPITAL_NAME, adminName: TEST_ADMIN_NAME, adminEmail: TEST_ADMIN_EMAIL });
    expect(res.status).toBe(401);
  });

  it("rejects hospital creation from a non-owner portal", async () => {
    const patientToken = await loginAs("patient.test@example.com", "AnotherPass1!", "patient");

    const res = await request(app)
      .post("/api/owner/hospitals")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ hospitalName: TEST_HOSPITAL_NAME, adminName: TEST_ADMIN_NAME, adminEmail: TEST_ADMIN_EMAIL });

    expect(res.status).toBe(403);
  });

  it("owner creates a hospital with an administrator, scoped only to that hospital", async () => {
    const ownerToken = await loginAs(OWNER_EMAIL, OWNER_PASSWORD, "owner");

    const res = await request(app)
      .post("/api/owner/hospitals")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ hospitalName: TEST_HOSPITAL_NAME, adminName: TEST_ADMIN_NAME, adminEmail: TEST_ADMIN_EMAIL });

    expect(res.status).toBe(201);
    expect(res.body.hospital.name).toBe(TEST_HOSPITAL_NAME);
    expect(res.body.admin.email).toBe(TEST_ADMIN_EMAIL);
    // The temporary password must never be exposed over HTTP — it's emailed once.
    expect(res.body.temporaryPassword).toBeUndefined();
    expect(res.body.admin.password).toBeUndefined();

    cleanupHospitalIds.push(res.body.hospital.id);

    const membership = await HospitalMembershipModel.find({ hospitalId: res.body.hospital.id });
    expect(membership).toHaveLength(1);
    expect(membership[0].role).toBe("admin");
    expect(membership[0].status).toBe("active");
    expect(membership[0].userId.toString()).toBe(res.body.admin.id);
  });

  it("the new hospital shows up in the owner's hospital list", async () => {
    const ownerToken = await loginAs(OWNER_EMAIL, OWNER_PASSWORD, "owner");
    const res = await request(app)
      .get("/api/owner/hospitals")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.hospitals.some((h: { name: string }) => h.name === TEST_HOSPITAL_NAME)).toBe(true);
  });

  it("refuses to reuse an email that's already registered (no silent account takeover)", async () => {
    const ownerToken = await loginAs(OWNER_EMAIL, OWNER_PASSWORD, "owner");

    const res = await request(app)
      .post("/api/owner/hospitals")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ hospitalName: "Another Hospital", adminName: "Someone", adminEmail: TEST_ADMIN_EMAIL });

    expect(res.status).toBe(409);
  });

  it("the owner gains no membership in the hospital they created", async () => {
    const ownerUser = await UserModel.findOne({ email: OWNER_EMAIL });
    const ownerMembership = await HospitalMembershipModel.findOne({
      userId: ownerUser!._id,
      hospitalId: cleanupHospitalIds[0],
    });
    expect(ownerMembership).toBeNull();
  });

  it("the administrator logs into the Hospital Portal and establishes context via the existing switching system", async () => {
    // Uses the domain function directly (the same one the HTTP route calls) purely
    // to recover the temporary password, since it's intentionally never returned
    // over HTTP — it was already emailed to a second test admin here.
    const secondAdminEmail = `vitest.admin2.${Date.now()}@example.com`;
    cleanupUserEmails.push(secondAdminEmail);

    const created = await hospitalService.createHospitalWithAdmin({
      hospitalName: `Vitest Hospital B ${Date.now()}`,
      adminName: "Vitest Admin Two",
      adminEmail: secondAdminEmail,
    });
    cleanupHospitalIds.push(created.hospital.id);

    // Log in through the Hospital Portal with the emailed temporary password.
    const adminToken = await loginAs(secondAdminEmail, created.temporaryPassword, "hospital");

    const membershipsRes = await request(app)
      .get("/api/hospital/memberships")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(membershipsRes.status).toBe(200);
    expect(membershipsRes.body.memberships).toHaveLength(1);
    expect(membershipsRes.body.memberships[0].hospitalId).toBe(created.hospital.id);

    // Hospital context is established through the existing server-validated
    // switching system, not trusted from anything the client sends.
    const selectRes = await request(app)
      .post("/api/hospital/select")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ hospitalId: created.hospital.id });
    expect(selectRes.status).toBe(200);
    expect(selectRes.body.hospital.id).toBe(created.hospital.id);
    expect(selectRes.body.hospital.role).toBe("admin");

    const newAccessToken = selectRes.body.accessToken as string;
    const meRes = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${newAccessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.hospital.id).toBe(created.hospital.id);

    // Confirms this administrator cannot select a hospital they don't belong to.
    const otherHospitalRes = await request(app)
      .post("/api/hospital/select")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ hospitalId: cleanupHospitalIds[0] });
    expect(otherHospitalRes.status).toBe(403);
  });
});
