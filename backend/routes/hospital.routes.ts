import { Router } from "express";
import * as hospitalController from "../controllers/hospital.controller";
import * as validate from "../validators/hospital.validator";
import { requireAuth, requirePortal } from "../middleware/auth.middleware";

const router = Router();

// Every route here requires a session authenticated through the Hospital Portal.
router.use(requireAuth, requirePortal("hospital"));

router.get("/memberships", hospitalController.getMemberships);
router.post("/select", validate.validateSelectHospital, hospitalController.selectHospital);

export default router;
