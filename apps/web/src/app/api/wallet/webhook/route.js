import sql from "@/app/api/utils/sql";
import { applyFees } from "@/app/api/billing/_helpers"; // NEW: billing engine
import { 
  logSecurityEvent, 
  SECURITY_EVENTS, 
  THREAT_LEVELS 
} from "@/app/api/utils/securityMonitor";
import { 
  rateLimitMiddleware, 
  RATE_LIMITS, 
  generateIPKey 
} from "@/app/api/utils/rateLimiter";

function ok() {
  return new Response(null, { status: 204 });
}

function verify(req, headers) {
  // Basic shared-secret verification using Lemonade relay key if present
  const authz = headers.get("authorization") || headers.get("Authorization");
  const bridgeKey =
    headers.get("x-bridge-relay-key") || headers.get("X-Bridge-Relay-Key");
  const expected = process.env.LEMONADE_RELAY_KEY;
  if (!expected) return true; // if no secret configured, accept but log
  if (authz && authz === `Bearer ${expected}`) return true;
  if (bridgeKey && bridgeKey === expected) return true;
  return false;
}

export async function POST(request) {
  const ip = request.headers.get('x-forwarded-for') || 
            request.headers.get('x-real-ip') || 
            'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  try {
    // Rate limiting for webhook endpoint
    const rateLimitKey = generateIPKey(request, 'webhook');
    const rateLimit = await rateLimitMiddleware(RATE_LIMITS.API_GENERAL)(request, {});
    
    if (rateLimit.blocked) {
      await logSecurityEvent(SECURITY_EVENTS.RATE_LIMIT_EXCEEDED, {
        ip,
        userAgent,
        endpoint: '/api/wallet/webhook',
        threatLevel: THREAT_LEVELS.MEDIUM,
        metadata: { rateLimitKey }
      });
      return rateLimit.response;
    }

    const headers = request.headers;
    const bodyText = await request.text();
    let body = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      // Log malformed JSON attempts
      await logSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_LOGIN, {
        ip,
        userAgent,
        endpoint: '/api/wallet/webhook',
        threatLevel: THREAT_LEVELS.MEDIUM,
        metadata: { reason: 'malformed_json', bodyText: bodyText?.slice(0, 100) }
      });
    }

    const valid = verify(request, headers);
    if (!valid) {
      // Log unauthorized webhook attempts
      await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
        ip,
        userAgent,
        endpoint: '/api/wallet/webhook',
        threatLevel: THREAT_LEVELS.HIGH,
        metadata: { 
          reason: 'invalid_webhook_auth',
          headers: Object.fromEntries(headers.entries())
        }
      });

      await sql(
        "INSERT INTO wallet_webhook_events (event_type, payload) VALUES ($1, $2::jsonb)",
        [
          "unauthorized",
          JSON.stringify({
            body: body || bodyText || null,
            headers: Object.fromEntries(headers.entries()),
            ip,
            userAgent
          }),
        ],
      );
      return new Response("unauthorized", { status: 401 });
    }

    const provider_tx_id =
      body?.transaction_id ||
      body?.reference ||
      body?.data?.transaction_id ||
      body?.data?.reference ||
      null;
    const order_reference =
      body?.reference || body?.order_reference || body?.data?.reference || null;
    const statusRaw = String(
      body?.status || body?.data?.status || "",
    ).toLowerCase();
    const succeeded = [
      "success",
      "succeeded",
      "completed",
      "complete",
    ].includes(statusRaw);
    const failed = [
      "failed",
      "declined",
      "rejected",
      "error",
      "cancelled",
    ].includes(statusRaw);

    // Log successful webhook processing
    await logSecurityEvent(SECURITY_EVENTS.SENSITIVE_DATA_ACCESS, {
      ip,
      userAgent,
      endpoint: '/api/wallet/webhook',
      threatLevel: THREAT_LEVELS.LOW,
      metadata: { 
        eventType: succeeded ? "payment_succeeded" : failed ? "payment_failed" : "payment_update",
        provider_tx_id,
        order_reference
      }
    });

    await sql(
      "INSERT INTO wallet_webhook_events (event_type, related_order_reference, related_provider_tx_id, payload) VALUES ($1,$2,$3,$4::jsonb)",
      [
        succeeded
          ? "payment_succeeded"
          : failed
            ? "payment_failed"
            : "payment_update",
        order_reference,
        provider_tx_id,
        JSON.stringify({ ...body || {}, ip, userAgent }),
      ],
    );

    // Try match a funding session first
    const fs = await sql(
      "SELECT id, wallet_id, amount, status FROM wallet_funding_sessions WHERE (order_reference = $1 OR provider_tx_id = $2) LIMIT 1",
      [order_reference, provider_tx_id],
    );
    if (fs && fs[0]) {
      const row = fs[0];
      if (row.status !== "succeeded" && succeeded) {
        // Credit wallet atomically via ledger
        const ref = `wl-topup-${row.id}`;
        const exists = await sql(
          "SELECT id FROM wallet_ledger WHERE ref = $1 LIMIT 1",
          [ref],
        );
        if (!(exists && exists[0])) {
          await sql.transaction((txn) => [
            txn(
              "WITH ins AS (\n                INSERT INTO wallet_ledger (wallet_id, entry_type, amount, currency, status, ref, external_ref, narration, metadata, created_at)\n                VALUES ($1,'credit',$2,'KES','posted',$3,$4,$5,$6::jsonb, now())\n                ON CONFLICT (ref) DO NOTHING\n                RETURNING id\n              ), upd AS (\n                UPDATE wallets SET balance = balance + $2, updated_at = now() WHERE id = $1\n                RETURNING balance\n              )\n              SELECT (SELECT id FROM ins) AS ledger_id, (SELECT balance FROM upd) AS balance_after",
              [
                row.wallet_id,
                Number(row.amount || 0),
                ref,
                provider_tx_id,
                "Wallet top-up",
                JSON.stringify({ source: "lemonade" }),
              ],
            ),
            txn(
              "UPDATE wallet_funding_sessions SET status = 'succeeded', provider_tx_id = COALESCE($2, provider_tx_id), updated_at = now() WHERE id = $1",
              [row.id, provider_tx_id],
            ),
          ]);
          // NEW: Apply top-up fees after successful credit (best-effort)
          try {
            await applyFees({
              transactionType: "TOPUP",
              transactionId: String(row.id),
              baseAmount: Number(row.amount || 0),
              currency: "KES",
              customerWalletId: row.wallet_id,
            });
          } catch (e) {
            console.error("billing apply on TOPUP failed", e);
          }
        }
      } else if (failed && row.status === "pending") {
        await sql(
          "UPDATE wallet_funding_sessions SET status = 'failed', updated_at = now() WHERE id = $1",
          [row.id],
        );
      }
      return ok();
    }

    // Try match a withdrawal
    const wd = await sql(
      "SELECT id, wallet_id, amount, status FROM wallet_withdrawals WHERE (order_reference = $1 OR provider_tx_id = $2) LIMIT 1",
      [order_reference, provider_tx_id],
    );
    if (wd && wd[0]) {
      const row = wd[0];
      if (row.status !== "succeeded" && succeeded) {
        const ref = `wl-wd-${row.id}`;
        const exists = await sql(
          "SELECT id FROM wallet_ledger WHERE ref = $1 LIMIT 1",
          [ref],
        );
        if (!(exists && exists[0])) {
          await sql.transaction((txn) => [
            txn(
              "WITH ins AS (\n                INSERT INTO wallet_ledger (wallet_id, entry_type, amount, currency, status, ref, external_ref, narration, metadata, created_at)\n                VALUES ($1,'debit',$2,'KES','posted',$3,$4,$5,$6::jsonb, now())\n                ON CONFLICT (ref) DO NOTHING\n                RETURNING id\n              ), upd AS (\n                UPDATE wallets SET balance = balance - $2, updated_at = now() WHERE id = $1\n                RETURNING balance\n              )\n              SELECT (SELECT id FROM ins) AS ledger_id, (SELECT balance FROM upd) AS balance_after",
              [
                row.wallet_id,
                Number(row.amount || 0),
                ref,
                provider_tx_id,
                "Wallet withdrawal",
                JSON.stringify({ destination: "mpesa" }),
              ],
            ),
            txn(
              "UPDATE wallet_withdrawals SET status = 'succeeded', provider_tx_id = COALESCE($2, provider_tx_id), updated_at = now() WHERE id = $1",
              [row.id, provider_tx_id],
            ),
          ]);
          // NEW: Apply withdrawal fees (best-effort)
          try {
            await applyFees({
              transactionType: "WITHDRAWAL",
              transactionId: String(row.id),
              baseAmount: Number(row.amount || 0),
              currency: "KES",
              customerWalletId: row.wallet_id,
            });
          } catch (e) {
            console.error("billing apply on WITHDRAWAL failed", e);
          }
        }
      } else if (failed && ["pending", "processing"].includes(row.status)) {
        await sql(
          "UPDATE wallet_withdrawals SET status = 'failed', updated_at = now() WHERE id = $1",
          [row.id],
        );
      }
      return ok();
    }

    return ok();
  } catch (e) {
    // Log webhook processing errors
    await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
      ip,
      userAgent,
      endpoint: '/api/wallet/webhook',
      threatLevel: THREAT_LEVELS.HIGH,
      metadata: { 
        error: e.message,
        reason: 'webhook_processing_error'
      }
    });

    console.error("/api/wallet/webhook error", e);
    return new Response("server_error", { status: 500 });
  }
}
