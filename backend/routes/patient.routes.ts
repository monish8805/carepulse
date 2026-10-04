import { Router } from "express";
import * as patientConsentController from "../controllers/patientConsent.controller";
import * as vitalsController from "../controllers/vitals.controller";
import * as patientController from "../controllers/patient.controller";
import * as validate from "../validators/patientConsent.validator";
import * as validateVitals from "../validators/vitals.validator";
import * as validatePatient from "../validators/patient.validator";
import { requireAuth, requirePortal } from "../middleware/auth.middleware";

const router = Router();

// Every route here requires a session authenticated through the Patient Portal.
// This is the Patient Portal's first real API surface beyond shared auth —
// the data-sharing consent gateway (see domain/patientConsent.service.ts).
router.use(requireAuth, requirePortal("patient"));

// The patient's own date of birth, gender, blood type (the Patient Portal
// requires all three on first login) and optional guardian phone. Shown to
// doctors only through the consent-gated reads.
router.patch("/profile", validatePatient.validateUpdatePatientProfile, patientController.updateProfile);

router.get("/doctors", validate.validateDoctorLookup, patientConsentController.lookupDoctor);

router.post("/consents", validate.validateGrantAccess, patientConsentController.grantAccess);
router.get("/consents", patientConsentController.listMyGrants);
router.patch("/consents/:id", validate.validateUpdateGrant, patientConsentController.updateGrant);
router.post("/consents/:id/revoke", patientConsentController.revokeGrant);

// The patient's own vitals. Recording one also scores the patient's history
// with the sepsis model (domain/inference.service.ts); the patient sees their
// own readings and scores without any consent check — consent governs who
// else sees them.
router.post("/vitals", validateVitals.validateRecordVitals, vitalsController.recordVitals);
router.get("/vitals", vitalsController.listMyVitals);

export default router;
