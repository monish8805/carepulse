import { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/httpError";

export function validateCreateAccessRole(req: Request, _res: Response, next: NextFunction) {
  const { name, permissions } = req.body;
  if (!name || !Array.isArray(permissions)) {
    return next(new HttpError(400, "name and permissions[] are required."));
  }
  next();
}

export function validateUpdateAccessRole(req: Request, _res: Response, next: NextFunction) {
  const { permissions } = req.body;
  if (!Array.isArray(permissions)) {
    return next(new HttpError(400, "permissions[] is required."));
  }
  next();
}
