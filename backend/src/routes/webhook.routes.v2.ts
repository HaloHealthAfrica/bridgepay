import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { webhookRateLimiter } from "../middleware/rateLimiter";
import mpesaService from "../services/mpesa.service";
import lemonadeService from "../services/lemonade.service";
import { AppError } from "../middleware/errorHandler";
import {
  verifyMpesaSource,
  verifyLemonadeSource,
  isTimestampValid,
} from "../services/webhookSecurity";

export const callbackRouter = Router();

/**
 * M-Pesa STK Push Callback
 *
 * Security:
 * - IP allowlist verification
 * - Rate limiting (100 requests/minute)
 * - Payload structure validation
 */
callbackRouter.post(
  "/mpesa",
  webhookRateLimiter,
  asyncHandler(async (req, res) => {
    // 1. Verify source IP
    if (!verifyMpesaSource(req)) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    // 2. Validate callback structure
    const body = req.body?.Body;
    const callback = body?.stkCallback;

    if (!callback || !callback.MerchantRequestID) {
      throw new AppError("Invalid M-Pesa callback structure", 400);
    }

    // 3. Process callback
    await mpesaService.handleCallback(req.body);
    res.json({ ok: true });
  })
);

/**
 * M-Pesa C2B (Paybill) Confirmation
 *
 * Security:
 * - IP allowlist verification
 * - Rate limiting (100 requests/minute)
 */
callbackRouter.post(
  "/mpesa/c2b/confirmation",
  webhookRateLimiter,
  asyncHandler(async (req, res) => {
    // 1. Verify source IP
    if (!verifyMpesaSource(req)) {
      return res.status(403).json({ error: { message: "Forbidden" } });
    }

    // 2. Process confirmation
    await mpesaService.handleC2BConfirmation(req.body);
    res.json({ ok: true });
  })
);

/**
 * Lemonade Card Payment Webhook
 *
 * Security (ENHANCED):
 * - IP allowlist verification (NEW)
 * - HMAC signature verification
 * - Timestamp validation (NEW)
 * - Rate limiting (100 requests/minute)
 *
 * Configuration:
 * - LEMONADE_ALLOWED_IPS: Comma-separated list of allowed IPs/CIDR ranges
 * - LEMONADE_WEBHOOK_SECRET: HMAC secret for signature verification
 */
callbackRouter.post(
  "/lemonade",
  webhookRateLimiter,
  asyncHandler(async (req, res) => {
    // 1. Verify source IP
    if (!verifyLemonadeSource(req)) {
      return res.status(403).json({
        error: {
          message: "Unauthorized source IP",
          code: "FORBIDDEN",
        },
      });
    }

    // 2. Verify HMAC signature (if configured)
    const signature = req.headers["x-lemonade-signature"] as string;
    const raw = (req as any).rawBody as Buffer | undefined;

    if (signature && process.env.LEMONADE_WEBHOOK_SECRET && raw) {
      const isValid = lemonadeService.verifyWebhook(
        raw.toString("utf8"),
        signature
      );

      if (!isValid) {
        console.warn("[Webhook] Lemonade signature verification failed");
        return res.status(401).json({
          error: {
            message: "Invalid signature",
            code: "INVALID_SIGNATURE",
          },
        });
      }
    }

    // 3. Verify timestamp (prevent replay attacks)
    const timestamp = req.body.timestamp || req.headers["x-timestamp"];

    if (!isTimestampValid(timestamp, 300)) {
      // 5 minute window
      console.warn(
        `[Webhook] Lemonade webhook rejected - invalid/expired timestamp: ${timestamp}`
      );
      return res.status(401).json({
        error: {
          message: "Invalid or expired timestamp",
          code: "INVALID_TIMESTAMP",
        },
      });
    }

    // 4. Process webhook
    await lemonadeService.handleCallback(req.body);
    res.json({ ok: true });
  })
);

export default callbackRouter;
