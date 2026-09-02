import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import app from "../app";
import { connectToDatabase } from "../config/db";
import { UserModel } from "../models/user.model";
import { hashValue } from "../utils/hash";

async function countRefreshTokens(email: string, portal: string): Promise<number> {
  const user = await UserModel.findOne({ email });
  return user!.refreshTokens.filter((t) => t.portal === portal).length;
}

const TEST_EMAIL = `refreshcap.${Date.now()}@example.com`;
const TEST_PASSWORD = "CapTest1!";

beforeAll(async () => {
  await connectToDatabase();
  const passwordHash = await hashValue(TEST_PASSWORD);
  await UserModel.create({
    name: "Refresh Cap Test",
    email: TEST_EMAIL,
    passwordHash,
    roles: ["patient", "hospital"],
    isVerified: true,
  });
});

afterAll(async () => {
  await UserModel.deleteOne({ email: TEST_EMAIL });
  await mongoose.disconnect();
});

function extractCookie(res: request.Response, name: string): string {
  const setCookies = (res.headers["set-cookie"] as unknown as string[]) || [];
  const match = setCookies.find((c) => c.startsWith(`${name}=`));
  if (!match) throw new Error(`${name} cookie not found in response`);
  return match.split(";")[0]; // "name=value", enough for supertest's Cookie header
}

describe("Refresh token cap per (user, portal)", () => {
  it("evicts only the oldest session on the same portal once over the cap, and never touches a different portal", async () => {
    const patientCookies: string[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD, role: "patient" });
      expect(res.status).toBe(200);
      patientCookies.push(extractCookie(res, "patient_refresh_token"));
    }

    // Same user, different portal — proves the cap doesn't leak across portals.
    const hospitalLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, role: "hospital" });
    expect(hospitalLogin.status).toBe(200);
    const hospitalCookie = extractCookie(hospitalLogin, "hospital_refresh_token");

    expect(await countRefreshTokens(TEST_EMAIL, "patient")).toBe(3);
    expect(await countRefreshTokens(TEST_EMAIL, "hospital")).toBe(1); // untouched by the patient-portal eviction

    // The oldest (1st) patient login is now dead.
    const oldestRefresh = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", patientCookies[0])
      .send({ portal: "patient" });
    expect(oldestRefresh.status).toBe(401);

    // The newest (4th) patient login still works.
    const newestRefresh = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", patientCookies[3])
      .send({ portal: "patient" });
    expect(newestRefresh.status).toBe(200);

    // The unrelated hospital-portal session was never touched.
    const hospitalRefresh = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", hospitalCookie)
      .send({ portal: "hospital" });
    expect(hospitalRefresh.status).toBe(200);
  });

  it("rotation (refresh) never grows the count past the cap", async () => {
    const before = await countRefreshTokens(TEST_EMAIL, "patient");
    expect(before).toBeLessThanOrEqual(3);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, role: "patient" });
    const cookie = extractCookie(login, "patient_refresh_token");

    // Refresh several times in a row — rotation deletes-then-creates 1:1, so
    // the count should stay flat, not climb.
    let currentCookie = cookie;
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post("/api/auth/refresh").set("Cookie", currentCookie).send({ portal: "patient" });
      expect(res.status).toBe(200);
      currentCookie = extractCookie(res, "patient_refresh_token");
    }

    const after = await countRefreshTokens(TEST_EMAIL, "patient");
    expect(after).toBeLessThanOrEqual(3);
  });

  // Regression test: since every portal's refresh tokens (and OTPs) now live on
  // the same User document, concurrent requests for the same user can race to
  // save it. Mongoose's optimistic-concurrency check used to reject whichever
  // request saved second with an unhandled VersionError (raw 500) — see
  // domain/auth.service.ts::withVersionRetry, which fixes this by retrying
  // against fresh state rather than failing outright.
  it("survives truly concurrent logins for the same user without a VersionError", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).post("/api/auth/login").send({ email: TEST_EMAIL, password: TEST_PASSWORD, role: "hospital" })
      )
    );

    for (const res of results) {
      expect(res.status).toBe(200);
    }

    // The cap still holds even though 5 requests raced to modify the same array.
    expect(await countRefreshTokens(TEST_EMAIL, "hospital")).toBeLessThanOrEqual(3);
  });
});
