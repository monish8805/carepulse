import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import app from "../app";
import { connectToDatabase } from "../config/db";
import { UserModel } from "../models/user.model";
import { HospitalModel } from "../models/hospital.model";
import { HospitalMembershipModel } from "../models/hospitalMembership.model";
import { AccessRoleModel } from "../models/accessRole.model";
import * as hospitalService from "../domain/hospital.service";
import { hashValue } from "../utils/hash";

const cleanupHospitalIds: string[] = [];
const cleanupUserEmails: string[] = [];

async function loginAs(email: string, password: string, role: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password, role });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

async function selectHospital(token: string, hospitalId: string) {
  return request(app).post("/api/hospital/select").set("Authorization", `Bearer ${token}`).send({ hospitalId });
}

async function createEligibleStaffUser(label: string): Promise<{ email: string; token: string }> {
  const email = `onehospital.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
  const password = "StaffPass1!";
  const passwordHash = await hashValue(password);
  await UserModel.create({ name: `Staff ${label}`, email, passwordHash, roles: ["hospital"], isVerified: true });
  cleanupUserEmails.push(email);
  const token = await loginAs(email, password, "hospital");
  return { email, token };
}

beforeAll(async () => {
  await connectToDatabase();
});

afterAll(async () => {
  await AccessRoleModel.deleteMany({ hospital: { $in: cleanupHospitalIds } });
  await HospitalMembershipModel.deleteMany({ hospitalId: { $in: cleanupHospitalIds } });
  await HospitalModel.deleteMany({ _id: { $in: cleanupHospitalIds } });
  await UserModel.deleteMany({ email: { $in: cleanupUserEmails } });
  await mongoose.disconnect();
});

describe("Phase 1: one account = one hospital", () => {
  let hospitalAId: string;
  let hospitalBId: string;
  let hospitalAName: string;
  let adminAToken: string;
  let adminBToken: string;
  let roleAId: string;
  let roleBId: string;

  beforeAll(async () => {
    hospitalAName = `One Hospital Rule A ${Date.now()}`;
    const hospitalA = await hospitalService.createHospitalWithAdmin({
      hospitalName: hospitalAName,
      adminName: "Admin A",
      adminEmail: `onehospital.admina.${Date.now()}@example.com`,
    });
    hospitalAId = hospitalA.hospital.id;
    cleanupHospitalIds.push(hospitalAId);
    cleanupUserEmails.push(hospitalA.admin.email);
    const adminARaw = await loginAs(hospitalA.admin.email, hospitalA.temporaryPassword, "hospital");
    adminAToken = (await selectHospital(adminARaw, hospitalAId)).body.accessToken;

    const hospitalB = await hospitalService.createHospitalWithAdmin({
      hospitalName: `One Hospital Rule B ${Date.now()}`,
      adminName: "Admin B",
      adminEmail: `onehospital.adminb.${Date.now()}@example.com`,
    });
    hospitalBId = hospitalB.hospital.id;
    cleanupHospitalIds.push(hospitalBId);
    cleanupUserEmails.push(hospitalB.admin.email);
    const adminBRaw = await loginAs(hospitalB.admin.email, hospitalB.temporaryPassword, "hospital");
    adminBToken = (await selectHospital(adminBRaw, hospitalBId)).body.accessToken;

    const roleARes = await request(app)
      .post("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ name: `OneHospitalRoleA ${Date.now()}`, permissions: ["patient.view"] });
    roleAId = roleARes.body.accessRole.id;

    const roleBRes = await request(app)
      .post("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${adminBToken}`)
      .send({ name: `OneHospitalRoleB ${Date.now()}`, permissions: ["patient.view"] });
    roleBId = roleBRes.body.accessRole.id;
  });

  it("blocks requesting a second hospital while an active membership exists elsewhere", async () => {
    const { token } = await createEligibleStaffUser("activeblock");
    const created = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalAId });
    await request(app)
      .post(`/api/hospital/access-requests/${created.body.request.id}/approve`)
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ accessRoleId: roleAId });

    const res = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalBId });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain(hospitalAName);
  });

  it("blocks requesting a second hospital while only a pending request exists elsewhere", async () => {
    const { token } = await createEligibleStaffUser("pendingblock");
    await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalAId });

    const res = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalBId });
    expect(res.status).toBe(409);
  });

  it("a user removed from one hospital can request a different hospital", async () => {
    const { token } = await createEligibleStaffUser("removedthenjoin");
    const created = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalAId });
    const membershipId = created.body.request.id;
    await request(app)
      .post(`/api/hospital/access-requests/${membershipId}/approve`)
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ accessRoleId: roleAId });
    await request(app)
      .delete(`/api/hospital/staff/${membershipId}`)
      .set("Authorization", `Bearer ${adminAToken}`);

    const res = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalBId });
    expect(res.status).toBe(201);
    expect(res.body.request.status).toBe("pending");
  });

  it("a user rejected by one hospital can request a different hospital", async () => {
    const { token } = await createEligibleStaffUser("rejectedthenjoin");
    const created = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalAId });
    await request(app)
      .post(`/api/hospital/access-requests/${created.body.request.id}/reject`)
      .set("Authorization", `Bearer ${adminAToken}`);

    const res = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalBId });
    expect(res.status).toBe(201);
    expect(res.body.request.status).toBe("pending");
  });

  it("blocks an admin from directly adding an existing user who already belongs to another hospital, without naming it", async () => {
    const { token, email } = await createEligibleStaffUser("directblock");
    const created = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalAId });
    await request(app)
      .post(`/api/hospital/access-requests/${created.body.request.id}/approve`)
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ accessRoleId: roleAId });

    const res = await request(app)
      .post("/api/hospital/staff")
      .set("Authorization", `Bearer ${adminBToken}`)
      .send({ name: "Direct Block", email, accessRoleId: roleBId });
    expect(res.status).toBe(409);
    expect(res.body.message).not.toContain(hospitalAName);
  });

  it("allows an admin to directly add an existing user who was removed from another hospital", async () => {
    const { token, email } = await createEligibleStaffUser("directrejoin");
    const created = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalAId });
    const membershipId = created.body.request.id;
    await request(app)
      .post(`/api/hospital/access-requests/${membershipId}/approve`)
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ accessRoleId: roleAId });
    await request(app)
      .delete(`/api/hospital/staff/${membershipId}`)
      .set("Authorization", `Bearer ${adminAToken}`);

    const res = await request(app)
      .post("/api/hospital/staff")
      .set("Authorization", `Bearer ${adminBToken}`)
      .send({ name: "Direct Rejoin", email, accessRoleId: roleBId });
    expect(res.status).toBe(201);
  });

  // Demonstrates the database backstop itself (models/hospitalMembership.model.ts's
  // partial unique index on userId), independent of the application-level checks
  // above — created directly via the model, bypassing accessRequest/staff.service.ts
  // entirely, the way a future bug or new code path might accidentally do.
  it("the database itself refuses a second live membership for the same user", async () => {
    const email = `onehospital.dbbackstop.${Date.now()}@example.com`;
    const passwordHash = await hashValue("DbBackstop1!");
    const user = await UserModel.create({ name: "DB Backstop", email, passwordHash, roles: ["hospital"], isVerified: true });
    cleanupUserEmails.push(email);

    await HospitalMembershipModel.create({ userId: user._id, hospitalId: hospitalAId, role: "staff", status: "active" });

    await expect(
      HospitalMembershipModel.create({ userId: user._id, hospitalId: hospitalBId, role: "staff", status: "pending" })
    ).rejects.toThrow(/E11000|duplicate key/);
  });
});
