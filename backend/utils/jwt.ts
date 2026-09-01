import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env";
import { Role } from "../models/user.model";

// Deliberately short-lived and carries almost nothing. "portal" is not a permission —
// it's which portal this session was authenticated through (patient/hospital/owner),
// which is what makes portal isolation enforceable server-side. Actual roles and
// permissions are never trusted from the token; every request re-checks them
// against the database. hospitalId is only meaningful for portal "hospital" and
// records which hospital membership is currently selected.
const ACCESS_TOKEN_EXPIRES_IN = "15m";

export interface AccessTokenPayload {
  id: string;
  portal: Role;
  hospitalId?: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
}
