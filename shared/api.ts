import type {
  AuthUser,
  SessionUser,
  HospitalContext,
  HospitalMembership,
  Hospital,
  CreateHospitalResult,
  AccessRole,
  AccessRequest,
  MyAccessRequest,
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

// The refresh token rotates on every use, so two concurrent callers presenting
// the same cookie would race: the first rotates it, the second's rotation then
// fails with a 401 because that token is already gone. This happens in practice
// because React Strict Mode double-invokes effects in dev, and could also happen
// from two components independently calling restoreSession() on the same load.
// Sharing one in-flight promise means concurrent callers await the same actual
// network call instead of each firing their own.
let refreshInFlight: Promise<AuthUser | null> | null = null;

// Call this once when the app loads: it trades the HttpOnly refresh cookie for a
// fresh access token, restoring the session after a page reload. Returns null
// (rather than throwing) when there's no valid session, since that's the normal
// "not logged in" case, not an error. `portal` must match the portal used at
// login — each portal has its own separately-named refresh cookie.
export function restoreSession(baseUrl: string, portal: Role): Promise<AuthUser | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = apiFetch<{ accessToken: string; user: AuthUser }>(baseUrl, "/api/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ portal }),
  })
    .then((data) => {
      accessToken = data.accessToken;
      return data.user;
    })
    .catch(() => {
      accessToken = null;
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
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

// Directory of every hospital, for someone deciding which one to request
// access to — not scoped to the caller's own memberships.
export async function listAllHospitals(baseUrl: string): Promise<Hospital[]> {
  const data = await apiFetch<{ hospitals: Hospital[] }>(baseUrl, "/api/hospital/hospitals");
  return data.hospitals;
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

// Hospital Portal only, below this point: AccessRoles and staff access requests.
// Both are admin-only for the "manage" half, gated server-side — the frontend
// only chooses whether to show these sections, never enforces the restriction.

export async function listAccessRoles(baseUrl: string): Promise<AccessRole[]> {
  const data = await apiFetch<{ accessRoles: AccessRole[] }>(baseUrl, "/api/hospital/access-roles");
  return data.accessRoles;
}

export function createAccessRole(
  baseUrl: string,
  input: { name: string; permissions: string[] }
): Promise<{ accessRole: AccessRole }> {
  return apiFetch(baseUrl, "/api/hospital/access-roles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function requestHospitalAccess(baseUrl: string, hospitalId: string) {
  return apiFetch<{ message: string; request: { id: string; status: string } }>(
    baseUrl,
    "/api/hospital/access-requests",
    { method: "POST", body: JSON.stringify({ hospitalId }) }
  );
}

export async function listMyAccessRequests(baseUrl: string): Promise<MyAccessRequest[]> {
  const data = await apiFetch<{ requests: MyAccessRequest[] }>(baseUrl, "/api/hospital/access-requests/mine");
  return data.requests;
}

export async function listPendingAccessRequests(baseUrl: string): Promise<AccessRequest[]> {
  const data = await apiFetch<{ requests: AccessRequest[] }>(baseUrl, "/api/hospital/access-requests");
  return data.requests;
}

export function approveAccessRequest(baseUrl: string, requestId: string, accessRoleId: string) {
  return apiFetch(baseUrl, `/api/hospital/access-requests/${requestId}/approve`, {
    method: "POST",
    body: JSON.stringify({ accessRoleId }),
  });
}

export function rejectAccessRequest(baseUrl: string, requestId: string) {
  return apiFetch(baseUrl, `/api/hospital/access-requests/${requestId}/reject`, { method: "POST" });
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
