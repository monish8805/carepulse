import { Response, NextFunction } from "express";
import * as vitalsService from "../domain/vitals.service";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { VITALS, Vital } from "../config/vitals";

// Patient Portal side (routes/patient.routes.ts) —

export async function recordVitals(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const values = Object.fromEntries(VITALS.map((vital) => [vital, req.body[vital] ?? null])) as Record<
      Vital,
      number | null
    >;
    const result = await vitalsService.recordVitals(req.userId!, {
      recordedAt: new Date(req.body.recordedAt),
      ...values,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listMyVitals(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await vitalsService.listMyVitals(req.userId!));
  } catch (err) {
    next(err);
  }
}

// Hospital Portal side (routes/hospital.routes.ts) —

export async function listPatientVitals(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await vitalsService.listPatientVitals(req.userId!, req.params.id));
  } catch (err) {
    next(err);
  }
}
