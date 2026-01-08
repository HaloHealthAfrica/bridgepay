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
import { 
  validateUserId 
} from "@/app/api/utils/validators";

export async function POST(request) {
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
        endpoint: '/api/wallet/sources/seed',
        threatLevel: THREAT_LEVELS.HIGH,
        metadata: { reason: 'missing_authentication' }
      });
      return Response.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }
    const userId = session.user.id;

    // Validate user ID
    const userIdValidation = validateUserId(userId);
    if (!userIdValidation.valid) {
      await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
        userId,
        ip,
        userAgent,
        endpoint: '/api/wallet/sources/seed',
        threatLevel: THREAT_LEVELS.HIGH,
        metadata: { reason: 'invalid_user_id', error: userIdValidation.error }
      });
      return Response.json(
        { ok: false, error: "invalid_user_id" },
        { status: 400 },
      );
    }

    // Rate limiting for wallet sources seeding
    const rateLimitKey = generateUserKey(userId, 'wallet_sources_seed');
    const rateLimit = await rateLimitMiddleware(RATE_LIMITS.API_GENERAL)(request, { userId });
    
    if (rateLimit.blocked) {
      await logSecurityEvent(SECURITY_EVENTS.RATE_LIMIT_EXCEEDED, {
        userId,
        ip,
        userAgent,
        endpoint: '/api/wallet/sources/seed',
        threatLevel: THREAT_LEVELS.MEDIUM,
        metadata: { rateLimitKey }
      });
      return rateLimit.response;
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      await logSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_LOGIN, {
        userId,
        ip,
        userAgent,
        endpoint: '/api/wallet/sources/seed',
        threatLevel: THREAT_LEVELS.MEDIUM,
        metadata: { reason: 'malformed_json' }
      });
    }

    // Defaults if not provided
    const defaults = {
      bridge: 20000,
      kcb: 50000,
      dtb: 35000,
      mpesa: 10000,
    };
    const provided = body?.balances || {};
    const payload = {
      bridge: Number(provided.bridge ?? defaults.bridge),
      kcb: Number(provided.kcb ?? defaults.kcb),
      dtb: Number(provided.dtb ?? defaults.dtb),
      mpesa: Number(provided.mpesa ?? defaults.mpesa),
    };

    // Upsert each source for the user
    const sources = ["bridge", "kcb", "dtb", "mpesa"];
    for (const s of sources) {
      const bal = payload[s];
      await sql(
        `INSERT INTO wallet_sources (user_id, source, currency, balance, hold, status, metadata)
         VALUES ($1, $2, $3, $4, 0, 'active', '{}'::jsonb)
         ON CONFLICT (user_id, source, currency)
         DO UPDATE SET balance = EXCLUDED.balance, updated_at = now()`,
        [userId, s, "KES", bal],
      );
    }

    const rows =
      await sql`SELECT source, currency, balance, hold, status FROM wallet_sources WHERE user_id = ${userId} ORDER BY source`;
    
    // Log successful wallet sources seeding
    await logSecurityEvent(SECURITY_EVENTS.SENSITIVE_DATA_ACCESS, {
      userId,
      ip,
      userAgent,
      endpoint: '/api/wallet/sources/seed',
      threatLevel: THREAT_LEVELS.LOW,
      metadata: { 
        operation: 'wallet_sources_seed',
        sources_count: rows.length,
        balances: payload
      }
    });

    return Response.json({ ok: true, sources: rows }, { status: 200 });
  } catch (e) {
    await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
      userId: session?.user?.id,
      ip,
      userAgent,
      endpoint: '/api/wallet/sources/seed',
      threatLevel: THREAT_LEVELS.HIGH,
      metadata: { 
        error: e.message,
        reason: 'server_error'
      }
    });

    console.error("/api/wallet/sources/seed POST error", e);
    return Response.json(
      { ok: false, error: e?.message || "server_error" },
      { status: 500 },
    );
  }
}
