import mongoose, { HydratedDocument } from "mongoose";
import { UserModel, User, Role } from "../models/user.model";
import { hashValue, compareValue } from "../utils/hash";
import { generateOtpCode, OTP_EXPIRES_IN_MINUTES } from "../utils/otp";
import { sendOtpEmail } from "../utils/email";
import { signAccessToken } from "../utils/jwt";
import { generateRefreshToken, hashRefreshToken, REFRESH_TOKEN_MAX_AGE_MS } from "../utils/refreshToken";
import { HttpError } from "../utils/httpError";

type UserDoc = HydratedDocument<User>;

interface PublicUser {
  id: string;
  name: string;
  email: string;
}

interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

// Deliberately does NOT include the account's global `roles` array. A user's other
// portal memberships (e.g. also being hospital staff) must never be visible from
// a session authenticated through a different portal.
function toPublicUser(user: { _id: unknown; name: string; email: string }): PublicUser {
  return { id: String(user._id), name: user.name, email: user.email };
}

// Used for the OTP/password read-modify-write paths below, which need async
// business-rule checks (bcrypt compare, expiry) that can't be expressed as a
// pure atomic MongoDB update. These are comparatively low-frequency/low-
// contention (a user isn't firing concurrent register/verify/reset calls the
// way a browser fires concurrent token refreshes), so an occasional retry on
// a version conflict is an acceptable, simple fix. The refresh-token paths
// (issueTokens/refreshSession/logout/rememberSelectedHospital below) do NOT
// use this — they're the highest-frequency, highest-contention operations
// here, and use atomic $push/$pull/$set instead, which can't lose a concurrent
// write the way retrying a full read-modify-save cycle still can under a
// genuine burst (see the "atomic update operators" note further down).
//
// `find` re-fetches the user each attempt; `mutate` re-applies the change and
// may itself throw a business-rule HttpError (e.g. "code expired"), which is
// never retried — only VersionError is.
async function withVersionRetry<T>(
  find: () => Promise<UserDoc | null>,
  mutate: (user: UserDoc) => Promise<T> | T,
  maxAttempts = 5
): Promise<{ user: UserDoc; result: T }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const user = await find();
    if (!user) {
      throw new HttpError(404, "User not found.");
    }
    const result = await mutate(user);
    try {
      await user.save();
      return { user, result };
    } catch (err) {
      if (err instanceof mongoose.Error.VersionError && attempt < maxAttempts - 1) {
        continue;
      }
      throw err;
    }
  }
  throw new HttpError(500, "Could not save — please try again.");
}

async function setRegisterOtp(userId: string, role: Role): Promise<void> {
  const code = generateOtpCode();
  const codeHash = await hashValue(code);
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_IN_MINUTES * 60 * 1000);

  const { user } = await withVersionRetry(
    () => UserModel.findById(userId),
    (u) => {
      u.registerOtp = { codeHash, role, expiresAt };
    }
  );
  await sendOtpEmail(user.email, code, "register");
}

async function setResetOtp(userId: string): Promise<void> {
  const code = generateOtpCode();
  const codeHash = await hashValue(code);
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_IN_MINUTES * 60 * 1000);

  const { user } = await withVersionRetry(
    () => UserModel.findById(userId),
    (u) => {
      u.resetOtp = { codeHash, expiresAt };
    }
  );
  await sendOtpEmail(user.email, code, "reset");
}

// Cap on concurrent sessions per (user, portal) — not per user overall, since
// one account can hold separate patient/hospital/owner sessions at once (see
// the per-portal refresh cookie names in auth.controller.ts). Scoping the cap
// this way means logging into a new device on one portal can never evict a
// session on a different portal.
const MAX_REFRESH_TOKENS_PER_PORTAL = 3;

// Token issuance/removal use atomic MongoDB update operators ($push/$pull),
// NOT the fetch→mutate→save pattern the rest of this file uses. This is
// deliberate: login/refresh are the highest-frequency, highest-concurrency
// operations here (every page load, every 15 minutes, possibly doubled by
// React StrictMode) — a read-then-write-with-retry can still let the FIFO cap
// be exceeded under a genuine burst (each retry only sees a snapshot; several
// requests can each correctly compute "still under the cap" against the same
// snapshot before any of them commits). An atomic $push can never be lost or
// mis-evict, because MongoDB applies it directly against whatever the current
// document is, with no read-compute-write gap for another request to land in.

