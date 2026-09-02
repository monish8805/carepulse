import { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/httpError";

export function validateAddStaff(req: Request, _res: Response, next: NextFunction) {
  const { name, email, accessRoleId } = req.body;
  if (!name || !email || !accessRoleId) {
    return next(new HttpError(400, "name, email and accessRoleId are required."));
  }
  next();
}

export function validateUpdateStaffRole(req: Request, _res: Response, next: NextFunction) {
  const { accessRoleId } = req.body;
  if (!accessRoleId) {
    return next(new HttpError(400, "accessRoleId is required."));
  }
  next();
}
