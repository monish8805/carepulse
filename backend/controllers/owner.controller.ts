import { Response, NextFunction } from "express";
import * as hospitalService from "../domain/hospital.service";
import { AuthenticatedRequest } from "../middleware/auth.middleware";

export async function listHospitals(_req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const hospitals = await hospitalService.listHospitals();
    res.status(200).json({ hospitals });
  } catch (err) {
    next(err);
  }
}

export async function createHospital(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { temporaryPassword: _temporaryPassword, ...result } = await hospitalService.createHospitalWithAdmin(
      req.body
    );
    // temporaryPassword deliberately never leaves the server — it was emailed
    // directly to the administrator.
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}
