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
  const email = `staffmgmt.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
  const password = "StaffPass1!";
  const passwordHash = await hashValue(password);
  await UserModel.create({ name: `Staff ${label}`, email, passwordHash, roles: ["hospital"], isVerified: true });
  cleanupUserEmails.push(email);
  const token = await loginAs(email, password, "hospital");
  return { email, token };
}

// Registers, requests, and gets approved into hospitalId with the given AccessRole.
async function createActiveStaff(
  hospitalId: string,
  adminToken: string,
  accessRoleId: string,
  label: string
): Promise<{ email: string; token: string; membershipId: string }> {
  const { email, token } = await createEligibleStaffUser(label);
  const created = await request(app)
    .post("/api/hospital/access-requests")
    .set("Authorization", `Bearer ${token}`)
    .send({ hospitalId });
  const membershipId = created.body.request.id as string;
  const approved = await request(app)
    .post(`/api/hospital/access-requests/${membershipId}/approve`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ accessRoleId });
  expect(approved.status).toBe(200);
  const selected = await selectHospital(token, hospitalId);
  expect(selected.status).toBe(200);
  return { email, token: selected.body.accessToken, membershipId };
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

describe("AccessRole edit/delete", () => {
  let hospitalId: string;
  let adminToken: string;

  beforeAll(async () => {
    const hospital = await hospitalService.createHospitalWithAdmin({
      hospitalName: `AccessRole CRUD Hospital ${Date.now()}`,
      adminName: "Admin",
      adminEmail: `staffmgmt.admin.${Date.now()}@example.com`,
    });
    hospitalId = hospital.hospital.id;
    cleanupHospitalIds.push(hospitalId);
    cleanupUserEmails.push(hospital.admin.email);
    const raw = await loginAs(hospital.admin.email, hospital.temporaryPassword, "hospital");
    adminToken = (await selectHospital(raw, hospitalId)).body.accessToken;
  });

  it("edits a role's permissions", async () => {
    const created = await request(app)
      .post("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `Editable ${Date.now()}`, permissions: ["patient.view"] });
    const roleId = created.body.accessRole.id;

    const edited = await request(app)
      .patch(`/api/hospital/access-roles/${roleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ permissions: ["patient.view", "vitals.view"] });
    expect(edited.status).toBe(200);
    expect(edited.body.accessRole.permissions.sort()).toEqual(["patient.view", "vitals.view"].sort());
  });

  it("rejects an edit with an unknown permission", async () => {
    const created = await request(app)
      .post("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `RejectEdit ${Date.now()}`, permissions: [] });
    const roleId = created.body.accessRole.id;

    const res = await request(app)
      .patch(`/api/hospital/access-roles/${roleId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ permissions: ["not.a.real.permission"] });
    expect(res.status).toBe(400);
  });

  it("deletes an unused role", async () => {
    const created = await request(app)
      .post("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `Deletable ${Date.now()}`, permissions: [] });
    const roleId = created.body.accessRole.id;

    const deleted = await request(app)
      .delete(`/api/hospital/access-roles/${roleId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleted.status).toBe(200);

    const list = await request(app).get("/api/hospital/access-roles").set("Authorization", `Bearer ${adminToken}`);
    expect(list.body.accessRoles.some((r: { id: string }) => r.id === roleId)).toBe(false);
  });

  it(
    "blocks deleting a role that's assigned to an active staff member",
    async () => {
      const created = await request(app)
        .post("/api/hospital/access-roles")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: `InUse ${Date.now()}`, permissions: [] });
      const roleId = created.body.accessRole.id;

      const staff = await createActiveStaff(hospitalId, adminToken, roleId, "roleinuse");

      const blocked = await request(app)
        .delete(`/api/hospital/access-roles/${roleId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(blocked.status).toBe(409);

      // Once that staff member is removed, the role is no longer in use and can be deleted.
      await request(app)
        .delete(`/api/hospital/staff/${staff.membershipId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      const nowDeletable = await request(app)
        .delete(`/api/hospital/access-roles/${roleId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(nowDeletable.status).toBe(200);
    },
    40000
  );
});

describe("Staff removal authorization", () => {
  let hospitalId: string;
  let adminToken: string;
  let managerRoleId: string;
  let plainRoleId: string;

  beforeAll(async () => {
    const hospital = await hospitalService.createHospitalWithAdmin({
      hospitalName: `Staff Removal Hospital ${Date.now()}`,
      adminName: "Admin",
      adminEmail: `staffmgmt.removaladmin.${Date.now()}@example.com`,
    });
    hospitalId = hospital.hospital.id;
    cleanupHospitalIds.push(hospitalId);
    cleanupUserEmails.push(hospital.admin.email);
    const raw = await loginAs(hospital.admin.email, hospital.temporaryPassword, "hospital");
    adminToken = (await selectHospital(raw, hospitalId)).body.accessToken;

    const managerRole = await request(app)
      .post("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `Manager ${Date.now()}`, permissions: ["staff.manage"] });
    managerRoleId = managerRole.body.accessRole.id;

    const plainRole = await request(app)
      .post("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `PlainStaff ${Date.now()}`, permissions: ["patient.view"] });
    plainRoleId = plainRole.body.accessRole.id;
  });

  it("lists active staff, scoped to the hospital", async () => {
    const staff = await createActiveStaff(hospitalId, adminToken, plainRoleId, "listtest");
    const list = await request(app).get("/api/hospital/staff").set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.staff.some((s: { id: string }) => s.id === staff.membershipId)).toBe(true);
  });

  it("plain staff (no staff.manage) cannot remove anyone", async () => {
    const plain = await createActiveStaff(hospitalId, adminToken, plainRoleId, "plainremover");
    const target = await createActiveStaff(hospitalId, adminToken, plainRoleId, "plaintarget");

    const res = await request(app)
      .delete(`/api/hospital/staff/${target.membershipId}`)
      .set("Authorization", `Bearer ${plain.token}`);
    expect(res.status).toBe(403);
  });

  it("a staff.manage holder can remove a plain staff member", async () => {
    const manager = await createActiveStaff(hospitalId, adminToken, managerRoleId, "manager1");
    const target = await createActiveStaff(hospitalId, adminToken, plainRoleId, "target1");

    const res = await request(app)
      .delete(`/api/hospital/staff/${target.membershipId}`)
      .set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(200);
    expect(res.body.membership.status).toBe("removed");

    // A removed staff member no longer has hospital access.
    const selectAttempt = await selectHospital(target.token, hospitalId);
    expect(selectAttempt.status).toBe(403);
  });

  it("a staff.manage holder cannot remove another staff.manage holder (peer protection)", async () => {
    const manager1 = await createActiveStaff(hospitalId, adminToken, managerRoleId, "peer1");
    const manager2 = await createActiveStaff(hospitalId, adminToken, managerRoleId, "peer2");

    const res = await request(app)
      .delete(`/api/hospital/staff/${manager2.membershipId}`)
      .set("Authorization", `Bearer ${manager1.token}`);
    expect(res.status).toBe(403);
  });

  it("nobody can remove the hospital admin", async () => {
    const memberships = await HospitalMembershipModel.find({ hospitalId, role: "admin" });
    const adminMembershipId = memberships[0]._id.toString();

    const res = await request(app)
      .delete(`/api/hospital/staff/${adminMembershipId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("an admin can remove staff directly", async () => {
    const target = await createActiveStaff(hospitalId, adminToken, plainRoleId, "admintarget");
    const res = await request(app)
      .delete(`/api/hospital/staff/${target.membershipId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("cannot remove someone twice, or remove a non-active membership", async () => {
    const target = await createActiveStaff(hospitalId, adminToken, plainRoleId, "doubleremove");
    await request(app)
      .delete(`/api/hospital/staff/${target.membershipId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const again = await request(app)
      .delete(`/api/hospital/staff/${target.membershipId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(again.status).toBe(409);
  });

  it("a removed staff member can request access again, landing back in pending", async () => {
    const target = await createActiveStaff(hospitalId, adminToken, plainRoleId, "rejoin");
    await request(app)
      .delete(`/api/hospital/staff/${target.membershipId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const rejoin = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${target.token}`)
      .send({ hospitalId });
    expect(rejoin.status).toBe(201);
    expect(rejoin.body.request.status).toBe("pending");
    expect(rejoin.body.request.id).toBe(target.membershipId);
  });
});
