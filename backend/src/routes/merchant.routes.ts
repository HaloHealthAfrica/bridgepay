import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import * as merchantController from "../controllers/merchant.controller";
import { validate, merchantSchemas } from "../middleware/validation";
import { paymentRateLimiter } from "../middleware/rateLimiter";
import { idempotencyMiddleware } from "../middleware/idempotency";

export const merchantRouter = Router();

merchantRouter.get("/me", requireAuth, asyncHandler(merchantController.getMerchantMe));
merchantRouter.post("/qr", requireAuth, asyncHandler(merchantController.generateQRCode));
merchantRouter.post(
  "/qr/pay",
  requireAuth,
  paymentRateLimiter,
  idempotencyMiddleware,
  validate(merchantSchemas.processQRPayment),
  asyncHandler(merchantController.processQRPayment)
);
merchantRouter.post(
  "/card/pay",
  requireAuth,
  paymentRateLimiter,
  idempotencyMiddleware,
  validate(merchantSchemas.initiateCardPayment),
  asyncHandler(merchantController.initiateCardPaymentToMerchant)
);
merchantRouter.get(
  "/card/status/:providerTransactionId",
  requireAuth,
  asyncHandler(merchantController.checkCardPaymentStatus)
);
merchantRouter.get("/sales", requireAuth, asyncHandler(merchantController.getSalesStats));
merchantRouter.get("/:merchantId/public", requireAuth, asyncHandler(merchantController.getMerchantPublic));
