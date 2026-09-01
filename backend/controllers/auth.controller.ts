import { Request, Response, NextFunction } from "express";
import * as authService from "../domain/auth.service";
import * as hospitalService from "../domain/hospital.service";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { REFRESH_TOKEN_MAX_AGE_MS } from "../utils/refreshToken";
import { IS_PRODUCTION } from "../config/env";
import { Role } from "../models/user.model";

function refreshCookieName(portal: Role): string {
  return `${portal}_refresh_token`;
}

// Scoped to /api (not just /api/auth) so it also reaches /api/hospital/select.
// Each portal gets its own cookie NAME: cookies aren't scoped by port, so if all
// three portals shared one cookie name, logging into one in a second tab would
// silently overwrite another portal's session in the same browser.
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: IS_PRODUCTION,
  path: "/api",
  maxAge: REFRESH_TOKEN_MAX_AGE_MS,
};

function setRefreshCookie(res: Response, portal: Role, refreshToken: string) {
  res.cookie(refreshCookieName(portal), refreshToken, REFRESH_COOKIE_OPTIONS);
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.registerUser(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function verifyOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.verifyOtp(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { accessToken, refreshToken, user } = await authService.login(req.body);
    setRefreshCookie(res, req.body.role, refreshToken);
    res.status(200).json({ message: "Logged in.", user, accessToken });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const portal: Role = req.body.portal;
    const incomingToken = req.cookies?.[refreshCookieName(portal)];
    const { accessToken, refreshToken, user } = await authService.refreshSession(incomingToken, portal);
    setRefreshCookie(res, portal, refreshToken);
    res.status(200).json({ accessToken, user });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const portal: Role = req.body.portal;
    const incomingToken = req.cookies?.[refreshCookieName(portal)];
    await authService.logout(incomingToken);
    res.clearCookie(refreshCookieName(portal), { path: "/api" });
    res.status(200).json({ message: "Logged out." });
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.forgotPassword(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.resetPassword(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// The response shape is scoped to whichever portal the session was authenticated
// through — never includes info belonging to another portal context.
export async function me(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const user = await authService.getUserById(req.userId!);
    const base = { ...user, portal: req.portal };

    if (req.portal === "hospital") {
      const hospital = await hospitalService.getCurrentHospitalContext(req.userId!, req.hospitalId);
      res.status(200).json({ user: { ...base, hospital } });
      return;
    }

    res.status(200).json({ user: base });
  } catch (err) {
    next(err);
  }
}
