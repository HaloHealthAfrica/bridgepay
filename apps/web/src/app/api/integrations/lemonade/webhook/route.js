import sql from "@/app/api/utils/sql";
import { startRequest } from "@/app/api/utils/logger";
import { checkRateLimits, getIp } from "@/app/api/utils/ratelimit";
import { writeAudit } from "@/app/api/utils/audit";
import { postLedgerAndUpdateBalance } from "@/app/api/wallet/_helpers"; // add wallet helper for compensation
import { applyFees } from "@/app/api/billing/_helpers"; // NEW: billing engine

// Basic Lemonade webhook to finalize payments
// No secrets echoed; returns 200 for most cases, 400 if clearly malformed

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
  if (["success", "succeeded", "completed", "complete", "paid"].includes(s))
    return "completed";
  if (["failed", "declined", "rejected", "error"].includes(s)) return "failed";
  return null; // unknown -> don't change
}

function pickRef(payload) {
  return (
    payload?.transaction_id ||
    payload?.provider_ref ||
    payload?.provider_reference ||
    payload?.data?.transaction_id ||
    payload?.reference ||
    null
  );
}

// very light redaction for secrets/PII
function redact(obj) {
  try {
    const walk = (val) => {
      if (val == null) return val;
      if (Array.isArray(val)) return val.map(walk);
      if (typeof val === "object") {
        const out = {};
        for (const [k, v] of Object.entries(val)) {
          const key = k.toLowerCase();
          if (
            key.includes("token") ||
            key === "authorization" ||
            key.includes("secret")
          ) {
            out[k] = "<redacted>";
          } else if (key.includes("cvv")) {
            out[k] = "***";
          } else if (
            key.includes("pan") ||
            key.includes("card_number") ||
            key.includes("cardnumber")
          ) {
            const str = String(v || "");
            out[k] =
              str.length > 4
                ? `${"*".repeat(Math.max(0, str.length - 4))}${str.slice(-4)}`
                : "****";
          } else if (key.includes("phone") || key.includes("msisdn")) {
            const str = String(v || "");
            out[k] =
              str.length > 2
                ? `${"*".repeat(Math.max(0, str.length - 2))}${str.slice(-2)}`
                : "**";
          } else if (key.includes("email")) {
            const str = String(v || "");
            const [a, b] = str.split("@");
            out[k] = a && b ? `${a[0]}***@${b[0]}***` : "*";
          } else {
            out[k] = walk(v);
          }
        }
        return out;
      }
      return val;
    };
    return walk(obj);
  } catch {
    return null;
  }
}

function verifySharedSecret(request) {
  const secret = process.env.LEMONADE_WEBHOOK_SECRET;
  const h = (name) => (request.headers.get(name) || "").trim();
  const provided =
    h("lemonade-signature") ||
    h("x-lemonade-signature") ||
    h("x-webhook-secret") ||
    h("x-signature");
  if (!secret) {
    // No secret configured — accept; mark as not verified when header missing
    return { enabled: false, ok: true, provided: !!provided };
  }
  if (!provided) return { enabled: true, ok: true, provided: false }; // accept but unverified per spec
  // platform crypto not available -> simple shared secret match
  const ok = provided === secret;
  return { enabled: true, ok, provided: true };
}

function pickEventId(payload) {
  const eid = payload?.event?.id || payload?.id || null;
  if (eid) return `evt_${String(eid)}`;
  const type = payload?.type || payload?.event?.type || "unknown";
  const tx = pickRef(payload) || "no_ref";
  const created =
    payload?.created_at || payload?.created || payload?.timestamp || "";
  // build a stable synthetic id
  return `evt_${type}_${tx}_${created}`
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 120);
}

async function seenEvent(eventId) {
  if (!eventId) return false;
  const rows =
    await sql`SELECT id FROM mpesa_transactions WHERE raw ->> 'event_id' = ${eventId} LIMIT 1`;
  return !!rows?.[0]?.id;
}

