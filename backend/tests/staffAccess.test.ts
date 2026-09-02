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

// No self-request flow existed for THIS user before now — this creates the
// eligible starting point (verified account with the "hospital" role), exactly
// what the existing register+verify-OTP flow already produces.
async function createEligibleStaffUser(): Promise<{ email: string; token: string }> {
  const email = `staffaccess.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
  const password = "StaffPass1!";
  const passwordHash = await hashValue(password);
  await UserModel.create({
    name: "Staff Access Test",
    email,
    passwordHash,
    roles: ["hospital"],
    isVerified: true,
  });
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

describe("Hospital Staff Access Workflow", () => {
  let hospitalAId: string;
  let hospitalBId: string;
  let adminAToken: string;
  let adminBToken: string;
  let nurseRoleAId: string;
  let roleBId: string;

  beforeAll(async () => {
    const hospitalA = await hospitalService.createHospitalWithAdmin({
      hospitalName: `Staff Access Hospital A ${Date.now()}`,
      adminName: "Admin A",
      adminEmail: `staffaccess.admina.${Date.now()}@example.com`,
    });
    hospitalAId = hospitalA.hospital.id;
    cleanupHospitalIds.push(hospitalAId);
    cleanupUserEmails.push(hospitalA.admin.email);
    const adminARaw = await loginAs(hospitalA.admin.email, hospitalA.temporaryPassword, "hospital");
    adminAToken = (await selectHospital(adminARaw, hospitalAId)).body.accessToken;

    const hospitalB = await hospitalService.createHospitalWithAdmin({
      hospitalName: `Staff Access Hospital B ${Date.now()}`,
      adminName: "Admin B",
      adminEmail: `staffaccess.adminb.${Date.now()}@example.com`,
    });
    hospitalBId = hospitalB.hospital.id;
    cleanupHospitalIds.push(hospitalBId);
    cleanupUserEmails.push(hospitalB.admin.email);
    const adminBRaw = await loginAs(hospitalB.admin.email, hospitalB.temporaryPassword, "hospital");
    adminBToken = (await selectHospital(adminBRaw, hospitalBId)).body.accessToken;

    const nurseRoleRes = await request(app)
      .post("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ name: "Nurse", permissions: ["patient.view"] });
    nurseRoleAId = nurseRoleRes.body.accessRole.id;

    const roleBRes = await request(app)
      .post("/api/hospital/access-roles")
      .set("Authorization", `Bearer ${adminBToken}`)
      .send({ name: "Hospital B Role", permissions: ["patient.view"] });
    roleBId = roleBRes.body.accessRole.id;
  });

  it("security: requesting access to a nonexistent hospital is rejected", async () => {
    const { token } = await createEligibleStaffUser();
    const res = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: new mongoose.Types.ObjectId().toString() });
    expect(res.status).toBe(404);
  });

  it("1 & 2. staff can request access to a hospital, and it starts pending", async () => {
    const { token } = await createEligibleStaffUser();

    const res = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalAId });

    expect(res.status).toBe(201);
    expect(res.body.request.status).toBe("pending");

    const mine = await request(app).get("/api/hospital/access-requests/mine").set("Authorization", `Bearer ${token}`);
    expect(mine.status).toBe(200);
    expect(mine.body.requests).toHaveLength(1);
    expect(mine.body.requests[0].status).toBe("pending");
    expect(mine.body.requests[0].hospitalId).toBe(hospitalAId);
  });

  it("3. pending staff cannot access hospital resources (cannot select the hospital)", async () => {
    const { token } = await createEligibleStaffUser();
    await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalAId });

    const selectRes = await selectHospital(token, hospitalAId);
    expect(selectRes.status).toBe(403);
  });

  it("4. duplicate pending request for the same hospital is rejected", async () => {
    const { token } = await createEligibleStaffUser();
    await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalAId });

    const dupe = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalAId });
    expect(dupe.status).toBe(409);
  });

  it("6 & 7 & 5. admin lists pending requests, approves one, and a duplicate active membership is then rejected", async () => {
    const { token } = await createEligibleStaffUser();
    const created = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalAId });
    const requestId = created.body.request.id;

    const pendingList = await request(app)
      .get("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${adminAToken}`);
    expect(pendingList.status).toBe(200);
    expect(pendingList.body.requests.some((r: { id: string }) => r.id === requestId)).toBe(true);

    const approveRes = await request(app)
      .post(`/api/hospital/access-requests/${requestId}/approve`)
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ accessRoleId: nurseRoleAId });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.membership.status).toBe("active");
    expect(approveRes.body.membership.accessRoleId).toBe(nurseRoleAId);

    // Now that they're active, staff can select the hospital.
    const selectRes = await selectHospital(token, hospitalAId);
    expect(selectRes.status).toBe(200);
    expect(selectRes.body.hospital.role).toBe("staff");

    // 5. duplicate ACTIVE membership: requesting again is rejected.
    const dupeActive = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalAId });
    expect(dupeActive.status).toBe(409);
  });

  it("8. approval without a valid accessRoleId is rejected", async () => {
    const { token } = await createEligibleStaffUser();
    const created = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalAId });

    const res = await request(app)
      .post(`/api/hospital/access-requests/${created.body.request.id}/approve`)
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("9. approval with a wrong-hospital AccessRole is rejected", async () => {
    const { token } = await createEligibleStaffUser();
    const created = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalAId });

    const res = await request(app)
      .post(`/api/hospital/access-requests/${created.body.request.id}/approve`)
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ accessRoleId: roleBId });
    expect(res.status).toBe(400);
  });

  it("10. approval with an inactive AccessRole is rejected", async () => {
    const { token } = await createEligibleStaffUser();
    const created = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalAId });

    await AccessRoleModel.updateOne({ _id: nurseRoleAId }, { isActive: false });
    const res = await request(app)
      .post(`/api/hospital/access-requests/${created.body.request.id}/approve`)
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ accessRoleId: nurseRoleAId });
    expect(res.status).toBe(400);
    await AccessRoleModel.updateOne({ _id: nurseRoleAId }, { isActive: true });
  });

  it("11 & 12. Hospital B admin cannot view or approve Hospital A's requests", async () => {
    const { token } = await createEligibleStaffUser();
    const created = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalAId });
    const requestId = created.body.request.id;

    // 11. Hospital B's pending list never includes Hospital A's request.
    const listB = await request(app)
      .get("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${adminBToken}`);
    expect(listB.status).toBe(200);
    expect(listB.body.requests.some((r: { id: string }) => r.id === requestId)).toBe(false);

    // 12. Hospital B's admin cannot approve it either — scoped lookup finds nothing.
    const approveAttempt = await request(app)
      .post(`/api/hospital/access-requests/${requestId}/approve`)
      .set("Authorization", `Bearer ${adminBToken}`)
      .send({ accessRoleId: roleBId });
    expect(approveAttempt.status).toBe(404);

    const rejectAttempt = await request(app)
      .post(`/api/hospital/access-requests/${requestId}/reject`)
      .set("Authorization", `Bearer ${adminBToken}`);
    expect(rejectAttempt.status).toBe(404);
  });

  it("13 & 14. rejection works, and a rejected membership does not grant access", async () => {
    const { token } = await createEligibleStaffUser();
    const created = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${token}`)
      .send({ hospitalId: hospitalAId });

    const rejectRes = await request(app)
      .post(`/api/hospital/access-requests/${created.body.request.id}/reject`)
      .set("Authorization", `Bearer ${adminAToken}`);
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.membership.status).toBe("rejected");

    const mine = await request(app).get("/api/hospital/access-requests/mine").set("Authorization", `Bearer ${token}`);
    expect(mine.body.requests[0].status).toBe("rejected");

    const selectRes = await selectHospital(token, hospitalAId);
    expect(selectRes.status).toBe(403);
  });

  it("15. invalid state transitions are rejected (double-approve, double-reject, reject-after-approve)", async () => {
    const staff1 = await createEligibleStaffUser();
    const req1 = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${staff1.token}`)
      .send({ hospitalId: hospitalAId });
    await request(app)
      .post(`/api/hospital/access-requests/${req1.body.request.id}/approve`)
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ accessRoleId: nurseRoleAId });

    // Already active — approving again is invalid.
    const reapprove = await request(app)
      .post(`/api/hospital/access-requests/${req1.body.request.id}/approve`)
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ accessRoleId: nurseRoleAId });
    expect(reapprove.status).toBe(409);

    // Already active — rejecting is also an invalid transition in this phase.
    const rejectAfterApprove = await request(app)
      .post(`/api/hospital/access-requests/${req1.body.request.id}/reject`)
      .set("Authorization", `Bearer ${adminAToken}`);
    expect(rejectAfterApprove.status).toBe(409);

    const staff2 = await createEligibleStaffUser();
    const req2 = await request(app)
      .post("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${staff2.token}`)
      .send({ hospitalId: hospitalAId });
    await request(app)
      .post(`/api/hospital/access-requests/${req2.body.request.id}/reject`)
      .set("Authorization", `Bearer ${adminAToken}`);

    // Already rejected — rejecting again is invalid.
    const rereject = await request(app)
      .post(`/api/hospital/access-requests/${req2.body.request.id}/reject`)
      .set("Authorization", `Bearer ${adminAToken}`);
    expect(rereject.status).toBe(409);

    // Already rejected — approving it does not silently make it active.
    const approveAfterReject = await request(app)
      .post(`/api/hospital/access-requests/${req2.body.request.id}/approve`)
      .set("Authorization", `Bearer ${adminAToken}`)
      .send({ accessRoleId: nurseRoleAId });
    expect(approveAfterReject.status).toBe(409);
  });

  it("16. the Platform Owner still cannot access hospital APIs", async () => {
    const ownerToken = await loginAs(OWNER_EMAIL, OWNER_PASSWORD, "owner");
    const res = await request(app)
      .get("/api/hospital/access-requests")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(403);
  });

  // Note on self-approval: domain/accessRequest.service.ts includes a defensive
  // `membership.userId === adminUserId` check, but it is structurally
  // unreachable via any real flow or even direct DB manipulation — the unique
  // (userId, hospitalId) index means a person can hold at most one membership
  // document per hospital, so an active admin can never also have a *separate*
  // pending request in that same hospital to approve. It's kept as
  // defense-in-depth in case that data-model assumption ever changes, but
  // there is no meaningful way to exercise it in a test today.
});
