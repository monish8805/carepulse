import { Request, Response, NextFunction } from "express";
import { requireString, requireStringArray, MAX_EMAIL, MAX_SHORT_TEXT } from "./field.validator";

// These only check the shape of the request. Business rules (is this really
// an active doctor, are the categories valid, does this grant belong to the
// caller) live in domain/patientConsent.service.ts.

export function validateGrantAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    requireString(req.body.doctorEmail, "doctorEmail", { max: MAX_EMAIL });
    requireStringArray(req.body.dataCategories, "dataCategories");
    next();
  } catch (err) {
    next(err);
  }
}

export function validateUpdateGrant(req: Request, _res: Response, next: NextFunction) {
  try {
    requireStringArray(req.body.dataCategories, "dataCategories");
    next();
  } catch (err) {
    next(err);
  }
}

export function validateDoctorLookup(req: Request, _res: Response, next: NextFunction) {
  try {
    requireString(req.query.email, "email query parameter", { max: MAX_EMAIL });
    next();
  } catch (err) {
    next(err);
  }
}

// Bounded deliberately: `specialization` is free text that gets shown to
// PATIENTS on every doctor lookup and on every grant row, so an unbounded
// value would be stored once and echoed everywhere.
export function validateUpdateProfile(req: Request, _res: Response, next: NextFunction) {
  try {
    requireString(req.body.specialization, "specialization", { max: MAX_SHORT_TEXT });
    next();
  } catch (err) {
    next(err);
  }
}
