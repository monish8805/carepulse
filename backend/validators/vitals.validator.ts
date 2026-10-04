import { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/httpError";
import { optionalNumberInRange, requireIsoDate } from "./field.validator";
import { VITALS, VITAL_RANGES } from "../config/vitals";

// Shape only: a date and up to seven numbers inside the model's plausible
// ranges. Whether recordedAt is an acceptable moment lives in
// domain/vitals.service.ts.
export function validateRecordVitals(req: Request, _res: Response, next: NextFunction) {
  try {
    requireIsoDate(req.body.recordedAt, "recordedAt");
    const values = VITALS.map((vital) => optionalNumberInRange(req.body[vital], vital, VITAL_RANGES[vital]));
    if (values.every((value) => value === null)) {
      throw new HttpError(400, `Record at least one vital (${VITALS.join(", ")}).`);
    }
    next();
  } catch (err) {
    next(err);
  }
}
