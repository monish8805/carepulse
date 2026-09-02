import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.middleware";
import { resolvePermissions } from "../domain/permission.service";
import { HttpError } from "../utils/httpError";
import { Permission } from "../config/permissions";

// Must run after requireAuth (and typically requirePortal("hospital")), which
// populate req.userId / req.hospitalId from the access token. This middleware
// resolves permissions fresh from the database on every request — see
// domain/permission.service.ts for why that's the point.
export function requirePermission(permission: Permission) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    try {
      const permissions = await resolvePermissions(req.userId, req.hospitalId);
      if (!permissions.includes(permission)) {
        next(new HttpError(403, `Missing required permission: ${permission}`));
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
