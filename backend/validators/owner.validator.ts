import { Request, Response, NextFunction } from "express";
import { requireString, MAX_NAME, MAX_EMAIL, MAX_SHORT_TEXT } from "./field.validator";

export function validateCreateHospital(req: Request, _res: Response, next: NextFunction) {
  try {
    requireString(req.body.hospitalName, "hospitalName", { max: MAX_SHORT_TEXT });
    requireString(req.body.adminName, "adminName", { max: MAX_NAME });
    requireString(req.body.adminEmail, "adminEmail", { max: MAX_EMAIL });
    next();
  } catch (err) {
    next(err);
  }
}
