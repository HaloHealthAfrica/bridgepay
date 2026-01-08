import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import lemonade from "@/app/api/utils/lemonadeClient";
import { startRequest } from "@/app/api/utils/logger";
import { checkRateLimits } from "@/app/api/utils/ratelimit";
import { writeAudit } from "@/app/api/utils/audit";
import { recordMetric } from "@/app/api/utils/metrics";
import { validateCreateInput } from "@/app/api/utils/validate";
import { findIdempotent, saveIdempotent } from "@/app/api/utils/idempotency";
// NEW: unified mapping/validation (acc_no-based)
import { mapToLemonadePayload, validateLemonadePayload } from "../_mapping";
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
  validateUserId,
  validatePaymentAmount 
} from "@/app/api/utils/validators";

function isPrivileged(role) {
  return role === "admin" || role === "merchant";
}

function pick(...vals) {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v;
  return null;
}

function mapActionToType(action) {
  // Keep it consistent per spec: use 'paybill' for stk_push, 'till' for wallet_payment
  if (action === "stk_push") return "paybill";
  if (action === "wallet_payment") return "till";
  return "paybill";
}

function mapProviderStatus(data) {
  const s = String(
    (
      data?.status ||
      data?.transaction_status ||
      data?.payment_status ||
      data?.data?.status ||
      ""
    ).toString(),
  ).toLowerCase();
  if (["success", "succeeded", "completed", "complete"].includes(s))
    return "completed";
  if (["failed", "declined", "rejected", "error"].includes(s)) return "failed";
  return "pending";
}

function ensureChannel(action, payload) {
  const eff = { ...(payload || {}) };
  if (!eff.channel) {
    const ch = lemonade.actionToChannel(action);
    if (ch) eff.channel = ch;
  }
  return eff;
}

function generateOrderRef() {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `ref-${Date.now()}-${rnd}`;
}

// Normalize action aliases used in the admin tools/UI or external callers
function normalizeAction(a) {
  const x = String(a || "").toLowerCase();
  if (x === "wallet" || x === "wallet_transfer" || x === "walletpay")
    return "wallet_payment";
  if (x === "stk" || x === "paybill" || x === "mpesa_stk") return "stk_push";
  return a;
}

