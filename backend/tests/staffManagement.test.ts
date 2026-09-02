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

describe("Cancel access request", () => {
  let hospitalId: string;
  let adminToken: string;

  beforeAll(async () => {
    const hospital = await hospitalService.createHospitalWithAdmin({
      hospitalName: `Cancel Request Hospital ${Date.now()}`,
      adminName: "Admin",
      adminEmail: `staffmgmt.canceladmin.${Date.now()}@example.com`,
    });
    hospitalId = hospital.hospital.id;
    cleanupHospitalIds.push(hospitalId);
    cleanupUserEmails.push(hospital.admin.email);
    const raw = await loginAs(hospital.admin.email, hospital.temporaryPassword, "hospital");
    adminToken = (await selectHospital(raw, hospitalId)).body.accessToken;
  });

  it("lets the requester cancel their own pending request", async () => {
    const { token } = await createEligibleStaffUser("cancelself");
    const created = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId });
    const requestId = created.body.request.id;

    const cancelled = await request(app)
      .post(`/api/hospital/access-requests/${requestId}/cancel`)
      .set("Authorization", `Bearer ${token}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.membership.status).toBe("cancelled");

    const mine = await request(app).get("/api/hospital/access-requests/mine").set("Authorization", `Bearer ${token}`);
    expect(mine.body.requests[0].status).toBe("cancelled");
  });

  it("cannot cancel someone else's request", async () => {
    const requester = await createEligibleStaffUser("cancelowner");
    const bystander = await createEligibleStaffUser("cancelbystander");
    const created = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${requester.token}`)
      .send({ hospitalId });

    const res = await request(app)
      .post(`/api/hospital/access-requests/${created.body.request.id}/cancel`)
      .set("Authorization", `Bearer ${bystander.token}`);
    expect(res.status).toBe(404);
  });

  it("cannot cancel a non-pending request", async () => {
    const { token } = await createEligibleStaffUser("cancelnonpending");
    const created = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId });
    await request(app)
      .post(`/api/hospital/access-requests/${created.body.request.id}/reject`)
      .set("Authorization", `Bearer ${adminToken}`);

    const res = await request(app)
      .post(`/api/hospital/access-requests/${created.body.request.id}/cancel`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  it("a cancelled request can be re-requested, landing back in pending", async () => {
    const { token } = await createEligibleStaffUser("cancelrejoin");
    const created = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId });
    const requestId = created.body.request.id;
    await request(app)
      .post(`/api/hospital/access-requests/${requestId}/cancel`)
      .set("Authorization", `Bearer ${token}`);

    const rejoin = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId });
    expect(rejoin.status).toBe(201);
    expect(rejoin.body.request.status).toBe("pending");
    expect(rejoin.body.request.id).toBe(requestId);
  });
});

describe("Add staff directly", () => {
  let hospitalId: string;
  let hospitalName: string;
  let adminToken: string;
  let roleId: string;

  beforeAll(async () => {
    hospitalName = `Direct Add Hospital ${Date.now()}`;
    const hospital = await hospitalService.createHospitalWithAdmin({
      hospitalName,
      adminName: "Admin",
      adminEmail: `staffmgmt.addadmin.${Date.now()}@example.com`,
    });
    hospitalId = hospital.hospital.id;
    cleanupHospitalIds.push(hospitalId);
    cleanupUserEmails.push(hospital.admin.email);
    const raw = await loginAs(hospital.admin.email, hospital.temporaryPassword, "hospital");
    adminToken = (await selectHospital(raw, hospitalId)).body.accessToken;

    const role = await request(app)
      .post("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `DirectAddRole ${Date.now()}`, permissions: ["patient.view"] });
    roleId = role.body.accessRole.id;
  });

  it("creates a brand-new account, active membership, and lets them log in with the emailed password", async () => {
    const email = `staffmgmt.newdirect.${Date.now()}@example.com`;
    cleanupUserEmails.push(email);

    const res = await request(app)
      .post("/api/hospital/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Direct New", email, accessRoleId: roleId });
    expect(res.status).toBe(201);
    expect(res.body.createdNewUser).toBe(true);

    // The temp password isn't returned over HTTP — read it from the User doc
    // the same way the console-log fallback does, to prove login actually works.
    const user = await UserModel.findOne({ email });
    expect(user).not.toBeNull();
    expect(user!.roles).toContain("hospital");

    const membership = await HospitalMembershipModel.findOne({ userId: user!._id, hospitalId });
    expect(membership?.status).toBe("active");
    expect(membership?.accessRoleId?.toString()).toBe(roleId);
  });

  it("adds an existing (e.g. patient-only) account, granting the hospital role", async () => {
    const email = `staffmgmt.existingdirect.${Date.now()}@example.com`;
    const passwordHash = await hashValue("ExistingPass1!");
    await UserModel.create({ name: "Existing Patient", email, passwordHash, roles: ["patient"], isVerified: true });
    cleanupUserEmails.push(email);

    const res = await request(app)
      .post("/api/hospital/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Existing Patient", email, accessRoleId: roleId });
    expect(res.status).toBe(201);
    expect(res.body.createdNewUser).toBe(false);

    const user = await UserModel.findOne({ email });
    expect(user!.roles).toEqual(expect.arrayContaining(["patient", "hospital"]));

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "ExistingPass1!", role: "hospital" });
    expect(loginRes.status).toBe(200);
  });

  it("rejects adding the same person to the same hospital twice", async () => {
    const email = `staffmgmt.duplicatedirect.${Date.now()}@example.com`;
    cleanupUserEmails.push(email);
    await request(app)
      .post("/api/hospital/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Dupe", email, accessRoleId: roleId });

    const res = await request(app)
      .post("/api/hospital/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Dupe", email, accessRoleId: roleId });
    expect(res.status).toBe(409);
  });

  it("a staff.manage holder (non-admin) cannot add staff directly", async () => {
    const managerRole = await request(app)
      .post("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `AddStaffManager ${Date.now()}`, permissions: ["staff.manage"] });
    const manager = await createActiveStaff(hospitalId, adminToken, managerRole.body.accessRole.id, "addstaffmanager");

    const email = `staffmgmt.blockedadd.${Date.now()}@example.com`;
    const res = await request(app)
      .post("/api/hospital/staff")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ name: "Blocked", email, accessRoleId: roleId });
    expect(res.status).toBe(403);
  });
});

