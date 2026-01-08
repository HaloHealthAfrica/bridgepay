import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { 
  logSecurityEvent, 
  SECURITY_EVENTS, 
  THREAT_LEVELS 
} from "@/app/api/utils/securityMonitor";
import { 
  rateLimitMiddleware, 
  RATE_LIMITS, 
  generateUserKey 
} from "@/app/api/utils/rateLimiter";
import { validateUserId } from "@/app/api/utils/validators";

export async function GET(request) {
  const ip = request.headers.get('x-forwarded-for') || 
            request.headers.get('x-real-ip') || 
            'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  try {
    const session = await auth();
    if (!session?.user?.id) {
      await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
        ip,
        userAgent,
        endpoint: '/api/wallet/sources',
        threatLevel: THREAT_LEVELS.MEDIUM,
        metadata: { reason: 'missing_authentication' }
      });

      return Response.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }

    // Validate user ID
    const userIdValidation = validateUserId(session.user.id);
    if (!userIdValidation.valid) {
      await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
        userId: session.user.id,
        ip,
        userAgent,
        endpoint: '/api/wallet/sources',
        threatLevel: THREAT_LEVELS.HIGH,
        metadata: { reason: 'invalid_user_id', error: userIdValidation.error }
      });

      return Response.json(
        { ok: false, error: "invalid_user_id" },
        { status: 400 },
      );
    }

    // Rate limiting
    const rateLimitKey = generateUserKey(session.user.id, 'wallet_sources');
    const rateLimit = await rateLimitMiddleware(RATE_LIMITS.API_GENERAL)(request, { userId: session.user.id });
    
    if (rateLimit.blocked) {
      return rateLimit.response;
    }

    // Log sensitive data access
    await logSecurityEvent(SECURITY_EVENTS.SENSITIVE_DATA_ACCESS, {
      userId: session.user.id,
      ip,
      userAgent,
      endpoint: '/api/wallet/sources',
      threatLevel: THREAT_LEVELS.LOW,
      metadata: { operation: 'list_wallet_sources' }
    });

    const userId = session.user.id;
    const rows =
      await sql`SELECT id, source, currency, balance, hold, status, metadata, created_at, updated_at FROM wallet_sources WHERE user_id = ${userId} ORDER BY source`;
    
    return Response.json(
      { ok: true, sources: rows }, 
      { 
        status: 200,
        headers: rateLimit.headers
      }
    );
  } catch (e) {
    await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
      ip,
      userAgent,
      endpoint: '/api/wallet/sources',
      threatLevel: THREAT_LEVELS.HIGH,
      metadata: { 
        error: e.message,
        reason: 'server_error'
      }
    });

    console.error("/api/wallet/sources GET error", e);
    return Response.json(
      { ok: false, error: e?.message || "server_error" },
      { status: 500 },
    );
  }
}
