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

const OWNER_EMAIL = "monureddig@gmail.com";
const OWNER_PASSWORD = "123456";

const TEST_HOSPITAL_NAME = `Vitest Hospital ${Date.now()}`;
const TEST_ADMIN_NAME = "Vitest Admin";
const TEST_ADMIN_EMAIL = `vitest.admin.${Date.now()}@example.com`;

// A self-contained, already-verified patient — used only to prove a non-owner
// portal is rejected. Created here rather than depending on a pre-existing
// account, since external fixture state isn't reproducible across test runs.
const NON_OWNER_EMAIL = `vitest.patient.${Date.now()}@example.com`;
const NON_OWNER_PASSWORD = "PatientPass1!";

const cleanupHospitalIds: string[] = [];
const cleanupUserEmails: string[] = [TEST_ADMIN_EMAIL, NON_OWNER_EMAIL];

async function loginAs(email: string, password: string, role: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password, role });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

beforeAll(async () => {
  await connectToDatabase();
  await UserModel.create({
    name: "Vitest Patient",
    email: NON_OWNER_EMAIL,
    passwordHash: await hashValue(NON_OWNER_PASSWORD),
    roles: ["patient"],
    isVerified: true,
  });
});

afterAll(async () => {
  await AccessRoleModel.deleteMany({ hospital: { $in: cleanupHospitalIds } });
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
    const patientToken = await loginAs(NON_OWNER_EMAIL, NON_OWNER_PASSWORD, "patient");

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

describe("Owner -> disable/enable/delete a hospital", () => {
  it("rejects disable/enable/delete with no session", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const disableRes = await request(app).post(`/api/owner/hospitals/${fakeId}/disable`);
    expect(disableRes.status).toBe(401);
    const enableRes = await request(app).post(`/api/owner/hospitals/${fakeId}/enable`);
    expect(enableRes.status).toBe(401);
    const deleteRes = await request(app).delete(`/api/owner/hospitals/${fakeId}`);
    expect(deleteRes.status).toBe(401);
  });

  it("rejects disable from a non-owner portal", async () => {
    const patientToken = await loginAs(NON_OWNER_EMAIL, NON_OWNER_PASSWORD, "patient");
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .post(`/api/owner/hospitals/${fakeId}/disable`)
      .set("Authorization", `Bearer ${patientToken}`);
    expect(res.status).toBe(403);
  });

  it("404s disabling, enabling, or deleting a hospital that doesn't exist", async () => {
    const ownerToken = await loginAs(OWNER_EMAIL, OWNER_PASSWORD, "owner");
    const fakeId = new mongoose.Types.ObjectId().toString();

    const disableRes = await request(app)
      .post(`/api/owner/hospitals/${fakeId}/disable`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(disableRes.status).toBe(404);

    const enableRes = await request(app)
      .post(`/api/owner/hospitals/${fakeId}/enable`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(enableRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/api/owner/hospitals/${fakeId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(deleteRes.status).toBe(404);
  });

  it(
    "disabling a hospital blocks the admin's access immediately, even mid-session, and re-enabling restores it",
    async () => {
      const ownerToken = await loginAs(OWNER_EMAIL, OWNER_PASSWORD, "owner");
      const adminEmail = `vitest.disableadmin.${Date.now()}@example.com`;
      cleanupUserEmails.push(adminEmail);

      const created = await hospitalService.createHospitalWithAdmin({
        hospitalName: `Vitest Disable Hospital ${Date.now()}`,
        adminName: "Disable Admin",
        adminEmail,
      });
      cleanupHospitalIds.push(created.hospital.id);
      expect(created.hospital.isActive).toBe(true);

      // Establish a session with hospitalId already selected, before disabling —
      // proves the block applies to an existing token, not just a fresh select.
      const rawToken = await loginAs(adminEmail, created.temporaryPassword, "hospital");
      const selectRes = await request(app)
        .post("/api/hospital/select")
        .set("Authorization", `Bearer ${rawToken}`)
        .send({ hospitalId: created.hospital.id });
      expect(selectRes.status).toBe(200);
      const adminToken = selectRes.body.accessToken as string;

      const disableRes = await request(app)
        .post(`/api/owner/hospitals/${created.hospital.id}/disable`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(disableRes.status).toBe(200);
      expect(disableRes.body.hospital.isActive).toBe(false);

      // The membership itself is untouched underneath.
      const membership = await HospitalMembershipModel.findOne({
        userId: (await UserModel.findOne({ email: adminEmail }))!._id,
        hospitalId: created.hospital.id,
      });
      expect(membership?.status).toBe("active");

      // An admin-gated action, attempted with the already-issued token, now fails.
      const rolesRes = await request(app)
        .get("/api/hospital/access-roles")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(rolesRes.status).toBe(403);

      // GET /me no longer reports a hospital context for this session.
      const meRes = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${adminToken}`);
      expect(meRes.status).toBe(200);
      expect(meRes.body.user.hospital).toBeNull();

      // A fresh select attempt also fails.
      const reselectAttempt = await request(app)
        .post("/api/hospital/select")
        .set("Authorization", `Bearer ${rawToken}`)
        .send({ hospitalId: created.hospital.id });
      expect(reselectAttempt.status).toBe(403);

      // Hidden from "Your hospitals".
      const membershipsRes = await request(app)
        .get("/api/hospital/memberships")
        .set("Authorization", `Bearer ${rawToken}`);
      expect(membershipsRes.body.memberships).toHaveLength(0);

      // Hidden from the staff-facing "browse hospitals to request access" list.
      const browseRes = await request(app)
        .get("/api/hospital/hospitals")
        .set("Authorization", `Bearer ${rawToken}`);
      expect(browseRes.body.hospitals.some((h: { id: string }) => h.id === created.hospital.id)).toBe(false);

      // Cannot disable an already-disabled hospital.
      const doubleDisable = await request(app)
        .post(`/api/owner/hospitals/${created.hospital.id}/disable`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(doubleDisable.status).toBe(409);

      // Re-enabling restores access, using the same role/membership as before.
      const enableRes = await request(app)
        .post(`/api/owner/hospitals/${created.hospital.id}/enable`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(enableRes.status).toBe(200);
      expect(enableRes.body.hospital.isActive).toBe(true);

      const reselect = await request(app)
        .post("/api/hospital/select")
        .set("Authorization", `Bearer ${rawToken}`)
        .send({ hospitalId: created.hospital.id });
      expect(reselect.status).toBe(200);
      expect(reselect.body.hospital.role).toBe("admin");

      // Cannot enable an already-active hospital.
      const doubleEnable = await request(app)
        .post(`/api/owner/hospitals/${created.hospital.id}/enable`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(doubleEnable.status).toBe(409);
    },
    30000
  );

  it("a disabled hospital cannot be requested by a new staff member", async () => {
    const ownerToken = await loginAs(OWNER_EMAIL, OWNER_PASSWORD, "owner");
    const adminEmail = `vitest.disablerequest.${Date.now()}@example.com`;
    const requesterEmail = `vitest.disablerequester.${Date.now()}@example.com`;
    cleanupUserEmails.push(adminEmail, requesterEmail);

    const created = await hospitalService.createHospitalWithAdmin({
      hospitalName: `Vitest Disable Request Hospital ${Date.now()}`,
      adminName: "Disable Request Admin",
      adminEmail,
    });
    cleanupHospitalIds.push(created.hospital.id);

    await request(app)
      .post(`/api/owner/hospitals/${created.hospital.id}/disable`)
      .set("Authorization", `Bearer ${ownerToken}`);

    await UserModel.create({
      name: "Disable Requester",
      email: requesterEmail,
      passwordHash: await hashValue("RequesterPass1!"),
      roles: ["hospital"],
      isVerified: true,
    });
    const requesterToken = await loginAs(requesterEmail, "RequesterPass1!", "hospital");

    const requestRes = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${requesterToken}`)
      .send({ hospitalId: created.hospital.id });
    expect(requestRes.status).toBe(403);
  });

  it(
    "deleting a hospital cascades to its staff/admin memberships and roles, but leaves the User accounts intact",
    async () => {
      const ownerToken = await loginAs(OWNER_EMAIL, OWNER_PASSWORD, "owner");
      const adminEmail = `vitest.deleteadmin.${Date.now()}@example.com`;
      cleanupUserEmails.push(adminEmail);

      const created = await hospitalService.createHospitalWithAdmin({
        hospitalName: `Vitest Delete Hospital ${Date.now()}`,
        adminName: "Delete Admin",
        adminEmail,
      });
      // Not pushed to cleanupHospitalIds — this test deletes it itself, and
      // asserts on that deletion, so afterAll's cleanup would just no-op for it.
      const hospitalId = created.hospital.id;

      const rawToken = await loginAs(adminEmail, created.temporaryPassword, "hospital");
      const selectRes = await request(app)
        .post("/api/hospital/select")
        .set("Authorization", `Bearer ${rawToken}`)
        .send({ hospitalId });
      const adminToken = selectRes.body.accessToken as string;

      const roleRes = await request(app)
        .post("/api/hospital/access-roles")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: `DeleteCascadeRole ${Date.now()}`, permissions: ["patient.view"] });
      expect(roleRes.status).toBe(201);
      const roleId = roleRes.body.accessRole.id;

      expect(await HospitalMembershipModel.countDocuments({ hospitalId })).toBe(1);
      expect(await AccessRoleModel.countDocuments({ hospital: hospitalId })).toBe(1);

      const deleteRes = await request(app)
        .delete(`/api/owner/hospitals/${hospitalId}`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(deleteRes.status).toBe(200);

      expect(await HospitalModel.findById(hospitalId)).toBeNull();
      expect(await HospitalMembershipModel.countDocuments({ hospitalId })).toBe(0);
      expect(await AccessRoleModel.countDocuments({ hospital: hospitalId })).toBe(0);
      expect(await AccessRoleModel.findById(roleId)).toBeNull();

      // The admin's own User account is untouched — they just have no access
      // to this (now-nonexistent) hospital any more.
      const adminUser = await UserModel.findOne({ email: adminEmail });
      expect(adminUser).not.toBeNull();

      // Deleting it again 404s — it's really gone, not just marked deleted.
      const secondDelete = await request(app)
        .delete(`/api/owner/hospitals/${hospitalId}`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(secondDelete.status).toBe(404);

      // No longer listed anywhere.
      const listRes = await request(app)
        .get("/api/owner/hospitals")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(listRes.body.hospitals.some((h: { id: string }) => h.id === hospitalId)).toBe(false);
    },
    30000
  );
});