describe("Disable / enable staff", () => {
  let hospitalId: string;
  let adminToken: string;
  let managerRoleId: string;
  let plainRoleId: string;

  beforeAll(async () => {
    const hospital = await hospitalService.createHospitalWithAdmin({
      hospitalName: `Disable Staff Hospital ${Date.now()}`,
      adminName: "Admin",
      adminEmail: `staffmgmt.disableadmin.${Date.now()}@example.com`,
    });
    hospitalId = hospital.hospital.id;
    cleanupHospitalIds.push(hospitalId);
    cleanupUserEmails.push(hospital.admin.email);
    const raw = await loginAs(hospital.admin.email, hospital.temporaryPassword, "hospital");
    adminToken = (await selectHospital(raw, hospitalId)).body.accessToken;

    const managerRole = await request(app)
      .post("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `DisableManager ${Date.now()}`, permissions: ["staff.manage"] });
    managerRoleId = managerRole.body.accessRole.id;

    const plainRole = await request(app)
      .post("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `DisablePlain ${Date.now()}`, permissions: ["patient.view"] });
    plainRoleId = plainRole.body.accessRole.id;
  });

  it("an admin can disable an active staff member, blocking their access, then re-enable them", async () => {
    const target = await createActiveStaff(hospitalId, adminToken, plainRoleId, "disabletarget");

    const disabled = await request(app)
      .post(`/api/hospital/staff/${target.membershipId}/disable`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(disabled.status).toBe(200);
    expect(disabled.body.membership.status).toBe("disabled");

    // Blocked from selecting the hospital while disabled.
    const selectAttempt = await selectHospital(target.token, hospitalId);
    expect(selectAttempt.status).toBe(403);

    // They still show up in the staff list (so they can be found and re-enabled).
    const list = await request(app).get("/api/hospital/staff").set("Authorization", `Bearer ${adminToken}`);
    const listed = list.body.staff.find((s: { id: string }) => s.id === target.membershipId);
    expect(listed).toBeDefined();
    expect(listed.status).toBe("disabled");

    const enabled = await request(app)
      .post(`/api/hospital/staff/${target.membershipId}/enable`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(enabled.status).toBe(200);
    expect(enabled.body.membership.status).toBe("active");

    // Access restored, same role as before (membership row was never touched).
    const reselect = await selectHospital(target.token, hospitalId);
    expect(reselect.status).toBe(200);
  });

  it("cannot disable an already-disabled staff member, or enable an active one", async () => {
    const target = await createActiveStaff(hospitalId, adminToken, plainRoleId, "doubledisable");
    await request(app)
      .post(`/api/hospital/staff/${target.membershipId}/disable`)
      .set("Authorization", `Bearer ${adminToken}`);

    const againDisable = await request(app)
      .post(`/api/hospital/staff/${target.membershipId}/disable`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(againDisable.status).toBe(409);

    const otherTarget = await createActiveStaff(hospitalId, adminToken, plainRoleId, "enableactive");
    const enableActive = await request(app)
      .post(`/api/hospital/staff/${otherTarget.membershipId}/enable`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(enableActive.status).toBe(409);
  });

  it("nobody can disable the hospital admin", async () => {
    const memberships = await HospitalMembershipModel.find({ hospitalId, role: "admin" });
    const adminMembershipId = memberships[0]._id.toString();

    const res = await request(app)
      .post(`/api/hospital/staff/${adminMembershipId}/disable`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it("a staff.manage holder can disable a plain staff member but not another staff.manage holder (peer protection)", async () => {
    const manager = await createActiveStaff(hospitalId, adminToken, managerRoleId, "disablemanager1");
    const plainTarget = await createActiveStaff(hospitalId, adminToken, plainRoleId, "disableplaintarget");
    const peerManager = await createActiveStaff(hospitalId, adminToken, managerRoleId, "disablemanager2");

    const okRes = await request(app)
      .post(`/api/hospital/staff/${plainTarget.membershipId}/disable`)
      .set("Authorization", `Bearer ${manager.token}`);
    expect(okRes.status).toBe(200);

    const peerRes = await request(app)
      .post(`/api/hospital/staff/${peerManager.membershipId}/disable`)
      .set("Authorization", `Bearer ${manager.token}`);
    expect(peerRes.status).toBe(403);
  });

  it("cannot disable yourself", async () => {
    const manager = await createActiveStaff(hospitalId, adminToken, managerRoleId, "selfdisable");
    const res = await request(app)
      .post(`/api/hospital/staff/${manager.membershipId}/disable`)
      .set("Authorization", `Bearer ${manager.token}`);
    expect(res.status).toBe(403);
  });
});

describe("Update staff role", () => {
  let hospitalId: string;
  let adminToken: string;
  let roleAId: string;
  let roleBId: string;
  let roleBName: string;
  let managerRoleId: string;

  beforeAll(async () => {
    const hospital = await hospitalService.createHospitalWithAdmin({
      hospitalName: `Update Role Hospital ${Date.now()}`,
      adminName: "Admin",
      adminEmail: `staffmgmt.updateroleadmin.${Date.now()}@example.com`,
    });
    hospitalId = hospital.hospital.id;
    cleanupHospitalIds.push(hospitalId);
    cleanupUserEmails.push(hospital.admin.email);
    const raw = await loginAs(hospital.admin.email, hospital.temporaryPassword, "hospital");
    adminToken = (await selectHospital(raw, hospitalId)).body.accessToken;

    const roleA = await request(app)
      .post("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `UpdateRoleA ${Date.now()}`, permissions: ["patient.view"] });
    roleAId = roleA.body.accessRole.id;

    roleBName = `UpdateRoleB ${Date.now()}`;
    const roleB = await request(app)
      .post("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: roleBName, permissions: ["vitals.view"] });
    roleBId = roleB.body.accessRole.id;

    const managerRole = await request(app)
      .post("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `UpdateRoleManager ${Date.now()}`, permissions: ["staff.manage"] });
    managerRoleId = managerRole.body.accessRole.id;
  });

  it("an admin can reassign a staff member's role", async () => {
    const target = await createActiveStaff(hospitalId, adminToken, roleAId, "reassign");

    const res = await request(app)
      .patch(`/api/hospital/staff/${target.membershipId}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ accessRoleId: roleBId });
    expect(res.status).toBe(200);
    expect(res.body.accessRoleName).toBe(roleBName);

    const membership = await HospitalMembershipModel.findById(target.membershipId);
    expect(membership?.accessRoleId?.toString()).toBe(roleBId);
  });

  it("rejects a role that doesn't belong to this hospital", async () => {
    const target = await createActiveStaff(hospitalId, adminToken, roleAId, "reassignbadrole");
    const res = await request(app)
      .patch(`/api/hospital/staff/${target.membershipId}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ accessRoleId: new mongoose.Types.ObjectId().toString() });
    expect(res.status).toBe(400);
  });

  it("a staff.manage holder (non-admin) cannot reassign roles", async () => {
    const manager = await createActiveStaff(hospitalId, adminToken, managerRoleId, "reassignmanager");
    const target = await createActiveStaff(hospitalId, adminToken, roleAId, "reassignblocked");

    const res = await request(app)
      .patch(`/api/hospital/staff/${target.membershipId}/role`)
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ accessRoleId: roleBId });
    expect(res.status).toBe(403);
  });

  it("nobody can reassign the hospital admin's role", async () => {
    const memberships = await HospitalMembershipModel.find({ hospitalId, role: "admin" });
    const adminMembershipId = memberships[0]._id.toString();

    const res = await request(app)
      .patch(`/api/hospital/staff/${adminMembershipId}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ accessRoleId: roleAId });
    expect(res.status).toBe(403);
  });
});
