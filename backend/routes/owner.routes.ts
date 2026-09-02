import { Router } from "express";
import * as ownerController from "../controllers/owner.controller";
import * as validate from "../validators/owner.validator";
import { requireAuth, requirePortal } from "../middleware/auth.middleware";

const router = Router();

// Every route here requires a session authenticated through the Owner Portal.
// Note: this never grants the Owner any hospital-scoped access — that still
// requires a separate "hospital" portal session with a real membership (see
// hospital.routes.ts), which provisioning here deliberately does not create for the Owner.
router.use(requireAuth, requirePortal("owner"));

router.get("/hospitals", ownerController.listHospitals);
router.post("/hospitals", validate.validateCreateHospital, ownerController.createHospital);
router.post("/hospitals/:id/disable", ownerController.disableHospital);
router.post("/hospitals/:id/enable", ownerController.enableHospital);
router.delete("/hospitals/:id", ownerController.deleteHospital);

export default router;
