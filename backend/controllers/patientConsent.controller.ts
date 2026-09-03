import { Response, NextFunction } from "express";
import * as patientConsentService from "../domain/patientConsent.service";
import { AuthenticatedRequest } from "../middleware/auth.middleware";

// Patient Portal side (routes/patient.routes.ts) —

export async function lookupDoctor(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const doctor = await patientConsentService.lookupDoctorByEmail(req.query.email as string);
    res.status(200).json({ doctor });
  } catch (err) {
    next(err);
  }
}

export async function grantAccess(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { doctorEmail, dataCategories } = req.body as { doctorEmail: string; dataCategories: string[] };
    const grant = await patientConsentService.grantAccess(req.userId!, doctorEmail, dataCategories);
    res.status(201).json({ message: "Access granted.", grant });
  } catch (err) {
    next(err);
  }
}

export async function listMyGrants(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const grants = await patientConsentService.listMyGrants(req.userId!);
    res.status(200).json({ grants });
  } catch (err) {
    next(err);
  }
}

export async function updateGrant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { dataCategories } = req.body as { dataCategories: string[] };
    const grant = await patientConsentService.updateGrant(req.userId!, req.params.id, dataCategories);
    res.status(200).json({ message: "Grant updated.", grant });
  } catch (err) {
    next(err);
  }
}

// Shared by both portals — a grantId belonging to neither side of the acting
// user simply isn't found (query-scoped in the domain layer), so the same
// handler works whether it's mounted under /api/patient or /api/hospital.
export async function revokeGrant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const grant = await patientConsentService.revokeGrant(req.userId!, req.params.id);
    res.status(200).json({ message: "Access revoked.", grant });
  } catch (err) {
    next(err);
  }
}

// Hospital Portal side (routes/hospital.routes.ts, gated by requirePermission("patient.view")) —

export async function listGrantedToMe(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const patients = await patientConsentService.listGrantedToMe(req.userId!);
    res.status(200).json({ patients });
  } catch (err) {
    next(err);
  }
}
