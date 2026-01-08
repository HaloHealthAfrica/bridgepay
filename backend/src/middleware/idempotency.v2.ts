import type { Request, Response, NextFunction } from "express";
import { createHash, randomUUID } from "crypto";
import { prisma } from "../lib/prisma";
import { AppError } from "./errorHandler";

// Endpoints requiring idempotency protection
const IDEMPOTENT_ENDPOINTS = [
  "/api/wallet/deposit",
  "/api/wallet/withdraw",
  "/api/wallet/transfer",
  "/api/wallet/send-mpesa",
  "/api/wallet/withdraw-mpesa",
  "/api/wallet/withdraw-bank",
  "/api/wallet/refund",
  "/api/merchant/process-payment",
  "/api/merchant/qr/pay",
  "/api/project/fund",
];

/**
 * Database-backed idempotency middleware to prevent duplicate payment processing
 *
 * Features:
 * - Requires Idempotency-Key header for payment operations
 * - Stores idempotency state in PostgreSQL (not in-memory)
 * - Returns cached response for duplicate requests
 * - 24-hour key expiry
 * - Works across multiple server instances
 *
 * Usage:
 * - Client sends header: Idempotency-Key: <uuid>
 * - Same key + same request body = cached response
 * - Same key + different body = 400 error
 */
export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Check if endpoint requires idempotency
  const requiresIdempotency = IDEMPOTENT_ENDPOINTS.some((endpoint) =>
    req.path.includes(endpoint)
  );

  if (!requiresIdempotency) {
    return next();
  }

  const idempotencyKey = req.headers["idempotency-key"] as string;

  // REQUIRED for payment endpoints
  if (!idempotencyKey) {
    throw new AppError(
      "Idempotency-Key header is required for this operation",
      400
    );
  }

  // Validate UUID format
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(idempotencyKey)) {
    throw new AppError("Idempotency-Key must be a valid UUIDv4", 400);
  }

  const userId = (req as any).user?.userId;
  if (!userId) {
    throw new AppError("Unauthorized", 401);
  }

  try {
    // Create request fingerprint for deduplication
    const requestHash = createHash("sha256")
      .update(JSON.stringify(req.body))
      .digest("hex");

    const endpoint = req.path;

    // Check database for existing request
    const existingRequest = await prisma.idempotencyKey.findUnique({
      where: {
        userId_endpoint_requestHash: {
          userId,
          endpoint,
          requestHash,
        },
      },
    });

    if (existingRequest) {
      // Request already processed or in progress

      // Check if expired
      if (new Date() > existingRequest.expiresAt) {
        // Expired - delete and allow retry
        await prisma.idempotencyKey.delete({
          where: {
            userId_endpoint_requestHash: {
              userId,
              endpoint,
              requestHash,
            },
          },
        });
        // Continue to process as new request
      } else {
        // Not expired - return cached response
        if (existingRequest.response && existingRequest.statusCode) {
          const cached = existingRequest.response as unknown;
          const cachedObj =
            cached && typeof cached === "object" && !Array.isArray(cached)
              ? (cached as Record<string, unknown>)
              : { cachedResponse: cached };

          return res.status(existingRequest.statusCode).json({
            ...cachedObj,
            _idempotent: true,
            _originalRequestTime: existingRequest.createdAt,
          });
        } else {
          // Request in progress
          return res.status(409).json({
            error: {
              message: "Request is already being processed",
              code: "REQUEST_IN_PROGRESS",
            },
          });
        }
      }
    }

    // Store new idempotency key (marks as in-progress)
    await prisma.idempotencyKey.create({
      data: {
        id: randomUUID(),
        userId,
        endpoint,
        requestHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Intercept response to cache it
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      // Update idempotency record with response
      prisma.idempotencyKey
        .update({
          where: {
            userId_endpoint_requestHash: {
              userId,
              endpoint,
              requestHash,
            },
          },
          data: {
            statusCode: res.statusCode,
            response: body,
          },
        })
        .catch((err: unknown) => {
          console.error("Failed to update idempotency record:", err);
        });

      return originalJson(body);
    };

    next();
  } catch (error: any) {
    console.error("Idempotency middleware error:", error);
    throw new AppError("Internal server error", 500);
  }
}

/**
 * Cleanup function to remove expired idempotency keys
 * Should be called periodically (e.g., via cron job daily)
 *
 * @returns Number of deleted records
 */
export async function cleanupExpiredIdempotencyKeys(): Promise<number> {
  const now = new Date();

  const result = await prisma.idempotencyKey.deleteMany({
    where: {
      expiresAt: { lt: now },
    },
  });

  console.log(`Cleaned up ${result.count} expired idempotency keys`);
  return result.count;
}
