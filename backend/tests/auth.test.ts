import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import app from "../app";
import { connectToDatabase } from "../config/db";
import { UserModel } from "../models/user.model";
import { hashValue } from "../utils/hash";
import { OTP_MAX_ATTEMPTS } from "../utils/otp";

// The OTP is only ever emailed — never returned over HTTP, and stored only as
// a bcrypt hash — so the test observes it at the one place it legitimately
// leaves the system. Mocking the mailer keeps the production path untouched
// (no test-only backdoor) and avoids sending real mail from the suite.
// vi.hoisted because vi.mock factories are hoisted above the imports.
const { sentOtps } = vi.hoisted(() => ({ sentOtps: new Map<string, string>() }));

vi.mock("../utils/email", () => ({
  sendOtpEmail: async (email: string, code: string) => {
    sentOtps.set(email, code);
  },
  sendHospitalAdminWelcomeEmail: async () => {},
  sendStaffWelcomeEmail: async () => {},
}));

// Covers the auth routes that had no test at all: register, verify-otp,
// logout, forgot-password, reset-password and health. These are also where the
// OTP hardening lives (crypto-random codes + a per-code attempt limit), so the
// brute-force guard is exercised end-to-end through the real HTTP surface.

const cleanupUserEmails: string[] = [];

function uniqueEmail(label: string): string {
  const email = `auth.${label}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
  cleanupUserEmails.push(email);
  return email;
}

function sentOtpFor(email: string): string {
  const code = sentOtps.get(email);
  if (!code) throw new Error(`no OTP was emailed to ${email}`);
  return code;
}

beforeAll(async () => {
  await connectToDatabase();
});

afterAll(async () => {
  await UserModel.deleteMany({ email: { $in: cleanupUserEmails } });
  await mongoose.disconnect();
});

describe("Health", () => {
  it("responds", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
  });
});

describe("Registration + OTP verification", () => {
  it("registers an account that starts unverified and cannot log in yet", async () => {
    const email = uniqueEmail("register");
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Register Test", email, phone: "9876543210", password: "RegisterPass1!", role: "patient" });
    expect(res.status).toBe(201);

    const user = await UserModel.findOne({ email });
    expect(user?.isVerified).toBe(false);
    expect(user?.registerOtp).toBeTruthy();

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "RegisterPass1!", role: "patient" });
    expect(login.status).toBe(401);
  });

  it("verifies with the right code, granting the role and clearing the OTP", async () => {
    const email = uniqueEmail("verify");
    await request(app)
      .post("/api/auth/register")
      .send({ name: "Verify Test", email, phone: "9876543210", password: "VerifyPass1!", role: "patient" });

    const code = sentOtpFor(email);
    const res = await request(app).post("/api/auth/verify-otp").send({ email, code });
    expect(res.status).toBe(200);

    const user = await UserModel.findOne({ email });
    expect(user?.isVerified).toBe(true);
    expect(user?.registerOtp).toBeNull();
    expect(user?.roles).toContain("patient");

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "VerifyPass1!", role: "patient" });
    expect(login.status).toBe(200);
  });

  it("rejects a wrong code and counts the attempt against the issued code", async () => {
    const email = uniqueEmail("wrongcode");
    await request(app)
      .post("/api/auth/register")
      .send({ name: "Wrong Code", email, phone: "9876543210", password: "WrongPass1!", role: "patient" });

    const res = await request(app).post("/api/auth/verify-otp").send({ email, code: "000000" });
    expect(res.status).toBe(400);

    // The increment has to survive the request — it's persisted by the same
    // save that would otherwise have been skipped by throwing mid-mutation.
    const user = await UserModel.findOne({ email });
    expect(user?.registerOtp?.attempts).toBe(1);
    expect(user?.registerOtp).toBeTruthy();
  });

  it("discards the code entirely after OTP_MAX_ATTEMPTS wrong guesses", async () => {
    const email = uniqueEmail("bruteforce");
    await request(app)
      .post("/api/auth/register")
      .send({ name: "Brute Force", email, phone: "9876543210", password: "BrutePass1!", role: "patient" });

    const realCode = sentOtpFor(email);
    const wrongCode = realCode === "000000" ? "111111" : "000000";

    for (let attempt = 1; attempt <= OTP_MAX_ATTEMPTS; attempt++) {
      const res = await request(app).post("/api/auth/verify-otp").send({ email, code: wrongCode });
      expect(res.status).toBe(400);
    }

    const user = await UserModel.findOne({ email });
    expect(user?.registerOtp).toBeNull();

    // Even the CORRECT code is now useless — the code is gone, not just locked.
    const afterLockout = await request(app).post("/api/auth/verify-otp").send({ email, code: realCode });
    expect(afterLockout.status).toBe(400);

    const stillUnverified = await UserModel.findOne({ email });
    expect(stillUnverified?.isVerified).toBe(false);
  });

  it("rejects a password shorter than the policy, and a non-string email", async () => {
    const short = await request(app)
      .post("/api/auth/register")
      .send({ name: "Short", email: uniqueEmail("short"), phone: "9876543210", password: "abc", role: "patient" });
    expect(short.status).toBe(400);

    // Used to reach the domain layer and blow up on .toLowerCase() as a 500.
    const nonString = await request(app)
      .post("/api/auth/login")
      .send({ email: 12345, password: "whatever", role: "patient" });
    expect(nonString.status).toBe(400);
  });
});

describe("Forgot / reset password", () => {
  it("responds identically whether or not the email exists (no enumeration)", async () => {
    const known = uniqueEmail("forgotknown");
    await UserModel.create({
      name: "Forgot Known",
      email: known,
      passwordHash: await hashValue("OriginalPass1!"),
      roles: ["patient"],
      isVerified: true,
    });

    const existing = await request(app).post("/api/auth/forgot-password").send({ email: known });
    const missing = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: `nobody.${Date.now()}@example.com` });

    expect(existing.status).toBe(missing.status);
    expect(existing.body.message).toBe(missing.body.message);
  });

  it("resets the password with a valid code and invalidates existing sessions", async () => {
    const email = uniqueEmail("reset");
    await UserModel.create({
      name: "Reset Test",
      email,
      passwordHash: await hashValue("OriginalPass1!"),
      roles: ["patient"],
      isVerified: true,
    });

    // An active session exists before the reset.
    const beforeLogin = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "OriginalPass1!", role: "patient" });
    expect(beforeLogin.status).toBe(200);
    expect((await UserModel.findOne({ email }))!.refreshTokens.length).toBeGreaterThan(0);

    await request(app).post("/api/auth/forgot-password").send({ email });
    const code = sentOtpFor(email);

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ email, code, newPassword: "BrandNewPass1!" });
    expect(res.status).toBe(200);

    const user = await UserModel.findOne({ email });
    expect(user?.resetOtp).toBeNull();
    expect(user?.refreshTokens).toHaveLength(0);

    const withOld = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "OriginalPass1!", role: "patient" });
    expect(withOld.status).toBe(401);

    const withNew = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "BrandNewPass1!", role: "patient" });
    expect(withNew.status).toBe(200);
  });

  it("discards the reset code after OTP_MAX_ATTEMPTS wrong guesses, so the password can't be brute-forced open", async () => {
    const email = uniqueEmail("resetbrute");
    await UserModel.create({
      name: "Reset Brute",
      email,
      passwordHash: await hashValue("OriginalPass1!"),
      roles: ["patient"],
      isVerified: true,
    });
    await request(app).post("/api/auth/forgot-password").send({ email });
    const realCode = sentOtpFor(email);
    const wrongCode = realCode === "000000" ? "111111" : "000000";

    for (let attempt = 1; attempt <= OTP_MAX_ATTEMPTS; attempt++) {
      const res = await request(app)
        .post("/api/auth/reset-password")
        .send({ email, code: wrongCode, newPassword: "AttackerPass1!" });
      expect(res.status).toBe(400);
    }

    expect((await UserModel.findOne({ email }))!.resetOtp).toBeNull();

    // The real code no longer works either, and the password is unchanged.
    const afterLockout = await request(app)
      .post("/api/auth/reset-password")
      .send({ email, code: realCode, newPassword: "AttackerPass1!" });
    expect(afterLockout.status).toBe(400);

    const stillOriginal = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "OriginalPass1!", role: "patient" });
    expect(stillOriginal.status).toBe(200);
  });

  it("rejects a new password shorter than the policy", async () => {
    const email = uniqueEmail("resetshort");
    await UserModel.create({
      name: "Reset Short",
      email,
      passwordHash: await hashValue("OriginalPass1!"),
      roles: ["patient"],
      isVerified: true,
    });
    await request(app).post("/api/auth/forgot-password").send({ email });
    const code = sentOtpFor(email);

    const res = await request(app).post("/api/auth/reset-password").send({ email, code, newPassword: "abc" });
    expect(res.status).toBe(400);
  });
});

describe("Logout", () => {
  it("removes the presented refresh token so it can no longer be exchanged", async () => {
    const email = uniqueEmail("logout");
    await UserModel.create({
      name: "Logout Test",
      email,
      passwordHash: await hashValue("LogoutPass1!"),
      roles: ["patient"],
      isVerified: true,
    });

    const agent = request.agent(app);
    const login = await agent.post("/api/auth/login").send({ email, password: "LogoutPass1!", role: "patient" });
    expect(login.status).toBe(200);
    expect((await UserModel.findOne({ email }))!.refreshTokens).toHaveLength(1);

    const logout = await agent.post("/api/auth/logout").send({ portal: "patient" });
    expect(logout.status).toBe(200);
    expect((await UserModel.findOne({ email }))!.refreshTokens).toHaveLength(0);

    // The cookie is cleared, so a refresh has nothing to present.
    const refresh = await agent.post("/api/auth/refresh").send({ portal: "patient" });
    expect(refresh.status).toBe(401);
  });
});
