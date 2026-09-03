import { Request, Response, NextFunction } from "express";
import { requireString, requireStringArray, MAX_SHORT_TEXT } from "./field.validator";

export function validateCreateAccessRole(req: Request, _res: Response, next: NextFunction) {
  try {
    requireString(req.body.name, "name", { max: MAX_SHORT_TEXT });
    requireStringArray(req.body.permissions, "permissions");
    next();
  } catch (err) {
    next(err);
  }
}

export function validateUpdateAccessRole(req: Request, _res: Response, next: NextFunction) {
  try {
    requireStringArray(req.body.permissions, "permissions");
    next();
  } catch (err) {
    next(err);
  }
}
