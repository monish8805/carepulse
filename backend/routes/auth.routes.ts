import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import * as validate from "../validators/auth.validator";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/register", validate.validateRegister, authController.register);
router.post("/verify-otp", validate.validateVerifyOtp, authController.verifyOtp);
router.post("/login", validate.validateLogin, authController.login);
router.post("/refresh", validate.validatePortal, authController.refresh);
router.post("/logout", validate.validatePortal, authController.logout);
router.post("/forgot-password", validate.validateForgotPassword, authController.forgotPassword);
router.post("/reset-password", validate.validateResetPassword, authController.resetPassword);
router.get("/me", requireAuth, authController.me);

export default router;
