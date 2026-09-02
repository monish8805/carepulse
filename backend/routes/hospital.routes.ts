import { Router } from "express";
import * as hospitalController from "../controllers/hospital.controller";
import * as accessRoleController from "../controllers/accessRole.controller";
import * as accessRequestController from "../controllers/accessRequest.controller";
import * as staffController from "../controllers/staff.controller";
import * as validate from "../validators/hospital.validator";
import * as validateAccessRole from "../validators/accessRole.validator";
import * as validateAccessRequest from "../validators/accessRequest.validator";
import * as validateStaff from "../validators/staff.validator";
import { requireAuth, requirePortal } from "../middleware/auth.middleware";

const router = Router();

// Every route here requires a session authenticated through the Hospital Portal.
router.use(requireAuth, requirePortal("hospital"));

router.get("/memberships", hospitalController.getMemberships);
router.post("/select", validate.validateSelectHospital, hospitalController.selectHospital);
router.get("/hospitals", hospitalController.getAllHospitals);

// Access-role management is gated by the existing coarse "admin" membership
// role (see domain/accessRole.service.ts), not by a dynamic permission — an
// administrator manages roles by virtue of being the admin, not by holding one.
router.get("/access-roles", accessRoleController.listAccessRoles);
router.post("/access-roles", validateAccessRole.validateCreateAccessRole, accessRoleController.createAccessRole);
router.patch(
  "/access-roles/:id",
  validateAccessRole.validateUpdateAccessRole,
  accessRoleController.updateAccessRole
);
router.delete("/access-roles/:id", accessRoleController.deleteAccessRole);

// Staff management: listing/removing already-ACTIVE (or disabled) staff,
// distinct from the pending-request review below. Admin-gated the same way as
// access-roles, OR a staff member whose current AccessRole includes
// staff.manage — see domain/staff.service.ts for the peer-protection rule
// that applies to remove/disable. Reassigning a staff member's role
// (PATCH .../role) is admin-only, same family as access-role management below.
router.get("/staff", staffController.listStaff);
router.post("/staff", validateStaff.validateAddStaff, staffController.addStaff);
router.delete("/staff/:id", staffController.removeStaffMember);
router.patch("/staff/:id/role", validateStaff.validateUpdateStaffRole, staffController.updateStaffRole);
router.post("/staff/:id/disable", staffController.disableStaff);
router.post("/staff/:id/enable", staffController.enableStaff);

// Staff access-request lifecycle. Creating a request and checking your own
// requests need no hospital context (a first-time requester has none yet);
// reviewing requests is scoped to the admin's current hospital context, same
// pattern as access-roles above.
router.post(
  "/access-requests",
  validateAccessRequest.validateCreateAccessRequest,
  accessRequestController.createAccessRequest
);
router.get("/access-requests/mine", accessRequestController.listMyAccessRequests);
router.get("/access-requests", accessRequestController.listPendingAccessRequests);
router.post("/access-requests/:id/approve", validateAccessRequest.validateApproveRequest, accessRequestController.approveAccessRequest);
router.post("/access-requests/:id/reject", accessRequestController.rejectAccessRequest);
// User-scoped, not hospital-scoped — same as create/list-mine above (see
// accessRequestService.cancelRequest).
router.post("/access-requests/:id/cancel", accessRequestController.cancelAccessRequest);

export default router;