// Best-effort cap enforcement: trims the oldest excess entries for this portal
// down to the cap, identified from a fresh read. Uses $pull with explicit
// tokenHashes (not $slice, which can't be scoped to a portal subset of the
// array). Under a heavy simultaneous burst the count may transiently sit a
// little over the cap between one push and the next eviction pass — it's a
// soft session-hygiene limit, not a security boundary — but a push itself can
// never fail, throw, or lose another session's entry.
async function evictExcessTokens(userId: string, portal: Role): Promise<void> {
  const user = await UserModel.findById(userId).select("refreshTokens");
  if (!user) return;

  const forThisPortal = [...user.refreshTokens]
    .filter((t) => t.portal === portal)
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));

  if (forThisPortal.length <= MAX_REFRESH_TOKENS_PER_PORTAL) return;

  const toRemove = forThisPortal.slice(0, forThisPortal.length - MAX_REFRESH_TOKENS_PER_PORTAL);
  await UserModel.updateOne(
    { _id: userId },
    { $pull: { refreshTokens: { tokenHash: { $in: toRemove.map((t) => t.tokenHash) } } } }
  );
}

// Issues a fresh access/refresh pair for an already-known-good userId.
async function issueTokens(
  userId: string,
  portal: Role,
  hospitalId?: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken({ id: userId, portal, hospitalId });
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS);

  await UserModel.updateOne({ _id: userId }, { $push: { refreshTokens: { tokenHash, portal, hospitalId, expiresAt } } });
  await evictExcessTokens(userId, portal);

  return { accessToken, refreshToken };
}

export async function registerUser(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: Role;
}) {
  const { name, phone, password, role } = input;
  const normalizedEmail = input.email.toLowerCase().trim();
  const existingUser = await UserModel.findOne({ email: normalizedEmail });

  if (!existingUser) {
    // Brand new account. Not verified yet, so it can't log in until the OTP is confirmed.
    const passwordHash = await hashValue(password);
    const user = await UserModel.create({ name, email: normalizedEmail, phone, passwordHash, roles: [role] });
    await setRegisterOtp(user._id.toString(), role);
    return { message: "Registered. Check your email for the verification code." };
  }

  if (existingUser.roles.includes(role) && existingUser.isVerified) {
    throw new HttpError(409, `This email is already registered as a ${role}. Please log in.`);
  }

  // Existing, verified account adding a new role: confirm it's really them via their current password.
  if (existingUser.isVerified) {
    const passwordMatches = await compareValue(password, existingUser.passwordHash);
    if (!passwordMatches) {
      throw new HttpError(401, "Incorrect password for existing account.");
    }
  } else {
    // Not verified yet, so let them update the password in case they mistyped it the first time.
    const newPasswordHash = await hashValue(password);
    await withVersionRetry(
      () => UserModel.findById(existingUser._id),
      (u) => {
        u.passwordHash = newPasswordHash;
      }
    );
  }

  await setRegisterOtp(existingUser._id.toString(), role);
  return { message: "Check your email for the verification code." };
}

export async function verifyOtp(input: { email: string; code: string }) {
  const normalizedEmail = input.email.toLowerCase().trim();
  const lookup = await UserModel.findOne({ email: normalizedEmail });
  if (!lookup) {
    throw new HttpError(400, "Code expired or not found. Please register again.");
  }

  await withVersionRetry(
    () => UserModel.findById(lookup._id),
    async (user) => {
      if (!user.registerOtp || user.registerOtp.expiresAt < new Date()) {
        throw new HttpError(400, "Code expired or not found. Please register again.");
      }
      const codeMatches = await compareValue(input.code, user.registerOtp.codeHash);
      if (!codeMatches) {
        throw new HttpError(400, "Incorrect code.");
      }
      const grantedRole = user.registerOtp.role;
      if (grantedRole && !user.roles.includes(grantedRole)) {
        user.roles.push(grantedRole);
      }
      user.isVerified = true;
      user.registerOtp = null;
    }
  );

  return { message: "Email verified. You can now log in." };
}

export async function login(input: { email: string; password: string; role: Role }): Promise<AuthSession> {
  const normalizedEmail = input.email.toLowerCase().trim();
  const user = await UserModel.findOne({ email: normalizedEmail });

  if (!user || !user.isVerified) {
    throw new HttpError(401, "Invalid email or password.");
  }

  const passwordMatches = await compareValue(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new HttpError(401, "Invalid email or password.");
  }

  if (!user.roles.includes(input.role)) {
    throw new HttpError(403, `This account is not registered as a ${input.role}.`);
  }

  const { accessToken, refreshToken } = await issueTokens(user._id.toString(), input.role);
  return { accessToken, refreshToken, user: toPublicUser(user) };
}

