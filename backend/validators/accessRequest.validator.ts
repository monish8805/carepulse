import { Request, Response, NextFunction } from "express";
import { requireString, MAX_ID } from "./field.validator";

export function validateCreateAccessRequest(req: Request, _res: Response, next: NextFunction) {
  try {
    requireString(req.body.hospitalId, "hospitalId", { max: MAX_ID });
    next();
  } catch (err) {
    next(err);
  }
}

export function validateApproveRequest(req: Request, _res: Response, next: NextFunction) {
  try {
    requireString(req.body.accessRoleId, "accessRoleId", { max: MAX_ID });
    next();
  } catch (err) {
    next(err);
  }
}
