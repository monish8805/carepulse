import { Response, NextFunction } from "express";
import * as accessRequestService from "../domain/accessRequest.service";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { HttpError } from "../utils/httpError";

// Requires only requireAuth + requirePortal("hospital") — deliberately no current
// hospital context, since a first-time requester has none yet (that's the point).
export async function createAccessRequest(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { hospitalId } = req.body as { hospitalId: string };
    const request = await accessRequestService.requestAccess(req.userId!, hospitalId);
    res.status(201).json({ message: "Access request submitted.", request });
  } catch (err) {
    next(err);
  }
}

export async function listMyAccessRequests(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const requests = await accessRequestService.listMyRequests(req.userId!);
    res.status(200).json({ requests });
  } catch (err) {
    next(err);
  }
}

export async function listPendingAccessRequests(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.hospitalId) throw new HttpError(400, "Select a hospital first.");
    const requests = await accessRequestService.listPendingRequests(req.userId!, req.hospitalId);
    res.status(200).json({ requests });
  } catch (err) {
    next(err);
  }
}

export async function approveAccessRequest(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.hospitalId) throw new HttpError(400, "Select a hospital first.");
    const { accessRoleId } = req.body as { accessRoleId: string };
    const membership = await accessRequestService.approveRequest(
      req.userId!,
      req.hospitalId,
      req.params.id,
      accessRoleId
    );
    res.status(200).json({ message: "Request approved.", membership });
  } catch (err) {
    next(err);
  }
}

export async function rejectAccessRequest(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.hospitalId) throw new HttpError(400, "Select a hospital first.");
    const membership = await accessRequestService.rejectRequest(req.userId!, req.hospitalId, req.params.id);
    res.status(200).json({ message: "Request rejected.", membership });
  } catch (err) {
    next(err);
  }
}

// User-scoped (see accessRequestService.cancelRequest) — deliberately no
// hospital-context requirement, matching createAccessRequest/
// listMyAccessRequests above.
export async function cancelAccessRequest(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const membership = await accessRequestService.cancelRequest(req.userId!, req.params.id);
    res.status(200).json({ message: "Request cancelled.", membership });
  } catch (err) {
    next(err);
  }
}
