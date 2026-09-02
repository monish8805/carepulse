import { Response, NextFunction } from "express";
import * as hospitalService from "../domain/hospital.service";
import * as authService from "../domain/auth.service";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { signAccessToken } from "../utils/jwt";

const HOSPITAL_REFRESH_COOKIE = "hospital_refresh_token";

export async function getMemberships(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const memberships = await hospitalService.listActiveMemberships(req.userId!);
    res.status(200).json({ memberships });
  } catch (err) {
    next(err);
  }
}

// Lets any authenticated Hospital Portal session browse hospitals to request
// access to — this is the directory a first-time (or additional-hospital)
// requester needs; it's the same listing the Owner Portal uses, just reused
// here for a different, non-admin purpose. Names/ids only, nothing sensitive.
export async function getAllHospitals(_req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const hospitals = await hospitalService.listHospitals();
    res.status(200).json({ hospitals });
  } catch (err) {
    next(err);
  }
}

// Switches the current session's hospital context. The hospitalId comes from the
// client, but it is never trusted: verifyActiveMembership re-checks it against the
// database before anything is issued.
export async function selectHospital(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { hospitalId } = req.body as { hospitalId: string };
    const hospital = await hospitalService.verifyActiveMembership(req.userId!, hospitalId);

    // Remember the selection on the refresh-token entry too, so it survives the
    // next silent /refresh (the access token alone only lasts 15 minutes).
    const incomingRefreshToken = req.cookies?.[HOSPITAL_REFRESH_COOKIE];
    await authService.rememberSelectedHospital(req.userId!, incomingRefreshToken, hospital.id);

    const accessToken = signAccessToken({ id: req.userId!, portal: "hospital", hospitalId: hospital.id });
    res.status(200).json({ accessToken, hospital });
  } catch (err) {
    next(err);
  }
}
