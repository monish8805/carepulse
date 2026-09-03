import { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/httpError";

// These only check the shape of the request. Business rules (is this really
// an active doctor, are the categories valid, does this grant belong to the
// caller) live in domain/patientConsent.service.ts.

export function validateGrantAccess(req: Request, _res: Response, next: NextFunction) {
  const { doctorEmail, dataCategories } = req.body;
  if (!doctorEmail || typeof doctorEmail !== "string") {
    return next(new HttpError(400, "doctorEmail is required."));
  }
  if (!Array.isArray(dataCategories)) {
    return next(new HttpError(400, "dataCategories must be an array."));
  }
  next();
}

export function validateUpdateGrant(req: Request, _res: Response, next: NextFunction) {
  const { dataCategories } = req.body;
  if (!Array.isArray(dataCategories)) {
    return next(new HttpError(400, "dataCategories must be an array."));
  }
  next();
}

export function validateDoctorLookup(req: Request, _res: Response, next: NextFunction) {
  const { email } = req.query;
  if (!email || typeof email !== "string") {
    return next(new HttpError(400, "email query parameter is required."));
  }
  next();
}

export function validateUpdateProfile(req: Request, _res: Response, next: NextFunction) {
  const { specialization } = req.body;
  if (typeof specialization !== "string") {
    return next(new HttpError(400, "specialization is required."));
  }
  next();
}
