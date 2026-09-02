import { Response, NextFunction } from "express";
import * as accessRoleService from "../domain/accessRole.service";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { HttpError } from "../utils/httpError";

export async function createAccessRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.hospitalId) throw new HttpError(400, "Select a hospital first.");
    const accessRole = await accessRoleService.createAccessRole(req.userId!, req.hospitalId, req.body);
    res.status(201).json({ accessRole });
  } catch (err) {
    next(err);
  }
}

export async function listAccessRoles(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.hospitalId) throw new HttpError(400, "Select a hospital first.");
    const accessRoles = await accessRoleService.listAccessRoles(req.userId!, req.hospitalId);
    res.status(200).json({ accessRoles });
  } catch (err) {
    next(err);
  }
}

export async function updateAccessRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.hospitalId) throw new HttpError(400, "Select a hospital first.");
    const accessRole = await accessRoleService.updateAccessRolePermissions(
      req.userId!,
      req.hospitalId,
      req.params.id,
      req.body.permissions
    );
    res.status(200).json({ accessRole });
  } catch (err) {
    next(err);
  }
}

export async function deleteAccessRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.hospitalId) throw new HttpError(400, "Select a hospital first.");
    await accessRoleService.deleteAccessRole(req.userId!, req.hospitalId, req.params.id);
    res.status(200).json({ message: "AccessRole deleted." });
  } catch (err) {
    next(err);
  }
}
