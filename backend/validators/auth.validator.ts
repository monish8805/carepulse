import { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/httpError";
import { ROLES } from "../models/user.model";
import {
  requireString,
  requirePassword,
  MAX_NAME,
  MAX_EMAIL,
  MAX_PHONE,
  MAX_CODE,
  MIN_PASSWORD,
} from "./field.validator";

const REGISTERABLE_ROLES = ["patient", "hospital"];

// These only check the shape of the request. Business rules (does the account
// already exist, is the password correct, etc.) live in domain/auth.service.ts.

export function validateRegister(req: Request, _res: Response, next: NextFunction) {
  try {
    requireString(req.body.name, "name", { max: MAX_NAME });
    requireString(req.body.email, "email", { max: MAX_EMAIL });
    requireString(req.body.phone, "phone", { max: MAX_PHONE });
    // Registering SETS a password, so the length policy applies here.
    requirePassword(req.body.password, "password", { min: MIN_PASSWORD });
    if (!REGISTERABLE_ROLES.includes(req.body.role)) {
      throw new HttpError(400, "role must be 'patient' or 'hospital'.");
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function validateVerifyOtp(req: Request, _res: Response, next: NextFunction) {
  try {
    requireString(req.body.email, "email", { max: MAX_EMAIL });
    requireString(req.body.code, "code", { max: MAX_CODE });
    next();
  } catch (err) {
    next(err);
  }
}

export function validateLogin(req: Request, _res: Response, next: NextFunction) {
  try {
    requireString(req.body.email, "email", { max: MAX_EMAIL });
    // No minimum on login: an account whose password predates the policy (or
    // was machine-generated, like an Owner-provisioned temporary one) still
    // has to be able to authenticate. Only presence/type/upper bound here.
    requirePassword(req.body.password, "password", { min: 1 });
    if (!ROLES.includes(req.body.role)) {
      throw new HttpError(400, "role must be 'patient', 'hospital' or 'owner'.");
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function validatePortal(req: Request, _res: Response, next: NextFunction) {
  const { portal } = req.body;
  if (!portal || !ROLES.includes(portal)) {
    return next(new HttpError(400, "A valid portal is required."));
  }
  next();
}

export function validateForgotPassword(req: Request, _res: Response, next: NextFunction) {
  try {
    requireString(req.body.email, "email", { max: MAX_EMAIL });
    next();
  } catch (err) {
    next(err);
  }
}

export function validateResetPassword(req: Request, _res: Response, next: NextFunction) {
  try {
    requireString(req.body.email, "email", { max: MAX_EMAIL });
    requireString(req.body.code, "code", { max: MAX_CODE });
    // Resetting SETS a password, so the length policy applies here too.
    requirePassword(req.body.newPassword, "newPassword", { min: MIN_PASSWORD });
    next();
  } catch (err) {
    next(err);
  }
}
