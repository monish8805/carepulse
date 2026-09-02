import { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/httpError";
import { ROLES } from "../models/user.model";

const REGISTERABLE_ROLES = ["patient", "hospital"];

// These only check the shape of the request. Business rules (does the account
// already exist, is the password correct, etc.) live in domain/auth.service.ts.

export function validateRegister(req: Request, _res: Response, next: NextFunction) {
  const { name, email, phone, password, role } = req.body;
  if (!name || !email || !phone || !password || !role) {
    return next(new HttpError(400, "name, email, phone, password and role are required."));
  }
  if (!REGISTERABLE_ROLES.includes(role)) {
    return next(new HttpError(400, "role must be 'patient' or 'hospital'."));
  }
  next();
}

export function validateVerifyOtp(req: Request, _res: Response, next: NextFunction) {
  const { email, code } = req.body;
  if (!email || !code) {
    return next(new HttpError(400, "email and code are required."));
  }
  next();
}

export function validateLogin(req: Request, _res: Response, next: NextFunction) {
  const { email, password, role } = req.body;
  if (!email || !password || !role) {
    return next(new HttpError(400, "email, password and role are required."));
  }
  if (!ROLES.includes(role)) {
    return next(new HttpError(400, "role must be 'patient', 'hospital' or 'owner'."));
  }
  next();
}

export function validatePortal(req: Request, _res: Response, next: NextFunction) {
  const { portal } = req.body;
  if (!portal || !ROLES.includes(portal)) {
    return next(new HttpError(400, "A valid portal is required."));
  }
  next();
}

export function validateForgotPassword(req: Request, _res: Response, next: NextFunction) {
  const { email } = req.body;
  if (!email) {
    return next(new HttpError(400, "email is required."));
  }
  next();
}

export function validateResetPassword(req: Request, _res: Response, next: NextFunction) {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) {
    return next(new HttpError(400, "email, code and newPassword are required."));
  }
  next();
}
