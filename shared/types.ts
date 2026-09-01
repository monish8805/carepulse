export type Role = "patient" | "hospital" | "owner";

// Deliberately has no `roles` field: a session must never reveal which other
// portals/roles the account has — see SessionUser for the portal-scoped view.
export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface HospitalContext {
  id: string;
  name: string;
  role: string;
}

// What GET /me returns: scoped to whichever portal the session was authenticated
// through. `hospital` is only ever present for portal === "hospital".
export interface SessionUser extends AuthUser {
  portal: Role;
  hospital?: HospitalContext | null;
}

export interface HospitalMembership {
  hospitalId: string;
  hospitalName: string;
  role: string;
}

// Owner Portal only, below this point.

export interface Hospital {
  id: string;
  name: string;
}

export interface CreateHospitalResult {
  hospital: Hospital;
  admin: { id: string; name: string; email: string };
}
