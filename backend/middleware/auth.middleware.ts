import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { HttpError } from "../utils/httpError";
import { Role } from "../models/user.model";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  portal?: Role;
  hospitalId?: string;
}

// The access token travels as "Authorization: Bearer <token>" (kept in memory on the
// frontend), not as a cookie. It only proves *who* is asking and *which portal* they
// authenticated through; permissions still have to be resolved from the database
// wherever they're needed.
export function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    next(new HttpError(401, "Not logged in."));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.id;
    req.portal = payload.portal;
    req.hospitalId = payload.hospitalId;
    next();
  } catch {
    next(new HttpError(401, "Session expired. Please log in again."));
  }
}

// Blocks a request whose session was authenticated through a different portal.
// This is what stops a Patient Portal session (even for a user who is also
// hospital staff) from ever reaching Hospital or Owner Portal endpoints.
export function requirePortal(portal: Role) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (req.portal !== portal) {
      next(new HttpError(403, "This session is not authorized for this portal."));
      return;
    }
    next();
  };
}