export async function POST(request) {
  const reqMeta = startRequest({
    request,
    route: "/api/integrations/lemonade/webhook",
  });
  try {
    // Rate limit per IP (webhooks): 60/min with burst 10
    const rl = checkRateLimits({
      request,
      route: "webhook.lemonade",
      rules: [{ scope: "ip", limit: 60, burst: 10, windowMs: 60_000 }],
    });
    if (!rl.allowed) {
      return Response.json(
        { ok: false, error: "rate_limited", retryAfter: rl.retryAfter },
        {
          status: 429,
          headers: {
            ...reqMeta.header(),
            "Retry-After": String(rl.retryAfter),
          },
        },
      );
    }

    // Verify signature according to Phase 7
    const v = verifySharedSecret(request);
    if (v.enabled && v.provided && !v.ok) {
      await writeAudit({
        userId: null,
        action: "payments.webhook_received",
        metadata: {
          correlationId: reqMeta.id,
          ip: getIp(request),
          invalidSignature: true,
        },
      });
      return Response.json(
        { ok: false, error: "invalid_signature" },
        { status: 401, headers: reqMeta.header() },
      );
    }

    let payload = null;
    let rawText = null;
    try {
      rawText = await request.text();
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {}

    if (!payload || typeof payload !== "object") {
      await writeAudit({
        userId: null,
        action: "payments.webhook_received",
        metadata: { correlationId: reqMeta.id, malformed: true },
      });
      return Response.json(
        { ok: false, error: "malformed" },
        { status: 400, headers: reqMeta.header() },
      );
    }

    const eventId = pickEventId(payload);
    if (await seenEvent(eventId)) {
      await writeAudit({
        userId: null,
        action: "payments.webhook_duplicate",
        metadata: { correlationId: reqMeta.id, eventId },
      });
      return Response.json(
        { ok: true, duplicate: true },
        { headers: reqMeta.header() },
      );
    }

    const ref = pickRef(payload);

    // Prepare redacted payload we will store
    const redacted = redact({
      ...payload,
      event_id: eventId,
      verified: !!(v.enabled ? v.ok && v.provided : v.provided),
      source: "webhook",
    });

    let payment = null;
    if (ref) {
      // prefer pending payments but don't fail if none
      const rows = await sql`
        SELECT * FROM mpesa_payments
        WHERE provider_ref = ${ref}
           OR (metadata -> 'provider_response' ->> 'transaction_id') = ${ref}
           OR (metadata -> 'provider_response' -> 'data' ->> 'transaction_id') = ${ref}
           OR (metadata ->> 'order_reference') = ${ref}
        ORDER BY (status = 'pending') DESC, created_at DESC
        LIMIT 1
      `;
      payment = rows?.[0] || null;
    }

    const mapped = mapProviderStatus(payload) || "pending";

    if (payment) {
      await sql(
        "UPDATE mpesa_payments SET status = $1, metadata = metadata || $2::jsonb, updated_at = NOW() WHERE id = $3",
        [mapped, JSON.stringify({ webhook: redacted }), payment.id],
      );

      await sql(
        "INSERT INTO mpesa_transactions (payment_id, status, raw) VALUES ($1, $2, $3::jsonb)",
        [payment.id, mapped, JSON.stringify(redacted)],
      );

      // NEW: close invoice loop when completed
      try {
        const invoiceId = payment?.metadata?.invoice_id;
        if (invoiceId && mapped === "completed") {
          await sql(
            "UPDATE invoices SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = $1 AND status <> 'paid'",
            [Number(invoiceId)],
          );
        }
      } catch {}

      // NEW: mark QR code as used when completed (order_reference equals QR code)
      try {
        const code = payment?.order_reference;
        if (code && mapped === "completed") {
          await sql(
            "UPDATE qr_codes SET status = 'used', metadata = COALESCE(metadata,'{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE code = $2 AND status <> 'used'",
            [
              JSON.stringify({
                used_at: new Date().toISOString(),
                payment_id: payment.id,
              }),
              String(code),
            ],
          );
        }
      } catch {}

      // NEW: update project contribution when payment completed
      try {
        const paymentIntentId = payment?.metadata?.payment_intent_id;
        if (paymentIntentId && mapped === "completed") {
          const { updateProjectOnPayment } = await import("@apps-lib/projects/updateProjectOnPayment.js");
          await updateProjectOnPayment(paymentIntentId, "completed");
        }
      } catch (e) {
        console.error("[Webhook] Project update failed:", e);
      }

      await writeAudit({
        userId: null,
        action: "payments.webhook_update",
        metadata: {
          correlationId: reqMeta.id,
          paymentId: payment.id,
          eventId,
          mapped: mapped,
        },
      });
    } else {
      // Orphan event — store for visibility without payment link
      await sql(
        "INSERT INTO mpesa_transactions (payment_id, status, raw) VALUES ($1, $2, $3::jsonb)",
        [0, mapped, JSON.stringify(redacted)],
      );
      await writeAudit({
        userId: null,
        action: "payments.webhook_received",
        metadata: { correlationId: reqMeta.id, orphan: true, eventId },
      });
    }

    // NEW: Also update external_payments (Bridge Payment Intents orchestration)
    if (ref) {
      try {
        const epRows = await sql(
          "SELECT id, payment_intent_id, type, amount, currency, status FROM external_payments WHERE lemon_tx_id = $1 OR (metadata ->> 'order_reference') = $1 LIMIT 1",
          [ref],
        );
        const ep = epRows?.[0];
        if (ep) {
          const newStatus =
            mapped === "completed"
              ? "SUCCESS"
              : mapped === "failed"
                ? "FAILED"
                : "PENDING";
          if (newStatus !== ep.status) {
            await sql(
              "UPDATE external_payments SET status = $1, updated_at = NOW() WHERE id = $2",
              [newStatus, ep.id],
            );
          }
          // Evaluate whole intent state
          const siblings = await sql(
            "SELECT status FROM external_payments WHERE payment_intent_id = $1",
            [ep.payment_intent_id],
          );
          const anyFailed = (siblings || []).some((r) => r.status === "FAILED");
          const allSuccess =
            (siblings || []).length > 0 &&
            (siblings || []).every((r) => r.status === "SUCCESS");
          if (anyFailed) {
            // Compensation: refund wallet debits for this intent
            const debits = await sql(
              "SELECT id, wallet_id, amount, currency FROM wallet_transactions WHERE (metadata ->> 'payment_intent_id') = $1 AND type = 'DEBIT' AND status = 'SUCCESS'",
              [ep.payment_intent_id],
            );
            for (const t of debits || []) {
              // Credit back via ledger and record REFUND tx (idempotent by ref)
              const refundRef = `pi-refund-${t.id}`;
              try {
                await postLedgerAndUpdateBalance({
                  walletId: t.wallet_id,
                  entryType: "credit",
                  amount: Number(t.amount || 0),
                  currency: t.currency || "KES",
                  ref: refundRef,
                  narration: "Compensation refund",
                  metadata: { payment_intent_id: ep.payment_intent_id },
                });
                await sql(
                  "INSERT INTO wallet_transactions (wallet_id, type, direction, amount, currency, external_ref, status, metadata) VALUES ($1,'REFUND','IN',$2,$3,$4,'SUCCESS',$5::jsonb)",
                  [
                    t.wallet_id,
                    Number(t.amount || 0),
                    t.currency || "KES",
                    refundRef,
                    JSON.stringify({ payment_intent_id: ep.payment_intent_id }),
                  ],
                );
              } catch (e) {
                // best-effort; continue others
              }
            }
            await sql(
              "UPDATE payment_intents SET status = 'FAILED', updated_at = NOW() WHERE id = $1 AND status <> 'FAILED'",
              [ep.payment_intent_id],
            );
          } else if (allSuccess) {
            await sql(
              "UPDATE payment_intents SET status = 'SETTLED', updated_at = NOW() WHERE id = $1 AND status <> 'SETTLED'",
              [ep.payment_intent_id],
            );
            // NEW: Apply MDR / split fees on settled intents (best-effort)
            try {
              const intentRows = await sql(
                "SELECT id, user_id, merchant_id, amount_due, currency, funding_plan FROM payment_intents WHERE id = $1",
                [ep.payment_intent_id],
              );
              const intent = intentRows?.[0];
              if (intent) {
                // Determine type: SPLIT when multiple sources, else MERCHANT_PAYMENT
                let type = "MERCHANT_PAYMENT";
                try {
                  const plan = intent.funding_plan || [];
                  if (Array.isArray(plan) && plan.length > 1) type = "SPLIT";
                } catch {}
                // Mark any frozen fees as posted
                await sql(
                  "UPDATE billing_ledger SET status = 'posted' WHERE transaction_type = $1 AND transaction_id = $2 AND status = 'pending'",
                  [type, String(intent.id)],
                );
                // In case no frozen rows existed, compute and post now
                await applyFees({
                  transactionType: type,
                  transactionId: String(intent.id),
                  baseAmount: Number(intent.amount_due || 0),
                  currency: intent.currency || "KES",
                  merchantId: intent.merchant_id || null,
                  fundingPlan: intent.funding_plan || null,
                });
              }
            } catch (e) {
              console.error("billing apply on INTENT SETTLED failed", e);
            }
          }
        }
      } catch (e) {
        // swallow errors to not break webhook processing
        console.error("lemonade webhook external_payments update error", e);
      }
    }

    return Response.json({ ok: true }, { headers: reqMeta.header() });
  } catch (e) {
    return Response.json(
      { ok: false, error: e?.message || "unknown_error" },
      { status: 500, headers: reqMeta.header() },
    );
  }
}

// Admin-only monitor: last 100 webhook events
import { auth } from "@/auth";
function isAdmin(role) {
  return role === "admin";
}

export async function GET(request) {
  const reqMeta = startRequest({
    request,
    route: "/api/integrations/lemonade/webhook[GET]",
  });
  try {
    const session = await auth();
    let role = session?.user?.role;
    if (!session?.user?.id) {
      return Response.json(
        { ok: false, error: "unauthorized" },
        { status: 401, headers: reqMeta.header() },
      );
    }
    if (!role) {
      try {
        const r =
          await sql`SELECT role FROM auth_users WHERE id = ${session.user.id} LIMIT 1`;
        role = r?.[0]?.role;
      } catch {}
    }
    if (!isAdmin(role)) {
      return Response.json(
        { ok: false, error: "forbidden" },
        { status: 403, headers: reqMeta.header() },
      );
    }

    const rows = await sql`
      SELECT id, payment_id, status, raw, created_at
      FROM mpesa_transactions
      WHERE (raw ->> 'source') = 'webhook'
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const events = (rows || []).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      payment_id: r.payment_id,
      status: r.status,
      type: r.raw?.type || r.raw?.event?.type || null,
      transaction_id:
        r.raw?.transaction_id || r.raw?.data?.transaction_id || null,
      verified: !!r.raw?.verified,
    }));

    return Response.json({ ok: true, events }, { headers: reqMeta.header() });
  } catch (e) {
    return Response.json(
      { ok: false, error: e?.message || "unknown_error" },
      { status: 500 },
    );
  }
}