export async function POST(request) {
  const reqMeta = startRequest({
    request,
    route: "/api/payments/lemonade/create",
  });
  const startedAt = Date.now();
  const ip = request.headers.get('x-forwarded-for') || 
            request.headers.get('x-real-ip') || 
            'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  try {
    // Rate limits: payments
    const rl = checkRateLimits({
      request,
      route: "payments.create",
      // per-user and per-ip
      rules: [
        { scope: "ip", limit: 30, burst: 30, windowMs: 60_000 },
        { scope: "user", limit: 10, burst: 10, windowMs: 60_000 },
        { scope: "user", limit: 60, burst: 60, windowMs: 60 * 60_000 },
      ],
    });
    if (!rl.allowed) {
      await logSecurityEvent(SECURITY_EVENTS.RATE_LIMIT_EXCEEDED, {
        ip,
        userAgent,
        endpoint: '/api/payments/lemonade/create',
        threatLevel: THREAT_LEVELS.MEDIUM,
        metadata: { reason: 'legacy_rate_limit' }
      });
      reqMeta.log("rate_limited");
      const headers = {
        ...reqMeta.header(),
        "Retry-After": String(rl.retryAfter),
      };
      recordMetric({
        route: "payments.create",
        durationMs: Date.now() - startedAt,
        error: true,
      });
      return Response.json(
        { ok: false, error: "rate_limited", retryAfter: rl.retryAfter },
        { status: 429, headers },
      );
    }

    const session = await auth();
    if (!session?.user?.id) {
      await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
        ip,
        userAgent,
        endpoint: '/api/payments/lemonade/create',
        threatLevel: THREAT_LEVELS.HIGH,
        metadata: { reason: 'missing_authentication' }
      });
      const headers = reqMeta.header();
      recordMetric({
        route: "payments.create",
        durationMs: Date.now() - startedAt,
        error: true,
      });
      return Response.json(
        { ok: false, error: "unauthorized" },
        { status: 401, headers },
      );
    }

    // Validate user ID
    const userIdValidation = validateUserId(session.user.id);
    if (!userIdValidation.valid) {
      await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
        userId: session.user.id,
        ip,
        userAgent,
        endpoint: '/api/payments/lemonade/create',
        threatLevel: THREAT_LEVELS.HIGH,
        metadata: { reason: 'invalid_user_id', error: userIdValidation.error }
      });
      const headers = reqMeta.header();
      recordMetric({
        route: "payments.create",
        durationMs: Date.now() - startedAt,
        error: true,
      });
      return Response.json(
        { ok: false, error: "invalid_user_id" },
        { status: 400, headers },
      );
    }

    // Fetch role if missing
    let role = session.user.role;
    if (!role) {
      try {
        const r =
          await sql`SELECT role FROM auth_users WHERE id = ${session.user.id} LIMIT 1`;
        role = r?.[0]?.role;
      } catch {}
    }

    if (!isPrivileged(role)) {
      await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
        userId: session.user.id,
        ip,
        userAgent,
        endpoint: '/api/payments/lemonade/create',
        threatLevel: THREAT_LEVELS.HIGH,
        metadata: { reason: 'insufficient_privileges', role }
      });
      const headers = reqMeta.header();
      recordMetric({
        route: "payments.create",
        durationMs: Date.now() - startedAt,
        error: true,
      });
      return Response.json(
        { ok: false, error: "forbidden" },
        { status: 403, headers },
      );
    }

    let body = null;
    try {
      body = await request.json();
    } catch {
      await logSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_LOGIN, {
        userId: session.user.id,
        ip,
        userAgent,
        endpoint: '/api/payments/lemonade/create',
        threatLevel: THREAT_LEVELS.MEDIUM,
        metadata: { reason: 'malformed_json' }
      });
    }

    // Validation (basic shape)
    const valErrors = validateCreateInput(body || {});
    if (valErrors.length) {
      const headers = reqMeta.header();
      recordMetric({
        route: "payments.create",
        durationMs: Date.now() - startedAt,
        error: true,
      });
      return Response.json(
        { ok: false, error: "validation_error", details: valErrors },
        { status: 400, headers },
      );
    }

    // Normalize action + ensure channel
    const incomingAction = body.action;
    const action = normalizeAction(incomingAction);
    const rawPayload = body.payload || {};
    const payloadWithChannel = ensureChannel(action, rawPayload);

    // 1) Build unified Lemonade payload (acc_no/acc_name-based)
    const lemonPayload = mapToLemonadePayload(action, payloadWithChannel);

    // 2) Validate BEFORE sending to provider
    const missing = validateLemonadePayload(action, lemonPayload);
    if (missing) {
      const headers = reqMeta.header();
      recordMetric({
        route: "payments.create",
        durationMs: Date.now() - startedAt,
        error: true,
      });
      return Response.json(
        {
          ok: false,
          error: "Missing required fields",
          missing,
          sent: lemonPayload,
        },
        { status: 400, headers },
      );
    }

    // Compute amount/order reference after mapping
    const amountNum = Number(lemonPayload?.amount);
    let order_reference =
      rawPayload?.order_reference || lemonPayload?.reference;
    if (!order_reference) order_reference = "ref-" + Date.now();

    // Validate payment amount
    if (amountNum > 0) {
      const amountValidation = validatePaymentAmount(amountNum);
      if (!amountValidation.valid) {
        await logSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_LOGIN, {
          userId: session.user.id,
          ip,
          userAgent,
          endpoint: '/api/payments/lemonade/create',
          threatLevel: THREAT_LEVELS.MEDIUM,
          metadata: { reason: 'invalid_amount', amount: amountNum, error: amountValidation.error }
        });
        const headers = reqMeta.header();
        recordMetric({
          route: "payments.create",
          durationMs: Date.now() - startedAt,
          error: true,
        });
        return Response.json(
          { ok: false, error: amountValidation.error },
          { status: 400, headers },
        );
      }

      // Log large payment attempts
      if (amountNum >= 100000) { // 100K KES threshold
        await logSecurityEvent(SECURITY_EVENTS.LARGE_TRANSACTION, {
          userId: session.user.id,
          ip,
          userAgent,
          endpoint: '/api/payments/lemonade/create',
          threatLevel: THREAT_LEVELS.LOW,
          metadata: { 
            operation: 'lemonade_payment_create',
            amount: amountNum,
            action,
            order_reference
          }
        });
      }
    }

    // Idempotency pre-check
    const idemKey = order_reference;
    const found = await findIdempotent(idemKey);
    if (found && found.payment_id) {
      const headers = reqMeta.header();
      recordMetric({
        route: "payments.create",
        durationMs: Date.now() - startedAt,
        error: false,
      });
      return Response.json(
        { ...(found.response || {}), order_reference },
        { status: 200, headers },
      );
    }

    const type = mapActionToType(action);

    // Insert pending row (store final payload we will send)
    const inserted = await sql(
      "INSERT INTO mpesa_payments (user_id, type, amount, status, order_reference, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id",
      [
        session.user.id,
        type,
        amountNum,
        "pending",
        order_reference,
        JSON.stringify({
          action,
          order_reference,
          sent_payload: lemonPayload,
          provider: "lemonade",
        }),
      ],
    );
    const paymentId = inserted?.[0]?.id;

    // 3) Log final payload
    console.log("\u{1F680} [CREATE] Lemonade Payload", {
      action,
      lemonPayload,
      correlationId: reqMeta.id,
    });

    // Provider call via Relay ONLY
    let res = await lemonade.call({
      action,
      payload: lemonPayload,
      mode: "relay",
      correlationId: reqMeta.id,
      idempotencyKey: order_reference,
    });

    const provider_ref = pick(
      res?.data?.provider_ref,
      res?.data?.provider_reference,
      res?.data?.transaction_id,
      res?.data?.reference,
      res?.data?.data?.transaction_id,
      res?.data?.data?.reference,
    );

    const mapped = res?.ok ? mapProviderStatus(res?.data) : "pending";

    // Update payment row
    await sql(
      "UPDATE mpesa_payments SET provider_ref = $1, status = $2, metadata = metadata || $3::jsonb, updated_at = NOW() WHERE id = $4",
      [
        provider_ref,
        mapped,
        JSON.stringify({ provider_response: res?.data || null }),
        paymentId,
      ],
    );

    await sql(
      "INSERT INTO mpesa_transactions (payment_id, status, raw) VALUES ($1, $2, $3::jsonb)",
      [paymentId, mapped, JSON.stringify(res?.data || null)],
    );

    const baseResponse = {
      payment_id: paymentId,
      status: mapped,
      provider_ref: provider_ref || null,
      order_reference,
    };

    if (res.ok) {
      const response = {
        ok: true,
        ...baseResponse,
        data: res.data,
        requestHeaders:
          res.mode === "direct"
            ? {
                Authorization: "Bearer <present>",
                "Content-Type": "application/json",
                "Idempotency-Key": "<present>",
              }
            : { Header: "<present>", "Content-Type": "application/json" },
        url: res.url,
        mode: res.mode,
      };
      await saveIdempotent(idemKey, paymentId, response);
      await writeAudit({
        userId: session.user.id,
        action: "payments.create",
        metadata: { correlationId: reqMeta.id, paymentId, mode: res.mode },
      });
      
      // Log successful payment creation
      await logSecurityEvent(SECURITY_EVENTS.SENSITIVE_DATA_ACCESS, {
        userId: session.user.id,
        ip,
        userAgent,
        endpoint: '/api/payments/lemonade/create',
        threatLevel: THREAT_LEVELS.LOW,
        metadata: { 
          operation: 'payment_create_success',
          paymentId,
          amount: amountNum,
          action,
          mode: res.mode,
          order_reference
        }
      });

      const headers = reqMeta.header();
      recordMetric({
        route: "payments.create",
        durationMs: Date.now() - startedAt,
        error: false,
      });
      return Response.json(response, { status: 200, headers });
    } else {
      const response = {
        ok: false,
        ...baseResponse,
        data: res.data,
        raw: res.raw,
        statusCode: res.status,
        mode: res.mode,
        sent: lemonPayload,
      };
      await saveIdempotent(idemKey, paymentId, response);
      await writeAudit({
        userId: session.user.id,
        action: "payments.create",
        metadata: {
          correlationId: reqMeta.id,
          paymentId,
          error: true,
          mode: res.mode,
        },
      });
      
      // Log failed payment creation
      await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
        userId: session.user.id,
        ip,
        userAgent,
        endpoint: '/api/payments/lemonade/create',
        threatLevel: THREAT_LEVELS.MEDIUM,
        metadata: { 
          operation: 'payment_create_failed',
          paymentId,
          amount: amountNum,
          action,
          mode: res.mode,
          order_reference,
          error: res.data
        }
      });

      const headers = reqMeta.header();
      recordMetric({
        route: "payments.create",
        durationMs: Date.now() - startedAt,
        error: true,
      });
      return Response.json(response, { status: res.status || 400, headers });
    }
  } catch (e) {
    await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
      userId: session?.user?.id,
      ip,
      userAgent,
      endpoint: '/api/payments/lemonade/create',
      threatLevel: THREAT_LEVELS.HIGH,
      metadata: { 
        error: e.message,
        reason: 'server_error'
      }
    });

    const headers = reqMeta.header();
    await writeAudit({
      userId: null,
      action: "payments.create",
      metadata: { correlationId: reqMeta.id, crashed: true },
    });
    recordMetric({
      route: "payments.create",
      durationMs: Date.now() - startedAt,
      error: true,
    });
    return Response.json(
      { ok: false, error: e?.message || "unknown_error" },
      { status: 500, headers },
    );
  } finally {
    reqMeta.end({ status: 200 });
  }
}
