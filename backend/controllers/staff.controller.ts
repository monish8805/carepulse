import { Response, NextFunction } from "express";
import * as staffService from "../domain/staff.service";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { HttpError } from "../utils/httpError";

export async function listStaff(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.hospitalId) throw new HttpError(400, "Select a hospital first.");
    const staff = await staffService.listStaff(req.userId!, req.hospitalId);
    res.status(200).json({ staff });
  } catch (err) {
    next(err);
  }
}

export async function removeStaffMember(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.hospitalId) throw new HttpError(400, "Select a hospital first.");
    const membership = await staffService.removeStaffMember(req.userId!, req.hospitalId, req.params.id);
    res.status(200).json({ message: "Staff member removed.", membership });
  } catch (err) {
    next(err);
  }
}
