import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import * as adminController from "../controllers/admin.controller";
import * as feesController from "../controllers/fees.controller";
import { validate, feeSchemas } from "../middleware/validation";

export const adminRouter = Router();

// Admin routes are authenticated, and then gated per-endpoint.
// This enables limited admin-like consoles (e.g. KYC_VERIFIER) without granting full admin access.
adminRouter.use(requireAuth);

adminRouter.get("/stats", requireRole(["ADMIN"]), asyncHandler(adminController.getStats));
adminRouter.get("/users", requireRole(["ADMIN"]), asyncHandler(adminController.listUsers));
adminRouter.patch("/users/:id/status", requireRole(["ADMIN"]), asyncHandler(adminController.updateUserStatus));
adminRouter.patch("/users/:id/role", requireRole(["ADMIN"]), asyncHandler(adminController.updateUserRole));

adminRouter.get("/transactions", requireRole(["ADMIN"]), asyncHandler(adminController.listTransactions));
adminRouter.get("/wallets", requireRole(["ADMIN"]), asyncHandler(adminController.listWallets));

// Allow KYC verifiers to list/review KYC without full admin privileges.
adminRouter.get("/kyc", requireRole(["ADMIN", "KYC_VERIFIER"]), asyncHandler(adminController.listKycSubmissions));
adminRouter.post("/kyc/:userId/review", requireRole(["ADMIN", "KYC_VERIFIER"]), asyncHandler(adminController.reviewKyc));

adminRouter.get("/disputes", requireRole(["ADMIN"]), asyncHandler(adminController.listDisputes));

// Fees / Billing (PSP)
adminRouter.get("/fees/schedules", requireRole(["ADMIN"]), asyncHandler(feesController.listFeeSchedules));
adminRouter.post(
  "/fees/schedules",
  requireRole(["ADMIN"]),
  validate(feeSchemas.createSchedule),
  asyncHandler(feesController.createFeeSchedule)
);
adminRouter.patch(
  "/fees/schedules/:id",
  requireRole(["ADMIN"]),
  validate(feeSchemas.updateSchedule),
  asyncHandler(feesController.updateFeeSchedule)
);

adminRouter.get("/fees/platform-accounts", requireRole(["ADMIN"]), asyncHandler(feesController.getPlatformAccounts));
adminRouter.get("/fees/ledger", requireRole(["ADMIN"]), asyncHandler(feesController.listPlatformLedger));
adminRouter.post(
  "/fees/revenue/settle",
  requireRole(["ADMIN"]),
  validate(feeSchemas.settleRevenue),
  asyncHandler(feesController.settleFeeRevenue)
);




