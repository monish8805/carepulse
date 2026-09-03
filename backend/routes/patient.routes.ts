import { Router } from "express";
import * as patientConsentController from "../controllers/patientConsent.controller";
import * as validate from "../validators/patientConsent.validator";
import { requireAuth, requirePortal } from "../middleware/auth.middleware";

const router = Router();

// Every route here requires a session authenticated through the Patient Portal.
// This is the Patient Portal's first real API surface beyond shared auth —
// the data-sharing consent gateway (see domain/patientConsent.service.ts).
router.use(requireAuth, requirePortal("patient"));

router.get("/doctors", validate.validateDoctorLookup, patientConsentController.lookupDoctor);

router.post("/consents", validate.validateGrantAccess, patientConsentController.grantAccess);
router.get("/consents", patientConsentController.listMyGrants);
router.patch("/consents/:id", validate.validateUpdateGrant, patientConsentController.updateGrant);
router.post("/consents/:id/revoke", patientConsentController.revokeGrant);

export default router;
