import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
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
import { requireAuth, requirePortal } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { Permission } from "../config/permissions";

const OWNER_EMAIL = "monureddig@gmail.com";
const OWNER_PASSWORD = "123456";

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

// A user directly created for test setup (no self-registration flow exists for
// hospital staff yet — that's a deferred, separate feature). Mirrors what the
// real registration flow produces: bcrypt-hashed password, verified, "hospital" role.
async function createStaffUser(email: string, password: string) {
  const passwordHash = await hashValue(password);
  const user = await UserModel.create({
    name: "Vitest Staff",
    email,
    passwordHash,
    roles: ["hospital"],
    isVerified: true,
  });
  cleanupUserEmails.push(email);
  return user;
}

// A minimal Express app composed from the REAL middleware, used only to prove
// requirePermission works correctly in combination with requireAuth/requirePortal.
// No production route uses requirePermission yet (nothing it would protect —
// vitals/patient endpoints — exists yet), so this is the honest way to test the
// middleware itself without inventing a fake production feature.
const permissionTestApp = express();
permissionTestApp.get(
  "/protected/:permission",
  requireAuth,
  requirePortal("hospital"),
  (req, res, next) => requirePermission(req.params.permission as Permission)(req, res, next),
  (_req, res) => res.status(200).json({ ok: true })
);

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

