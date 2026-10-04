import { Response, NextFunction } from "express";
import * as alertService from "../domain/alert.service";
import { AuthenticatedRequest } from "../middleware/auth.middleware";

export async function listAlerts(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const alerts = await alertService.listAlerts(req.userId!);
    res.status(200).json({ alerts });
  } catch (err) {
    next(err);
  }
}

export async function acknowledgeAlert(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const alert = await alertService.acknowledgeAlert(req.userId!, req.params.id);
    res.status(200).json({ message: "Alert acknowledged.", alert });
  } catch (err) {
    next(err);
  }
}
