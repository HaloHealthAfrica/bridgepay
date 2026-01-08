import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import lemonade from "@/app/api/utils/lemonadeClient";
import {
  getOrCreateWallet,
  postLedgerAndUpdateBalance,
  nowRef,
} from "@/app/api/wallet/_helpers_secure";
import { calculateFees } from "@/app/api/billing/_helpers"; // NEW: pre-calc fees
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

function bad(status, error, extra = {}) {
  return Response.json({ ok: false, error, ...extra }, { status });
}

function ok(json) {
  return Response.json({ ok: true, ...json }, { status: 200 });
}

function toNumber(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function sumPlan(plan) {
  return (plan || []).reduce((s, x) => s + toNumber(x.amount), 0);
}

function mapExtType(idOrType) {
  // We only support MPESA explicitly for now; banks are grouped
  if (idOrType === "mpesa" || idOrType === "LEMONADE_MPESA")
    return "LEMONADE_MPESA";
  return "LEMONADE_BANK";
}

export async function POST(request, { params }) {
  const { id } = params || {};
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
        endpoint: `/api/payments/${id}/confirm`,
        threatLevel: THREAT_LEVELS.HIGH,
        metadata: { reason: 'missing_authentication', paymentId: id }
      });
      return bad(401, "unauthorized");
    }

    // Validate user ID
    const userIdValidation = validateUserId(session.user.id);
    if (!userIdValidation.valid) {
      await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
        userId: session.user.id,
        ip,
        userAgent,
        endpoint: `/api/payments/${id}/confirm`,
        threatLevel: THREAT_LEVELS.HIGH,
        metadata: { reason: 'invalid_user_id', error: userIdValidation.error, paymentId: id }
      });
      return bad(400, "invalid_user_id");
    }

    // Rate limiting for payment confirmation
    const rateLimitKey = generateUserKey(session.user.id, 'payment_confirm');
    const rateLimit = await rateLimitMiddleware(RATE_LIMITS.PAYMENT_INTENT)(request, { userId: session.user.id });
    
    if (rateLimit.blocked) {
      await logSecurityEvent(SECURITY_EVENTS.RATE_LIMIT_EXCEEDED, {
        userId: session.user.id,
        ip,
        userAgent,
        endpoint: `/api/payments/${id}/confirm`,
        threatLevel: THREAT_LEVELS.MEDIUM,
        metadata: { paymentId: id }
      });
      return Response.json(
        { ok: false, error: 'rate_limit_exceeded' },
        { status: 429, headers: rateLimit.headers }
      );
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      await logSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_LOGIN, {
        userId: session.user.id,
        ip,
        userAgent,
        endpoint: `/api/payments/${id}/confirm`,
        threatLevel: THREAT_LEVELS.MEDIUM,
        metadata: { reason: 'malformed_json', paymentId: id }
      });
    }

    const idempo = request.headers.get("Idempotency-Key") || null;

    // Load intent
    const rows = await sql(
      "SELECT * FROM payment_intents WHERE id = $1 LIMIT 1",
      [id],
    );
    const intent = rows?.[0];
    if (!intent) {
      await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
        userId: session.user.id,
        ip,
        userAgent,
        endpoint: `/api/payments/${id}/confirm`,
        threatLevel: THREAT_LEVELS.MEDIUM,
        metadata: { reason: 'payment_not_found', paymentId: id }
      });
      return bad(404, "not_found");
    }
    
    if (intent.user_id !== session.user.id) {
      await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
        userId: session.user.id,
        ip,
        userAgent,
        endpoint: `/api/payments/${id}/confirm`,
        threatLevel: THREAT_LEVELS.HIGH,
        metadata: { 
          reason: 'payment_access_denied', 
          paymentId: id,
          paymentOwnerId: intent.user_id
        }
      });
      return bad(403, "forbidden");
    }
    
    if (intent.status !== "PENDING") {
      await logSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_LOGIN, {
        userId: session.user.id,
        ip,
        userAgent,
        endpoint: `/api/payments/${id}/confirm`,
        threatLevel: THREAT_LEVELS.MEDIUM,
        metadata: { 
          reason: 'invalid_payment_status', 
          paymentId: id,
          currentStatus: intent.status
        }
      });
      return bad(400, "invalid_status", { status: intent.status });
    }

    // Log payment confirmation attempt
    await logSecurityEvent(SECURITY_EVENTS.LARGE_TRANSACTION, {
      userId: session.user.id,
      ip,
      userAgent,
      endpoint: `/api/payments/${id}/confirm`,
      threatLevel: THREAT_LEVELS.LOW,
      metadata: { 
        operation: 'payment_confirm',
        paymentId: id,
        amount: intent.amount_due,
        currency: intent.currency
      }
    });

    // Allow client to override fundingPlan on confirm if provided (must match amount)
    const plan =
      Array.isArray(body?.fundingPlan) && body.fundingPlan.length
        ? body.fundingPlan
        : intent.funding_plan || [];
    const totalPlanned = Math.round(sumPlan(plan) * 100);
    const due = Math.round(Number(intent.amount_due) * 100);
    if (totalPlanned !== due)
      return bad(400, "funding_plan_sum_mismatch", {
        amountDue: intent.amount_due,
        totalPlanned: totalPlanned / 100,
      });

    // Collect external source metadata (e.g., msisdn for mpesa)
    const sourcesMeta = body?.sourcesMeta || {};

    const walletDebits = [];
    const externalStarts = [];

    // 1) Process Bridge wallet debits
    for (let i = 0; i < plan.length; i++) {
      const fs = plan[i];
      if (fs.type !== "BRIDGE_WALLET") continue;
      const amount = toNumber(fs.amount);
      if (!(amount > 0)) continue;

      // Use provided wallet id or create default
      const walletId =
        fs.id || (await getOrCreateWallet(session.user.id, intent.currency)).id;
      const ref = `pi-${id}-wallet-${i}`;
      const res = await postLedgerAndUpdateBalance({
        walletId,
        entryType: "debit",
        amount,
        currency: intent.currency,
        ref,
        externalRef: null,
        narration: "Checkout debit",
        metadata: { payment_intent_id: id, source_index: i },
      });
      // Record UX transaction row (non-blocking if fails)
      try {
        await sql(
          "INSERT INTO wallet_transactions (wallet_id, type, direction, amount, currency, external_ref, status, metadata) VALUES ($1,'DEBIT','OUT',$2,$3,$4,'SUCCESS',$5::jsonb)",
          [
            walletId,
            amount,
            intent.currency,
            ref,
            JSON.stringify({ payment_intent_id: id, source_index: i }),
          ],
        );
      } catch {}
      walletDebits.push({ walletId, amount, ref });
    }

    // 2) Initiate external payments via Lemonade
    for (let i = 0; i < plan.length; i++) {
      const fs = plan[i];
      if (fs.type === "BRIDGE_WALLET") continue;
      const amount = toNumber(fs.amount);
      if (!(amount > 0)) continue;
      const sourceType = mapExtType(fs.id || fs.type);
      const orderRef = `pi${String(id).replace(/-/g, "").slice(0, 18)}${i}`; // short and relay-safe

      if (sourceType === "LEMONADE_MPESA") {
        const details =
          sourcesMeta.mpesa || sourcesMeta["LEMONADE_MPESA"] || {};
        const phone = String(
          details.phone_number || details.msisdn || "",
        ).trim();
        if (!phone) {
          return bad(400, "mpesa_phone_required", { sourceIndex: i });
        }
        const payload = {
          phone_number: phone,
          amount: amount,
          currency: intent.currency,
          reference: orderRef,
          description: "Bridge Checkout",
        };
        const resp = await lemonade.call({
          action: "stk_push",
          payload,
          idempotencyKey: idempo || orderRef,
        });
        const txId =
          resp?.data?.transaction_id ||
          resp?.data?.data?.transaction_id ||
          null;
        await sql(
          "INSERT INTO external_payments (payment_intent_id, type, amount, currency, lemon_tx_id, status, metadata) VALUES ($1,'LEMONADE_MPESA',$2,$3,$4,$5,$6::jsonb)",
          [
            id,
            amount,
            intent.currency,
            txId,
            resp && resp.ok ? "PENDING" : "PENDING",
            JSON.stringify({
              order_reference: orderRef,
              provider_response: resp?.data || null,
            }),
          ],
        );
        externalStarts.push({
          index: i,
          type: sourceType,
          order_reference: orderRef,
          lemon_tx_id: txId,
        });
      } else {
        // Bank/Card placeholder: record and wait for out-of-band initiation (or add later)
        await sql(
          "INSERT INTO external_payments (payment_intent_id, type, amount, currency, status, metadata) VALUES ($1,$2,$3,$4,'PENDING',$5::jsonb)",
          [
            id,
            sourceType,
            amount,
            intent.currency,
            JSON.stringify({
              order_reference: orderRef,
              note: "bank_pending_stub",
            }),
          ],
        );
        externalStarts.push({
          index: i,
          type: sourceType,
          order_reference: orderRef,
        });
      }
    }

    // 3) Mark as funded pending settlement
    await sql(
      "UPDATE payment_intents SET status = 'FUNDED_PENDING_SETTLEMENT', updated_at = NOW() WHERE id = $1",
      [id],
    );

    // NEW: Pre-calc and freeze fees at confirm time (record as pending)
    try {
      const planJson = JSON.stringify(plan || []);
      const fees = await calculateFees({
        appliesTo:
          Array.isArray(plan) && plan.length > 1 ? "SPLIT" : "MERCHANT_PAYMENT",
        amount: Number(intent.amount_due || 0),
        currency: intent.currency || "KES",
        merchantId: intent.merchant_id || null,
        fundingPlan: plan || null,
      });
      for (const item of fees.items || []) {
        const ref = `fee-intent-${id}-${item.fee_code}`.slice(0, 120);
        await sql(
          `INSERT INTO billing_ledger (transaction_type, transaction_id, fee_code, amount, currency, payer_account, platform_account, direction, status, ref, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,'platform_revenue','CREDIT','pending',$7,$8::jsonb)
           ON CONFLICT (ref) DO NOTHING`,
          [
            Array.isArray(plan) && plan.length > 1
              ? "SPLIT"
              : "MERCHANT_PAYMENT",
            String(id),
            item.fee_code,
            Number(item.amount),
            intent.currency || "KES",
            item.payer === "merchant"
              ? "merchant"
              : item.payer === "platform"
                ? "platform"
                : "customer",
            ref,
            JSON.stringify({
              frozen_at: new Date().toISOString(),
              fundingPlan: plan,
            }),
          ],
        );
      }
    } catch (e) {
      console.error("pre-calc fees failed", e);
    }

    // NEW: Check if this is a project contribution and update project
    try {
      const metadata = intent.metadata || {};
      if (metadata.project_id) {
        const { updateProjectOnPayment } = await import("@apps-lib/projects/updateProjectOnPayment.js");
        // Payment is confirmed, so status is 'completed'
        await updateProjectOnPayment(id, "completed");
      }
    } catch (e) {
      console.error("project update on payment confirm failed", e);
      // Don't fail the payment if project update fails
    }

    return ok({
      intentId: id,
      status: "FUNDED_PENDING_SETTLEMENT",
      walletDebits,
      external: externalStarts,
    });
  } catch (e) {
    await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
      userId: session?.user?.id,
      ip,
      userAgent,
      endpoint: `/api/payments/${id}/confirm`,
      threatLevel: THREAT_LEVELS.HIGH,
      metadata: { 
        error: e.message,
        reason: 'server_error',
        paymentId: id
      }
    });

    console.error(`/api/payments/${id}/confirm POST error`, e);
    return bad(500, "server_error");
  }
}
