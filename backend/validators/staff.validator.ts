import { Request, Response, NextFunction } from "express";
import { requireString, MAX_NAME, MAX_EMAIL, MAX_ID } from "./field.validator";

export function validateAddStaff(req: Request, _res: Response, next: NextFunction) {
  try {
    requireString(req.body.name, "name", { max: MAX_NAME });
    requireString(req.body.email, "email", { max: MAX_EMAIL });
    requireString(req.body.accessRoleId, "accessRoleId", { max: MAX_ID });
    next();
  } catch (err) {
    next(err);
  }
}

export function validateUpdateStaffRole(req: Request, _res: Response, next: NextFunction) {
  try {
    requireString(req.body.accessRoleId, "accessRoleId", { max: MAX_ID });
    next();
  } catch (err) {
    next(err);
  }
}
