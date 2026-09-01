import { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/httpError";

export function validateSelectHospital(req: Request, _res: Response, next: NextFunction) {
  const { hospitalId } = req.body;
  if (!hospitalId) {
    return next(new HttpError(400, "hospitalId is required."));
  }
  next();
}
