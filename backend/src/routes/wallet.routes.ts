import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import * as walletController from "../controllers/wallet.controller";
import { validate, walletSchemas } from "../middleware/validation";
import { paymentRateLimiter } from "../middleware/rateLimiter";
import { idempotencyMiddleware } from "../middleware/idempotency";

export const walletRouter = Router();

walletRouter.get("/balance", requireAuth, asyncHandler(walletController.getBalance));
walletRouter.get("/transactions", requireAuth, asyncHandler(walletController.getTransactions));
walletRouter.post(
  "/deposit/mpesa",
  requireAuth,
  paymentRateLimiter,
  idempotencyMiddleware,
  validate(walletSchemas.depositMpesa),
  asyncHandler(walletController.depositMpesa)
);
walletRouter.post(
  "/deposit/card",
  requireAuth,
  paymentRateLimiter,
  idempotencyMiddleware,
  validate(walletSchemas.depositCard),
  asyncHandler(walletController.depositCard)
);
walletRouter.get(
  "/card/status/:providerTransactionId",
  requireAuth,
  asyncHandler(walletController.checkCardPaymentStatus)
);
walletRouter.post(
  "/transfer",
  requireAuth,
  paymentRateLimiter,
  idempotencyMiddleware,
  validate(walletSchemas.transfer),
  asyncHandler(walletController.transfer)
);
walletRouter.post(
  "/withdraw/mpesa",
  requireAuth,
  paymentRateLimiter,
  idempotencyMiddleware,
  validate(walletSchemas.withdraw),
  asyncHandler(walletController.withdrawMpesa)
);
walletRouter.post(
  "/withdraw/bank",
  requireAuth,
  paymentRateLimiter,
  idempotencyMiddleware,
  validate(walletSchemas.withdrawBank),
  asyncHandler(walletController.withdrawBank)
);
walletRouter.post(
  "/send/mpesa",
  requireAuth,
  paymentRateLimiter,
  idempotencyMiddleware,
  validate(walletSchemas.sendMpesa),
  asyncHandler(walletController.sendMpesa)
);
walletRouter.post(
  "/deposit/paybill",
  requireAuth,
  paymentRateLimiter,
  idempotencyMiddleware,
  validate(walletSchemas.depositPaybill),
  asyncHandler(walletController.depositPaybill)
);
walletRouter.get("/mpesa/status/:checkoutRequestID", requireAuth, asyncHandler(walletController.checkPaymentStatus));
walletRouter.post("/transactions/:transactionId/receipt", requireAuth, asyncHandler(walletController.createReceipt));