describe("Dynamic RBAC foundation", () => {
  it("1. an AccessRole can be created for a hospital, by its administrator", async () => {
    const created = await hospitalService.createHospitalWithAdmin({
      hospitalName: `RBAC Hospital A ${Date.now()}`,
      adminName: "Admin A",
      adminEmail: `rbac.admina.${Date.now()}@example.com`,
    });
    cleanupHospitalIds.push(created.hospital.id);
    cleanupUserEmails.push(created.admin.email);

    const adminToken = await selectHospital(
      await loginAs(created.admin.email, created.temporaryPassword, "hospital"),
      created.hospital.id
    );

    const res = await request(app)
      .post("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Cardiologist", permissions: ["patient.view", "vitals.view", "alerts.view"] });

    expect(res.status).toBe(201);
    expect(res.body.accessRole.name).toBe("Cardiologist");
    expect(res.body.accessRole.permissions).toEqual(["patient.view", "vitals.view", "alerts.view"]);
    expect(res.body.accessRole.isActive).toBe(true);

    const stored = await AccessRoleModel.findById(res.body.accessRole.id);
    expect(stored).not.toBeNull();
    expect(stored!.hospital.toString()).toBe(created.hospital.id);
  });

  it("rejects an unknown permission string (catalogue is enforced, not arbitrary strings)", async () => {
    const created = await hospitalService.createHospitalWithAdmin({
      hospitalName: `RBAC Hospital Catalogue ${Date.now()}`,
      adminName: "Admin Cat",
      adminEmail: `rbac.admincat.${Date.now()}@example.com`,
    });
    cleanupHospitalIds.push(created.hospital.id);
    cleanupUserEmails.push(created.admin.email);

    const adminToken = await selectHospital(
      await loginAs(created.admin.email, created.temporaryPassword, "hospital"),
      created.hospital.id
    );

    const res = await request(app)
      .post("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Bad Role", permissions: ["patient.delete_everything"] });

    expect(res.status).toBe(400);
  });

  describe("cross-hospital scoping, permission resolution and enforcement", () => {
    let hospitalAId: string;
    let hospitalBId: string;
    let adminAToken: string;
    let staffEmail: string;
    let staffToken: string;
    let cardiologistRoleId: string;

    beforeAll(async () => {
      const hospitalA = await hospitalService.createHospitalWithAdmin({
        hospitalName: `RBAC Hospital A2 ${Date.now()}`,
        adminName: "Admin A2",
        adminEmail: `rbac.admina2.${Date.now()}@example.com`,
      });
      hospitalAId = hospitalA.hospital.id;
      cleanupHospitalIds.push(hospitalAId);
      cleanupUserEmails.push(hospitalA.admin.email);
      adminAToken = await selectHospital(
        await loginAs(hospitalA.admin.email, hospitalA.temporaryPassword, "hospital"),
        hospitalAId
      );

      const hospitalB = await hospitalService.createHospitalWithAdmin({
        hospitalName: `RBAC Hospital B ${Date.now()}`,
        adminName: "Admin B",
        adminEmail: `rbac.adminb.${Date.now()}@example.com`,
      });
      hospitalBId = hospitalB.hospital.id;
      cleanupHospitalIds.push(hospitalBId);
      cleanupUserEmails.push(hospitalB.admin.email);
      const adminBToken = await selectHospital(
        await loginAs(hospitalB.admin.email, hospitalB.temporaryPassword, "hospital"),
        hospitalBId
      );

      // Create the Cardiologist AccessRole in Hospital A.
      const roleRes = await request(app)
        .post("/api/hospital/access-roles")
        .set("Authorization", `Bearer ${adminAToken}`)
        .send({ name: "Cardiologist", permissions: ["patient.view", "vitals.view"] });
      cardiologistRoleId = roleRes.body.accessRole.id;

      // 2. hospital-scoped: Hospital B's admin does not see Hospital A's role.
      const listB = await request(app)
        .get("/api/hospital/access-roles")
        .set("Authorization", `Bearer ${adminBToken}`);
      expect(listB.status).toBe(200);
      expect(listB.body.accessRoles).toHaveLength(0);

      const listA = await request(app)
        .get("/api/hospital/access-roles")
        .set("Authorization", `Bearer ${adminAToken}`);
      expect(listA.body.accessRoles).toHaveLength(1);
      expect(listA.body.accessRoles[0].id).toBe(cardiologistRoleId);

      // Set up a staff member of Hospital A (no self-request flow exists yet —
      // this is direct test fixture setup, mirroring what that flow will produce).
      staffEmail = `rbac.staff.${Date.now()}@example.com`;
      const staffUser = await createStaffUser(staffEmail, "StaffPass1!");
      await HospitalMembershipModel.create({
        userId: staffUser._id,
        hospitalId: hospitalAId,
        role: "staff",
        status: "active",
        // no accessRoleId yet — test 4 needs this state.
      });
      staffToken = await selectHospital(await loginAs(staffEmail, "StaffPass1!", "hospital"), hospitalAId);
    });

    it("4. staff without an AccessRole is denied", async () => {
      const res = await request(permissionTestApp)
        .get("/protected/patient.view")
        .set("Authorization", `Bearer ${staffToken}`);
      expect(res.status).toBe(403);
    });

    it("3 & 6. assigning an active AccessRole grants exactly its permissions — nothing more — without any new login/refresh", async () => {
      // Same staffToken as the "no role" test above: proves permission changes
      // in MongoDB take effect on the next request, no refresh needed.
      await HospitalMembershipModel.updateOne(
        { userId: (await UserModel.findOne({ email: staffEmail }))!._id, hospitalId: hospitalAId },
        { accessRoleId: cardiologistRoleId }
      );

      const allowed = await request(permissionTestApp)
        .get("/protected/patient.view")
        .set("Authorization", `Bearer ${staffToken}`);
      expect(allowed.status).toBe(200);

      // 6. Missing permission (not granted to this role) returns 403.
      const denied = await request(permissionTestApp)
        .get("/protected/staff.manage")
        .set("Authorization", `Bearer ${staffToken}`);
      expect(denied.status).toBe(403);
    });

    it("7. removing a permission from the database immediately denies the next request", async () => {
      // Still allowed right now (from the previous test's assignment).
      const before = await request(permissionTestApp)
        .get("/protected/vitals.view")
        .set("Authorization", `Bearer ${staffToken}`);
      expect(before.status).toBe(200);

      await AccessRoleModel.updateOne({ _id: cardiologistRoleId }, { permissions: ["patient.view"] });

      const after = await request(permissionTestApp)
        .get("/protected/vitals.view")
        .set("Authorization", `Bearer ${staffToken}`);
      expect(after.status).toBe(403);
    });

    it("5. an inactive AccessRole denies access even though the permission is still on it", async () => {
      const stillAllowed = await request(permissionTestApp)
        .get("/protected/patient.view")
        .set("Authorization", `Bearer ${staffToken}`);
      expect(stillAllowed.status).toBe(200);

      await AccessRoleModel.updateOne({ _id: cardiologistRoleId }, { isActive: false });

      const nowDenied = await request(permissionTestApp)
        .get("/protected/patient.view")
        .set("Authorization", `Bearer ${staffToken}`);
      expect(nowDenied.status).toBe(403);

      // restore for the next test
      await AccessRoleModel.updateOne({ _id: cardiologistRoleId }, { isActive: true });
    });

    it("8. Hospital A staff cannot use Hospital B's AccessRole, even if data pointed at it", async () => {
      const hospitalBRole = await AccessRoleModel.create({
        hospital: hospitalBId,
        name: "Hospital B Only Role",
        permissions: ["patient.view"],
        isActive: true,
        createdBy: (await UserModel.findOne({ email: OWNER_EMAIL }))!._id,
      });

      const staffUser = await UserModel.findOne({ email: staffEmail });
      await HospitalMembershipModel.updateOne(
        { userId: staffUser!._id, hospitalId: hospitalAId },
        { accessRoleId: hospitalBRole._id }
      );

      const res = await request(permissionTestApp)
        .get("/protected/patient.view")
        .set("Authorization", `Bearer ${staffToken}`);
      // Denied: resolvePermissions requires the AccessRole's own `hospital` field
      // to match the current hospital context, not just the membership's.
      expect(res.status).toBe(403);
    });
  });

  it("9. the Platform Owner does not automatically gain hospital access", async () => {
    const ownerToken = await loginAs(OWNER_EMAIL, OWNER_PASSWORD, "owner");

    // Wrong portal — an owner-portal token can never reach hospital-scoped routes.
    const res = await request(app)
      .get("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);

    const ownerUser = await UserModel.findOne({ email: OWNER_EMAIL });
    const anyMembership = await HospitalMembershipModel.findOne({ userId: ownerUser!._id });
    expect(anyMembership).toBeNull();
  });
});
