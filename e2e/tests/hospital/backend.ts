import { FakeBackend, json } from "../../fakeBackend";

export type MembershipStatus = "pending" | "active" | "disabled" | null;

export interface HospitalState {
  loggedIn: boolean;
  // Bumping this "expires" every access token issued so far.
  tokenVersion: number;
  refreshWorks: boolean;
  membership: MembershipStatus;
  // Like the real backend, /me only carries hospital context once a hospital
  // has been selected for the session (POST /api/hospital/select).
  hospitalSelected: boolean;
  // Whether POST /access-requests actually creates a pending request.
  requestPersists: boolean;
  role: "admin" | "staff";
  canManageStaff: boolean;
  canViewPatients: boolean;
  staff: {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    accessRoleId: string | null;
    accessRoleName: string | null;
    status: string;
    canManageStaff: boolean;
  }[];
  patients: { id: string; patientId: string; patientName: string; dataCategories: string[]; createdAt: string }[];
}

export function defaultState(): HospitalState {
  return {
    loggedIn: true,
    tokenVersion: 1,
    refreshWorks: true,
    membership: "active",
    hospitalSelected: true,
    requestPersists: true,
    role: "admin",
    canManageStaff: true,
    canViewPatients: true,
    staff: [
      { id: "m1", userId: "u2", userName: "Nina Nurse", userEmail: "nina@x.com", accessRoleId: "r1", accessRoleName: "Nurse", status: "active", canManageStaff: false },
      { id: "m2", userId: "u3", userName: "Omar Ortho", userEmail: "omar@x.com", accessRoleId: "r1", accessRoleName: "Nurse", status: "active", canManageStaff: false },
    ],
    patients: [{ id: "g1", patientId: "p1", patientName: "Pat One", dataCategories: ["vitals.continuous"], createdAt: "2026-09-01T00:00:00Z" }],
  };
}

// A fake of every endpoint the Hospital Portal uses, driven by a mutable
// `state` the test can change mid-run (e.g. revoke a permission server-side).
// Auth is modelled like the real backend: a request whose bearer token isn't
// the current version gets a 401, and /refresh issues a new one.
export function hospitalBackend(overrides: Partial<HospitalState> = {}, delayMs = 0) {
  const state: HospitalState = { ...defaultState(), ...overrides };
  const token = () => `t${state.tokenVersion}`;
  const me = () => ({
    id: "u1",
    name: "Ada Admin",
    email: "ada@x.com",
    portal: "hospital",
    specialization: null,
    hospital:
      state.membership === "active" && state.hospitalSelected
        ? { id: "h1", name: "City Hospital", role: state.role, canManageStaff: state.canManageStaff, canViewPatients: state.canViewPatients }
        : null,
  });
  const authed = (handler: () => ReturnType<typeof json>) => (request: { headers(): Record<string, string> }) =>
    request.headers()["authorization"] === `Bearer ${token()}` && state.loggedIn
      ? handler()
      : json({ message: "Session expired. Please log in again." }, 401);

  const backend = new FakeBackend(
    {
      "POST /api/auth/refresh": () => {
        if (!state.loggedIn || !state.refreshWorks) return json({ message: "Not logged in." }, 401);
        state.tokenVersion++;
        return json({ accessToken: token(), user: me() });
      },
      "POST /api/auth/login": () => {
        state.loggedIn = true;
        state.refreshWorks = true;
        state.tokenVersion++;
        return json({ message: "ok", accessToken: token(), user: me() });
      },
      "POST /api/auth/logout": () => {
        state.loggedIn = false;
        return json({ message: "ok" });
      },
      "GET /api/auth/me": authed(() => json({ user: me() })),
      "GET /api/hospital/access-requests/mine": authed(() =>
        json({
          requests: state.membership
            ? [{ id: "req1", hospitalId: "h1", hospitalName: "City Hospital", role: state.role, status: state.membership, createdAt: "2026-09-01T00:00:00Z" }]
            : [],
        })
      ),
      "GET /api/hospital/hospitals": authed(() => json({ hospitals: [{ id: "h1", name: "City Hospital", isActive: true }] })),
      "POST /api/hospital/access-requests": authed(() => {
        if (state.requestPersists) state.membership = "pending";
        return json({ message: "ok" }, 201);
      }),
      "POST /api/hospital/select": authed(() => {
        state.hospitalSelected = state.membership === "active";
        return json({ accessToken: token(), hospital: me().hospital });
      }),
      "GET /api/hospital/access-roles": authed(() =>
        json({ accessRoles: [{ id: "r1", name: "Nurse", permissions: ["patient.view"], isActive: true }] })
      ),
      "GET /api/hospital/access-requests": authed(() => json({ requests: [] })),
      "GET /api/hospital/staff": authed(() => json({ staff: state.staff })),
      "POST /api/hospital/staff/:id/disable": (request, { id }) =>
        authed(() => {
          state.staff = state.staff.map((s) => (s.id === id ? { ...s, status: "disabled" } : s));
          return json({ message: "ok" });
        })(request),
      "POST /api/hospital/staff/:id/enable": (request, { id }) =>
        authed(() => {
          state.staff = state.staff.map((s) => (s.id === id ? { ...s, status: "active" } : s));
          return json({ message: "ok" });
        })(request),
      "DELETE /api/hospital/staff/:id": authed(() => json({ message: "You can't remove this staff member." }, 403)),
      // Enforced like the real backend's requirePermission("patient.view").
      "GET /api/hospital/patient-consents": authed(() =>
        state.canViewPatients
          ? json({ patients: state.patients })
          : json({ message: "Missing required permission: patient.view" }, 403)
      ),
      "POST /api/hospital/patient-consents/:id/revoke": (request, { id }) =>
        authed(() => {
          state.patients = state.patients.filter((p) => p.id !== id);
          return json({ message: "ok" });
        })(request),
    },
    delayMs
  );
  return { backend, state };
}

export const GREETING = /Good (morning|afternoon|evening), Ada/;
