import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import mpesaService from "../services/mpesa.service";
import lemonadeService from "../services/lemonade.service";
import { AppError } from "../middleware/errorHandler";
import { webhookRateLimiter } from "../middleware/rateLimiter";

export const callbackRouter = Router();

// M-Pesa webhook IP allowlist (Safaricom production IPs)
// Source: https://developer.safaricom.co.ke/Documentation
const MPESA_ALLOWED_IPS = [
  "196.201.214.200",
  "196.201.214.206",
  "196.201.213.114",
  "196.201.214.207",
  "196.201.214.208",
  "196.201.213.44",
  "196.201.212.127",
  "196.201.212.128",
  "196.201.212.129",
  "196.201.212.130",
  "196.201.212.131",
  "196.201.212.132",
  // Sandbox IPs
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
];

/**
 * Middleware to verify M-Pesa callback source
 */
function verifyMpesaSource(req: any, res: any, next: any) {
  // Skip IP check in development or if disabled
  if (process.env.MPESA_SKIP_IP_CHECK === "true") {
    return next();
  }

  const clientIp = req.ip || req.connection.remoteAddress;
  const forwardedFor = req.headers["x-forwarded-for"];
  const sourceIp = forwardedFor ? forwardedFor.split(",")[0].trim() : clientIp;

  // Check if IP is allowed
  const isAllowed = MPESA_ALLOWED_IPS.some((allowedIp) => {
    return sourceIp?.includes(allowedIp);
  });

  if (!isAllowed) {
    console.warn(`[SECURITY] M-Pesa callback from unauthorized IP: ${sourceIp}`);
    return res.status(403).json({ error: { message: "Forbidden" } });
  }

  next();
}

callbackRouter.post(
  "/mpesa",
  webhookRateLimiter,
  verifyMpesaSource,
  asyncHandler(async (req, res) => {
    // Validate callback structure
    const body = req.body?.Body;
    const callback = body?.stkCallback;

    if (!callback || !callback.MerchantRequestID) {
      throw new AppError("Invalid M-Pesa callback structure", 400);
    }

    await mpesaService.handleCallback(req.body);
    res.json({ ok: true });
  })
);

// M-Pesa C2B (Paybill) confirmation endpoint
callbackRouter.post(
  "/mpesa/c2b/confirmation",
  webhookRateLimiter,
  verifyMpesaSource,
  asyncHandler(async (req, res) => {
    await mpesaService.handleC2BConfirmation(req.body);
    // Safaricom expects these keys for C2B confirmation ACK.
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  })
);

// M-Pesa B2C Result URL (withdrawals / send money)
callbackRouter.post(
  "/mpesa/b2c",
  webhookRateLimiter,
  verifyMpesaSource,
  asyncHandler(async (req, res) => {
    await mpesaService.handleB2CResult(req.body);
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  })
);

// M-Pesa B2C Timeout URL
callbackRouter.post(
  "/mpesa/timeout",
  webhookRateLimiter,
  verifyMpesaSource,
  asyncHandler(async (req, res) => {
    await mpesaService.handleB2CTimeout(req.body);
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  })
);

callbackRouter.post(
  "/lemonade",
  webhookRateLimiter,
  asyncHandler(async (req, res) => {
    // Lemonade OpenAPI uses bearer auth for API calls and allows \`result_url\` callbacks for transaction status.
    // If a signature is provided + secret configured, verify it against the captured raw body.
    const signature = (req.headers["x-lemonade-signature"] as string) || "";
    const raw = (req as any).rawBody as Buffer | undefined;
    if (signature && process.env.LEMONADE_WEBHOOK_SECRET && raw) {
      const ok = lemonadeService.verifyWebhook(raw.toString("utf8"), signature);
      if (!ok) return res.status(401).json({ ok: false });
    }

    await lemonadeService.handleCallback(req.body);
    res.json({ ok: true });
  })
);
