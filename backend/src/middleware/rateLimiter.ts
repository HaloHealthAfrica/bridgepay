import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// Strict rate limiter for authentication endpoints
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: "Too many login attempts. Please try again in 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
  // Use IP + email for more granular limiting with IPv6 support
  keyGenerator: (req) => {
    const email = req.body?.email || "unknown";
    const ip = ipKeyGenerator(req);
    return `${ip}-${email}`;
  },
});

// Rate limiter for payment endpoints (prevent spam)
export const paymentRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 payment requests per minute
  message: "Too many payment requests. Please wait a moment.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as any).user?.userId || ipKeyGenerator(req);
    return `payment-${userId}`;
  },
});

// General API rate limiter
export const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: "Too many requests. Please slow down.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Webhook rate limiter (more lenient but still protected)
export const webhookRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 webhook calls per minute
  message: "Webhook rate limit exceeded.",
  standardHeaders: true,
  legacyHeaders: false,
});
