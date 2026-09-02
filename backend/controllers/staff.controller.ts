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

export async function addStaff(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.hospitalId) throw new HttpError(400, "Select a hospital first.");
    const result = await staffService.addStaffDirectly(req.userId!, req.hospitalId, req.body);
    res.status(201).json({ message: "Staff member added.", ...result });
  } catch (err) {
    next(err);
  }
}

export async function disableStaff(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.hospitalId) throw new HttpError(400, "Select a hospital first.");
    const membership = await staffService.disableStaffMember(req.userId!, req.hospitalId, req.params.id);
    res.status(200).json({ message: "Staff member disabled.", membership });
  } catch (err) {
    next(err);
  }
}

export async function enableStaff(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.hospitalId) throw new HttpError(400, "Select a hospital first.");
    const membership = await staffService.enableStaffMember(req.userId!, req.hospitalId, req.params.id);
    res.status(200).json({ message: "Staff member enabled.", membership });
  } catch (err) {
    next(err);
  }
}

export async function updateStaffRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.hospitalId) throw new HttpError(400, "Select a hospital first.");
    const result = await staffService.updateStaffRole(
      req.userId!,
      req.hospitalId,
      req.params.id,
      req.body.accessRoleId
    );
    res.status(200).json({ message: "Staff member's role updated.", ...result });
  } catch (err) {
    next(err);
  }
}
