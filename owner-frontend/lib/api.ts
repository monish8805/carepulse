import * as sharedApi from "@shared/api";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
const ROLE = "owner" as const;

// Calls the backend health-check endpoint and returns whether it responded.
export async function getBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// No register/forgot-password here on purpose: owner accounts are created only
// via the backend seed script, never through public sign-up.
export function login(input: { email: string; password: string }) {
  return sharedApi.login(BACKEND_URL, { ...input, role: ROLE });
}

// Call on app load to restore the session (access token is only kept in memory,
// so it's lost on every page reload).
export function restoreSession() {
  return sharedApi.restoreSession(BACKEND_URL, ROLE);
}

export function getMe() {
  return sharedApi.getMe(BACKEND_URL);
}

export function logout() {
  return sharedApi.logout(BACKEND_URL, ROLE);
}
