import { Response, NextFunction } from "express";
import * as authService from "../domain/auth.service";
import { AuthenticatedRequest } from "../middleware/auth.middleware";

// The patient's own date of birth, gender and blood type — required by the
// Patient Portal on first login, editable afterwards — plus an optional
// guardian phone.
export async function updateProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const user = await authService.updatePatientProfile(req.userId!, {
      dateOfBirth: new Date(req.body.dateOfBirth),
      gender: req.body.gender,
      bloodType: req.body.bloodType,
      guardianPhone: req.body.guardianPhone ?? null,
    });
    res.status(200).json({ message: "Profile updated.", user });
  } catch (err) {
    next(err);
  }
}
