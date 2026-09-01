import type {
  AuthUser,
  SessionUser,
  HospitalContext,
  HospitalMembership,
  Hospital,
  CreateHospitalResult,
  Role,
} from "./types";

// Shared client for the backend auth API. Every frontend passes its own
// backend base URL (from NEXT_PUBLIC_API_URL) so this file has no per-app config.

// The access token is kept only in memory (a module variable) — never in
// localStorage or a readable cookie. It's lost on page reload by design;
// restoreSession() gets a new one from the refresh cookie on app load.
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

async function apiFetch<T>(baseUrl: string, path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    credentials: "include", // sends/receives the HttpOnly refresh-token cookie
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Something went wrong.");
  }
  return data as T;
}

export function registerAccount(
  baseUrl: string,
  input: { name: string; email: string; password: string; role: Role }
) {
  return apiFetch<{ message: string }>(baseUrl, "/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function verifyOtp(baseUrl: string, input: { email: string; code: string }) {
  return apiFetch<{ message: string }>(baseUrl, "/api/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function login(
  baseUrl: string,
  input: { email: string; password: string; role: Role }
): Promise<{ message: string; user: AuthUser }> {
  const data = await apiFetch<{ message: string; user: AuthUser; accessToken: string }>(
    baseUrl,
    "/api/auth/login",
    { method: "POST", body: JSON.stringify(input) }
  );
  accessToken = data.accessToken;
  return data;
}

export function forgotPassword(baseUrl: string, input: { email: string }) {
  return apiFetch<{ message: string }>(baseUrl, "/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function resetPassword(
  baseUrl: string,
  input: { email: string; code: string; newPassword: string }
) {
  return apiFetch<{ message: string }>(baseUrl, "/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Call this once when the app loads: it trades the HttpOnly refresh cookie for a
// fresh access token, restoring the session after a page reload. Returns null
// (rather than throwing) when there's no valid session, since that's the normal
// "not logged in" case, not an error. `portal` must match the portal used at
// login — each portal has its own separately-named refresh cookie.
export async function restoreSession(baseUrl: string, portal: Role): Promise<AuthUser | null> {
  try {
    const data = await apiFetch<{ accessToken: string; user: AuthUser }>(baseUrl, "/api/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ portal }),
    });
    accessToken = data.accessToken;
    return data.user;
  } catch {
    accessToken = null;
    return null;
  }
}

export async function logout(baseUrl: string, portal: Role): Promise<void> {
  try {
    await apiFetch(baseUrl, "/api/auth/logout", { method: "POST", body: JSON.stringify({ portal }) });
  } finally {
    accessToken = null;
  }
}

// Confirms the current in-memory access token is still valid and returns who it
// belongs to, scoped to the portal that token was issued for. Useful for protected
// pages; restoreSession() is what to call on app load.
export async function getMe(baseUrl: string): Promise<SessionUser> {
  const data = await apiFetch<{ user: SessionUser }>(baseUrl, "/api/auth/me");
  return data.user;
}

// Hospital Portal only, below this point.

export async function listHospitalMemberships(baseUrl: string): Promise<HospitalMembership[]> {
  const data = await apiFetch<{ memberships: HospitalMembership[] }>(baseUrl, "/api/hospital/memberships");
  return data.memberships;
}

// Switches the session's current hospital context. The backend re-verifies
// membership server-side — this call can fail even if the hospitalId came from
// a list this same session fetched moments ago (e.g. access was just revoked).
export async function selectHospital(baseUrl: string, hospitalId: string): Promise<HospitalContext> {
  const data = await apiFetch<{ accessToken: string; hospital: HospitalContext }>(
    baseUrl,
    "/api/hospital/select",
    { method: "POST", body: JSON.stringify({ hospitalId }) }
  );
  accessToken = data.accessToken;
  return data.hospital;
}

// Owner Portal only, below this point.

export async function listHospitals(baseUrl: string): Promise<Hospital[]> {
  const data = await apiFetch<{ hospitals: Hospital[] }>(baseUrl, "/api/owner/hospitals");
  return data.hospitals;
}

// The administrator's credentials are never returned here — they're emailed
// directly, once, by the backend.
export function createHospital(
  baseUrl: string,
  input: { hospitalName: string; adminName: string; adminEmail: string }
): Promise<CreateHospitalResult> {
  return apiFetch<CreateHospitalResult>(baseUrl, "/api/owner/hospitals", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