// Rotation: the incoming refresh token is removed and replaced with a brand new one,
// so a stolen-then-reused token stops working the moment the legitimate owner refreshes.
// portal must match what the token was originally issued for — this is what stops a
// refresh cookie from one portal being used to mint an access token for another.
export async function refreshSession(incomingToken: string | undefined, portal: Role): Promise<AuthSession> {
  if (!incomingToken) {
    throw new HttpError(401, "Not logged in.");
  }

  const tokenHash = hashRefreshToken(incomingToken);
  const lookup = await UserModel.findOne({ "refreshTokens.tokenHash": tokenHash });
  const lookupEntry = lookup?.refreshTokens.find((t) => t.tokenHash === tokenHash);

  if (!lookup || !lookupEntry || lookupEntry.expiresAt < new Date() || lookupEntry.portal !== portal) {
    throw new HttpError(401, "Session expired. Please log in again.");
  }

  const userId = lookup._id.toString();
  const hospitalId = lookupEntry.hospitalId ? lookupEntry.hospitalId.toString() : undefined;
  const newRefreshToken = generateRefreshToken();
  const newTokenHash = hashRefreshToken(newRefreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS);

  // Atomically remove the presented token. $pull matches at most the one
  // entry with this exact tokenHash — if two concurrent refresh calls somehow
  // present the same token, only the first's $pull actually matches anything
  // (matchedCount reflects whether the *document* still had it, not whether
  // the pull itself found the array element, so we re-check with a second
  // read below only if needed — in practice a duplicate never reaches here
  // since rotation means the token is gone after the first successful pull).
  const pullResult = await UserModel.updateOne(
    { _id: userId, "refreshTokens.tokenHash": tokenHash },
    { $pull: { refreshTokens: { tokenHash } } }
  );
  if (pullResult.matchedCount === 0) {
    throw new HttpError(401, "Session expired. Please log in again.");
  }

  await UserModel.updateOne(
    { _id: userId },
    { $push: { refreshTokens: { tokenHash: newTokenHash, portal, hospitalId, expiresAt } } }
  );
  await evictExcessTokens(userId, portal);

  const user = await UserModel.findById(userId);
  if (!user) {
    throw new HttpError(401, "Session expired. Please log in again.");
  }

  const accessToken = signAccessToken({ id: userId, portal, hospitalId });
  return { accessToken, refreshToken: newRefreshToken, user: toPublicUser(user) };
}

export async function logout(incomingToken: string | undefined): Promise<void> {
  if (!incomingToken) return;
  const tokenHash = hashRefreshToken(incomingToken);
  await UserModel.updateOne({ "refreshTokens.tokenHash": tokenHash }, { $pull: { refreshTokens: { tokenHash } } });
}

// Remembers which hospital a session has selected, on the refresh-token entry
// itself, so the selection survives the next silent /refresh (the access token
// alone only lasts 15 minutes). Called from hospital.controller.ts::selectHospital.
// Uses the positional $ operator to update just the matching array element —
// atomic, no read-modify-write race with a concurrent login/refresh/logout.
export async function rememberSelectedHospital(
  userId: string,
  incomingRefreshToken: string | undefined,
  hospitalId: string
): Promise<void> {
  if (!incomingRefreshToken) return;
  const tokenHash = hashRefreshToken(incomingRefreshToken);
  await UserModel.updateOne(
    { _id: userId, "refreshTokens.tokenHash": tokenHash, "refreshTokens.portal": "hospital" },
    { $set: { "refreshTokens.$.hospitalId": hospitalId } }
  );
}

export async function forgotPassword(input: { email: string }) {
  const normalizedEmail = input.email.toLowerCase().trim();
  const user = await UserModel.findOne({ email: normalizedEmail });

  // Always respond the same way, whether or not the account exists,
  // so this endpoint can't be used to check which emails are registered.
  if (user) {
    await setResetOtp(user._id.toString());
  }
  return { message: "If that email is registered, a reset code has been sent." };
}

export async function resetPassword(input: { email: string; code: string; newPassword: string }) {
  const normalizedEmail = input.email.toLowerCase().trim();
  const lookup = await UserModel.findOne({ email: normalizedEmail });
  if (!lookup) {
    throw new HttpError(400, "Code expired or not found. Please try again.");
  }

  const newPasswordHash = await hashValue(input.newPassword);

  await withVersionRetry(
    () => UserModel.findById(lookup._id),
    async (user) => {
      if (!user.resetOtp || user.resetOtp.expiresAt < new Date()) {
        throw new HttpError(400, "Code expired or not found. Please try again.");
      }
      const codeMatches = await compareValue(input.code, user.resetOtp.codeHash);
      if (!codeMatches) {
        throw new HttpError(400, "Incorrect code.");
      }
      user.resetOtp = null;
      user.passwordHash = newPasswordHash;
      // A password reset invalidates every existing session for this account.
      user.refreshTokens = [] as unknown as typeof user.refreshTokens;
    }
  );

  return { message: "Password reset. You can now log in." };
}

export async function getUserById(id: string): Promise<PublicUser> {
  const user = await UserModel.findById(id);
  if (!user) {
    throw new HttpError(404, "User not found.");
  }
  return toPublicUser(user);
}
