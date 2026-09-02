import { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/httpError";

export function validateCreateAccessRequest(req: Request, _res: Response, next: NextFunction) {
  const { hospitalId } = req.body;
  if (!hospitalId) {
    return next(new HttpError(400, "hospitalId is required."));
  }
  next();
}

export function validateApproveRequest(req: Request, _res: Response, next: NextFunction) {
  const { accessRoleId } = req.body;
  if (!accessRoleId) {
    return next(new HttpError(400, "accessRoleId is required."));
  }
  next();
}
