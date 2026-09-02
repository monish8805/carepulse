import * as sharedApi from "@shared/api";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
const ROLE = "hospital" as const;

// Calls the backend health-check endpoint and returns whether it responded.
export async function getBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export function register(input: { name: string; email: string; password: string }) {
  return sharedApi.registerAccount(BACKEND_URL, { ...input, role: ROLE });
}

export function verifyOtp(input: { email: string; code: string }) {
  return sharedApi.verifyOtp(BACKEND_URL, input);
}

export function login(input: { email: string; password: string }) {
  return sharedApi.login(BACKEND_URL, { ...input, role: ROLE });
}

export function forgotPassword(input: { email: string }) {
  return sharedApi.forgotPassword(BACKEND_URL, input);
}

export function resetPassword(input: { email: string; code: string; newPassword: string }) {
  return sharedApi.resetPassword(BACKEND_URL, input);
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

export function listHospitalMemberships() {
  return sharedApi.listHospitalMemberships(BACKEND_URL);
}

export function listAllHospitals() {
  return sharedApi.listAllHospitals(BACKEND_URL);
}

export function selectHospital(hospitalId: string) {
  return sharedApi.selectHospital(BACKEND_URL, hospitalId);
}

export function listAccessRoles() {
  return sharedApi.listAccessRoles(BACKEND_URL);
}

export function createAccessRole(input: { name: string; permissions: string[] }) {
  return sharedApi.createAccessRole(BACKEND_URL, input);
}

export function requestHospitalAccess(hospitalId: string) {
  return sharedApi.requestHospitalAccess(BACKEND_URL, hospitalId);
}

export function listMyAccessRequests() {
  return sharedApi.listMyAccessRequests(BACKEND_URL);
}

export function listPendingAccessRequests() {
  return sharedApi.listPendingAccessRequests(BACKEND_URL);
}

export function approveAccessRequest(requestId: string, accessRoleId: string) {
  return sharedApi.approveAccessRequest(BACKEND_URL, requestId, accessRoleId);
}

export function rejectAccessRequest(requestId: string) {
  return sharedApi.rejectAccessRequest(BACKEND_URL, requestId);
}
