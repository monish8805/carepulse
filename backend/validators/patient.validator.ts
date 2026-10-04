import { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/httpError";
import { requireIsoDate, requireString, MAX_PHONE, MAX_SHORT_TEXT } from "./field.validator";

// Shape only. Whether the values are acceptable lives in
// domain/auth.service.ts::updatePatientProfile.
export function validateUpdatePatientProfile(req: Request, _res: Response, next: NextFunction) {
  try {
    requireIsoDate(req.body.dateOfBirth, "dateOfBirth");
    requireString(req.body.gender, "gender", { max: MAX_SHORT_TEXT });
    requireString(req.body.bloodType, "bloodType", { max: MAX_SHORT_TEXT });
    // Optional: absent, null or "" all mean "no guardian phone".
    const guardianPhone = req.body.guardianPhone;
    if (guardianPhone !== undefined && guardianPhone !== null) {
      if (typeof guardianPhone !== "string" || guardianPhone.length > MAX_PHONE) {
        throw new HttpError(400, `guardianPhone must be text of at most ${MAX_PHONE} characters.`);
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}
