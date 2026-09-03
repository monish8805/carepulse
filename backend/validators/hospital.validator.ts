import { Request, Response, NextFunction } from "express";
import { requireString, MAX_ID } from "./field.validator";

export function validateSelectHospital(req: Request, _res: Response, next: NextFunction) {
  try {
    requireString(req.body.hospitalId, "hospitalId", { max: MAX_ID });
    next();
  } catch (err) {
    next(err);
  }
}
