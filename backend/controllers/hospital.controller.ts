import { Response, NextFunction } from "express";
import * as hospitalService from "../domain/hospital.service";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { signAccessToken } from "../utils/jwt";
import { RefreshTokenModel } from "../models/refreshToken.model";
import { hashRefreshToken } from "../utils/refreshToken";

const HOSPITAL_REFRESH_COOKIE = "hospital_refresh_token";

export async function getMemberships(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const memberships = await hospitalService.listActiveMemberships(req.userId!);
    res.status(200).json({ memberships });
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

    // Remember the selection on the refresh-token record too, so it survives the
    // next silent /refresh (the access token alone only lasts 15 minutes).
    const incomingRefreshToken = req.cookies?.[HOSPITAL_REFRESH_COOKIE];
    if (incomingRefreshToken) {
      await RefreshTokenModel.updateOne(
        { tokenHash: hashRefreshToken(incomingRefreshToken), userId: req.userId, portal: "hospital" },
        { hospitalId: hospital.id }
      );
    }

    const accessToken = signAccessToken({ id: req.userId!, portal: "hospital", hospitalId: hospital.id });
    res.status(200).json({ accessToken, hospital });
  } catch (err) {
    next(err);
  }
}
