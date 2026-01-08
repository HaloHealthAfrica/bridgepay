import type { NextFunction, Request, Response } from "express";
import { createHash } from "crypto";
import { prisma } from "../lib/prisma";
import { AppError } from "./errorHandler";

// Endpoints requiring strict idempotency (money movement + payment initiation).
// NOTE: we compare against req.baseUrl + req.path (full mounted path).
const IDEMPOTENT_ENDPOINTS = new Set([
  "/api/wallet/deposit/mpesa",
  "/api/wallet/deposit/card",
  "/api/wallet/deposit/paybill",
  "/api/wallet/transfer",
  "/api/wallet/withdraw/mpesa",
  "/api/wallet/withdraw/bank",
  "/api/wallet/send/mpesa",
  "/api/merchant/qr/pay",
  "/api/merchant/card/pay",
  "/api/projects/:id/fund", // used as prefix match below
  "/api/projects/:id/fund/card", // used as prefix match below
]);

function isIdempotentEndpoint(req: Request) {
  const full = `${req.baseUrl}${req.path}`;
  if (IDEMPOTENT_ENDPOINTS.has(full)) return true;
  // prefix matches for param routes
  if (full.match(/^\/api\/projects\/[^/]+\/fund$/)) return true;
  if (full.match(/^\/api\/projects\/[^/]+\/fund\/card$/)) return true;
  return false;
}

function isUuidV4(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/**
 * DB-backed idempotency middleware (cross-instance safe).
 *
 * Contract:
 * - For idempotent payment endpoints, clients MUST send `Idempotency-Key: <uuidv4>`
 * - Same key reused returns cached response
 * - Same key with different payload is rejected (409)
 */
export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method.toUpperCase() === "GET") return next();
  if (!isIdempotentEndpoint(req)) return next();

  const idempotencyKey = String(req.headers["idempotency-key"] || "").trim();
  if (!idempotencyKey) throw new AppError("Idempotency-Key header is required for this operation", 400);
  if (!isUuidV4(idempotencyKey)) throw new AppError("Idempotency-Key must be a valid UUIDv4", 400);

  const userId = (req as any).user?.userId as string | undefined;
  if (!userId) throw new AppError("Unauthorized", 401);

  const endpoint = `${req.baseUrl}${req.path}`;
  const requestHash = createHash("sha256").update(JSON.stringify(req.body ?? {})).digest("hex");

  const now = new Date();

  try {
    const existing = await prisma.idempotencyKey.findUnique({ where: { id: idempotencyKey } });

    if (existing) {
      if (existing.expiresAt <= now) {
        // Expired key: delete and allow retry
        await prisma.idempotencyKey.delete({ where: { id: idempotencyKey } });
      } else {
        // Key still valid: enforce same user/endpoint/body
        if (existing.userId && existing.userId !== userId) {
          throw new AppError("Idempotency-Key already used", 409);
        }
        if (existing.endpoint !== endpoint) {
          throw new AppError("Idempotency-Key already used for a different endpoint", 409);
        }
        if (existing.requestHash !== requestHash) {
          throw new AppError("Idempotency-Key reuse with different request body", 409);
        }

        if (existing.response && typeof existing.statusCode === "number") {
          const cached = existing.response as unknown;
          const cachedObj =
            cached && typeof cached === "object" && !Array.isArray(cached)
              ? (cached as Record<string, unknown>)
              : { cachedResponse: cached };

          return res.status(existing.statusCode).json({
            ...cachedObj,
            _idempotent: true,
            _originalRequestTime: existing.createdAt,
          });
        }

        return res.status(409).json({
          error: { message: "Request is already being processed", code: "REQUEST_IN_PROGRESS" },
        });
      }
    }

    // Create idempotency record (in progress)
    await prisma.idempotencyKey.create({
      data: {
        id: idempotencyKey,
        userId,
        endpoint,
        requestHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Intercept response to cache it.
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      prisma.idempotencyKey
        .update({
          where: { id: idempotencyKey },
          data: { statusCode: res.statusCode, response: body },
        })
        .catch((err: unknown) => console.error("Failed to update idempotency record:", err));

      return originalJson(body);
    };

    return next();
  } catch (err: any) {
    // If another request raced and created the row first, re-read and follow the same logic.
    if (err?.code === "P2002") {
      const existing = await prisma.idempotencyKey.findUnique({ where: { id: idempotencyKey } });
      if (existing && existing.response && typeof existing.statusCode === "number") {
        return res.status(existing.statusCode).json(existing.response as any);
      }
      return res.status(409).json({
        error: { message: "Request is already being processed", code: "REQUEST_IN_PROGRESS" },
      });
    }
    throw err;
  }
}

export async function cleanupExpiredIdempotencyKeys() {
  const now = new Date();
  await prisma.idempotencyKey.deleteMany({ where: { expiresAt: { lt: now } } });
}
