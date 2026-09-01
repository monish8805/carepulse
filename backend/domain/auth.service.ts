import { UserModel, Role } from "../models/user.model";
import { OtpModel } from "../models/otp.model";
import { RefreshTokenModel } from "../models/refreshToken.model";
import { hashValue, compareValue } from "../utils/hash";
import { generateOtpCode, OTP_EXPIRES_IN_MINUTES } from "../utils/otp";
import { sendOtpEmail } from "../utils/email";
import { signAccessToken } from "../utils/jwt";
import { generateRefreshToken, hashRefreshToken, REFRESH_TOKEN_MAX_AGE_MS } from "../utils/refreshToken";
import { HttpError } from "../utils/httpError";

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

async function createOtp(email: string, purpose: "register" | "reset", role?: Role) {
  const code = generateOtpCode();
  const codeHash = await hashValue(code);
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_IN_MINUTES * 60 * 1000);

  await OtpModel.create({ email, codeHash, purpose, role, expiresAt });
  await sendOtpEmail(email, code, purpose);
}

// Issues a fresh access/refresh pair and persists the refresh token's hash, bound
// to the given portal (and, for the hospital portal, the currently-selected hospital).
async function issueTokens(
  userId: string,
  portal: Role,
  hospitalId?: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken({ id: userId, portal, hospitalId });
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS);

  await RefreshTokenModel.create({ userId, tokenHash, portal, hospitalId, expiresAt });
  return { accessToken, refreshToken };
}

export async function registerUser(input: { name: string; email: string; password: string; role: Role }) {
  const { name, password, role } = input;
  const normalizedEmail = input.email.toLowerCase().trim();
  const existingUser = await UserModel.findOne({ email: normalizedEmail });

  if (!existingUser) {
    // Brand new account. Not verified yet, so it can't log in until the OTP is confirmed.
    const passwordHash = await hashValue(password);
    await UserModel.create({ name, email: normalizedEmail, passwordHash, roles: [role] });
    await createOtp(normalizedEmail, "register", role);
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
    existingUser.passwordHash = await hashValue(password);
    await existingUser.save();
  }

  await createOtp(normalizedEmail, "register", role);
  return { message: "Check your email for the verification code." };
}

export async function verifyOtp(input: { email: string; code: string }) {
  const normalizedEmail = input.email.toLowerCase().trim();
  const otp = await OtpModel.findOne({ email: normalizedEmail, purpose: "register", used: false })
    .sort({ createdAt: -1 })
    .exec();

  if (!otp || otp.expiresAt < new Date()) {
    throw new HttpError(400, "Code expired or not found. Please register again.");
  }

  const codeMatches = await compareValue(input.code, otp.codeHash);
  if (!codeMatches) {
    throw new HttpError(400, "Incorrect code.");
  }

  otp.used = true;
  await otp.save();

  const user = await UserModel.findOne({ email: normalizedEmail });
  if (!user) {
    throw new HttpError(404, "User not found.");
  }

  if (otp.role && !user.roles.includes(otp.role)) {
    user.roles.push(otp.role);
  }
  user.isVerified = true;
  await user.save();

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

// Rotation: the incoming refresh token is deleted and replaced with a brand new one,
// so a stolen-then-reused token stops working the moment the legitimate owner refreshes.
// portal must match what the token was originally issued for — this is what stops a
// refresh cookie from one portal being used to mint an access token for another.
export async function refreshSession(incomingToken: string | undefined, portal: Role): Promise<AuthSession> {
  if (!incomingToken) {
    throw new HttpError(401, "Not logged in.");
  }

  const tokenHash = hashRefreshToken(incomingToken);
  const stored = await RefreshTokenModel.findOne({ tokenHash });

  if (!stored || stored.expiresAt < new Date() || stored.portal !== portal) {
    throw new HttpError(401, "Session expired. Please log in again.");
  }

  const user = await UserModel.findById(stored.userId);
  const hospitalId = stored.hospitalId ? stored.hospitalId.toString() : undefined;
  await RefreshTokenModel.deleteOne({ _id: stored._id });

  if (!user) {
    throw new HttpError(401, "Session expired. Please log in again.");
  }

  const { accessToken, refreshToken } = await issueTokens(user._id.toString(), portal, hospitalId);
  return { accessToken, refreshToken, user: toPublicUser(user) };
}

export async function logout(incomingToken: string | undefined): Promise<void> {
  if (!incomingToken) return;
  await RefreshTokenModel.deleteOne({ tokenHash: hashRefreshToken(incomingToken) });
}

export async function forgotPassword(input: { email: string }) {
  const normalizedEmail = input.email.toLowerCase().trim();
  const user = await UserModel.findOne({ email: normalizedEmail });

  // Always respond the same way, whether or not the account exists,
  // so this endpoint can't be used to check which emails are registered.
  if (user) {
    await createOtp(normalizedEmail, "reset");
  }
  return { message: "If that email is registered, a reset code has been sent." };
}

export async function resetPassword(input: { email: string; code: string; newPassword: string }) {
  const normalizedEmail = input.email.toLowerCase().trim();
  const otp = await OtpModel.findOne({ email: normalizedEmail, purpose: "reset", used: false })
    .sort({ createdAt: -1 })
    .exec();

  if (!otp || otp.expiresAt < new Date()) {
    throw new HttpError(400, "Code expired or not found. Please try again.");
  }

  const codeMatches = await compareValue(input.code, otp.codeHash);
  if (!codeMatches) {
    throw new HttpError(400, "Incorrect code.");
  }

  const user = await UserModel.findOne({ email: normalizedEmail });
  if (!user) {
    throw new HttpError(404, "User not found.");
  }

  otp.used = true;
  await otp.save();
  user.passwordHash = await hashValue(input.newPassword);
  await user.save();

  // A password reset invalidates every existing session for this account.
  await RefreshTokenModel.deleteMany({ userId: user._id });

  return { message: "Password reset. You can now log in." };
}

export async function getUserById(id: string): Promise<PublicUser> {
  const user = await UserModel.findById(id);
  if (!user) {
    throw new HttpError(404, "User not found.");
  }
  return toPublicUser(user);
}
