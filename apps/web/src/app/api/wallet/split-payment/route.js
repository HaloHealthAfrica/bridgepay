import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { getOrCreateWallet } from "../_helpers_secure";
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
  validatePaymentAmount, 
  validateUserId,
  checkDailyLimits 
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
        endpoint: '/api/wallet/split-payment',
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
        endpoint: '/api/wallet/split-payment',
        threatLevel: THREAT_LEVELS.HIGH,
        metadata: { reason: 'invalid_user_id', error: userIdValidation.error }
      });

      return Response.json(
        { ok: false, error: "invalid_user_id" },
        { status: 400 },
      );
    }

    // Rate limiting
    const rateLimitKey = generateUserKey(session.user.id, 'split_payment');
    const rateLimit = await rateLimitMiddleware(RATE_LIMITS.PAYMENT_INTENT)(request, { userId: session.user.id });
    
    if (rateLimit.blocked) {
      return rateLimit.response;
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      await logSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_LOGIN, {
        userId: session.user.id,
        ip,
        userAgent,
        endpoint: '/api/wallet/split-payment',
        threatLevel: THREAT_LEVELS.MEDIUM,
        metadata: { reason: 'malformed_json' }
      });

      return Response.json(
        { ok: false, error: "invalid_json" },
        { status: 400 },
      );
    }

    const amount = Number(body?.amount || 0);
    
    // Validate amount
    const amountValidation = validatePaymentAmount(amount, 'KES');
    if (!amountValidation.valid) {
      return Response.json(
        { ok: false, error: amountValidation.error },
        { status: 400 },
      );
    }

    // Check daily limits
    const limitsCheck = await checkDailyLimits(session.user.id, amount, 'KES');
    if (!limitsCheck.valid) {
      await logSecurityEvent(SECURITY_EVENTS.DAILY_LIMIT_EXCEEDED, {
        userId: session.user.id,
        ip,
        userAgent,
        endpoint: '/api/wallet/split-payment',
        threatLevel: THREAT_LEVELS.MEDIUM,
        metadata: { amount, error: limitsCheck.error }
      });

      return Response.json(
        { ok: false, error: limitsCheck.error },
        { status: 400 },
      );
    }

    // Log sensitive operation
    await logSecurityEvent(SECURITY_EVENTS.SENSITIVE_DATA_ACCESS, {
      userId: session.user.id,
      ip,
      userAgent,
      endpoint: '/api/wallet/split-payment',
      threatLevel: THREAT_LEVELS.LOW,
      metadata: { operation: 'split_payment_calculation', amount }
    });

    // Keep legacy default to avoid breaking existing callers; new callers can pass ["bridge","kcb","dtb","mpesa"]
    const defaultPriorities = ["wallet", "mpesa", "bank"];
    const priorities = Array.isArray(body?.priorities)
      ? body.priorities
      : defaultPriorities;

    // Fetch balances
    const wallet = await getOrCreateWallet(session.user.id, "KES");
    const bridgeAvailable = Math.max(0, Number(wallet.balance || 0));

    // Load virtual sources (kcb, dtb, mpesa) for the user
    const sourcesRows =
      await sql`SELECT source, balance, hold FROM wallet_sources WHERE user_id = ${session.user.id} AND currency = ${"KES"} AND status = 'active'`;
    const sourcesMap = new Map();
    for (const r of sourcesRows) {
      const available = Math.max(
        0,
        Number(r.balance || 0) - Number(r.hold || 0),
      );
      sourcesMap.set(String(r.source), available);
    }

    // Back-compat: map old keys to new sources if provided
    const normalize = (p) => {
      if (p === "wallet") return "bridge";
      if (p === "bank") return "kcb-dtb"; // special marker to fan-out
      return p; // "mpesa", "bridge", "kcb", "dtb"
    };

    const plan = [];
    let rem = amount;

    const takeFrom = (src, available) => {
      if (rem <= 0) return 0;
      const take = Math.min(available, rem);
      if (take > 0) {
        plan.push({ source: src, amount: take });
        rem -= take;
      }
      return take;
    };

    for (const raw of priorities) {
      if (rem <= 0) break;
      const p = normalize(raw);
      if (p === "bridge") {
        takeFrom("bridge", bridgeAvailable);
      } else if (p === "mpesa") {
        const avail = sourcesMap.get("mpesa") ?? 0;
        takeFrom("mpesa", avail);
      } else if (p === "kcb") {
        const avail = sourcesMap.get("kcb") ?? 0;
        takeFrom("kcb", avail);
      } else if (p === "dtb") {
        const avail = sourcesMap.get("dtb") ?? 0;
        takeFrom("dtb", avail);
      } else if (p === "kcb-dtb") {
        // If caller used legacy "bank", pull from KCB then DTB
        const kcbAvail = sourcesMap.get("kcb") ?? 0;
        takeFrom("kcb", kcbAvail);
        const dtbAvail = sourcesMap.get("dtb") ?? 0;
        takeFrom("dtb", dtbAvail);
      } else {
        // Unknown priority label; ignore
      }
    }

    return Response.json(
      {
        ok: true,
        amount,
        plan,
        note: "Plan only. Execution via provider calls should be wired per payment flow to ensure idempotent settlement.",
        balances: {
          bridge: bridgeAvailable,
          kcb: sourcesMap.get("kcb") ?? 0,
          dtb: sourcesMap.get("dtb") ?? 0,
          mpesa: sourcesMap.get("mpesa") ?? 0,
        },
      },
      { 
        status: 200,
        headers: rateLimit.headers
      },
    );
  } catch (e) {
    await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
      userId: session?.user?.id,
      ip,
      userAgent,
      endpoint: '/api/wallet/split-payment',
      threatLevel: THREAT_LEVELS.HIGH,
      metadata: { 
        error: e.message,
        reason: 'server_error'
      }
    });

    console.error("/api/wallet/split-payment POST error", e);
    return Response.json(
      { ok: false, error: e?.message || "server_error" },
      { status: 500 },
    );
  }
}
