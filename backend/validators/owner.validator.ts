import { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/httpError";

export function validateCreateHospital(req: Request, _res: Response, next: NextFunction) {
  const { hospitalName, adminName, adminEmail } = req.body;
  if (!hospitalName || !adminName || !adminEmail) {
    return next(new HttpError(400, "hospitalName, adminName and adminEmail are required."));
  }
  next();
}
