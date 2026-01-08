/**
 * Detailed Health Check Endpoint
 * Checks all system dependencies (admin only)
 */

import { auth } from "@/auth";
import {
  errorResponse,
  successResponse,
  ErrorCodes,
  withErrorHandling,
} from "@/app/api/utils/errorHandler";
import sql from "@/app/api/utils/sql";

/**
 * GET /api/health/detailed
 * Detailed health check with dependency status (admin only)
 */
export const GET = withErrorHandling(async (request) => {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse(ErrorCodes.UNAUTHORIZED);
  }

  // Check if user is admin
  let role = session.user.role;
  if (!role) {
    const rows = await sql`SELECT role FROM auth_users WHERE id = ${session.user.id} LIMIT 1`;
    role = rows?.[0]?.role;
  }

  if (role !== 'admin') {
    return errorResponse(ErrorCodes.FORBIDDEN, {
      message: 'Admin access required',
    });
  }

  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "bridge-mvp-v3",
    checks: {},
  };

  // Check database
  try {
    const startTime = Date.now();
    await sql`SELECT 1`;
    const dbTime = Date.now() - startTime;
    health.checks.database = {
      status: "healthy",
      responseTime: `${dbTime}ms`,
      connected: true,
    };
  } catch (error) {
    health.status = "degraded";
    health.checks.database = {
      status: "unhealthy",
      error: error.message,
      connected: false,
    };
  }

  // Check Redis
  try {
    const { connection } = await import("@apps-lib/queue/redis.js");
    const startTime = Date.now();
    await connection.ping();
    const redisTime = Date.now() - startTime;
    health.checks.redis = {
      status: "healthy",
      responseTime: `${redisTime}ms`,
      connected: true,
    };
  } catch (error) {
    health.status = "degraded";
    health.checks.redis = {
      status: "unhealthy",
      error: error.message,
      connected: false,
    };
  }

  // Check queues
  try {
    const { getQueueStatus } = await import("@/app/api/utils/queue");
    const queueStatus = await getQueueStatus();
    health.checks.queues = {
      status: queueStatus.error ? "unhealthy" : "healthy",
      ...queueStatus,
    };
    if (queueStatus.error) {
      health.status = "degraded";
    }
  } catch (error) {
    health.status = "degraded";
    health.checks.queues = {
      status: "unhealthy",
      error: error.message,
    };
  }

  // Check circuit breakers
  try {
    const { getCircuitBreakerStatus } = await import("@/lib/resilience/circuitBreaker.js");
    const breakerStatus = getCircuitBreakerStatus();
    
    const allHealthy = Object.values(breakerStatus).every(
      (cb) => cb.state === 'CLOSED'
    );
    
    health.checks.circuit_breakers = {
      status: allHealthy ? "healthy" : "degraded",
      breakers: breakerStatus,
    };
    
    if (!allHealthy) {
      health.status = "degraded";
    }
  } catch (error) {
    health.status = "degraded";
    health.checks.circuit_breakers = {
      status: "unhealthy",
      error: error.message,
    };
  }

  // Check cache
  try {
    const { getStats } = await import("@apps-lib/cache/redis.js");
    const cacheStats = await getStats();
    health.checks.cache = {
      status: "healthy",
      ...cacheStats,
    };
  } catch (error) {
    health.status = "degraded";
    health.checks.cache = {
      status: "unhealthy",
      error: error.message,
    };
  }

  // Determine overall status
  const allHealthy = Object.values(health.checks).every(
    (check) => check.status === "healthy"
  );

  if (!allHealthy) {
    health.status = "degraded";
  }

  const statusCode = health.status === "healthy" ? 200 : 503;

  return successResponse(health, statusCode);
});

