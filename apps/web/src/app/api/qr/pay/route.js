import sql from "@/app/api/utils/sql";
import { startRequest } from "@/app/api/utils/logger";
import { checkRateLimits } from "@/app/api/utils/ratelimit";
import { writeAudit } from "@/app/api/utils/audit";

async function getQr(code) {
  const rows = await sql`SELECT * FROM qr_codes WHERE code = ${code} LIMIT 1`;
  return rows?.[0] || null;
}

function short(code) {
  const c = String(code || "");
  return c.length <= 8 ? c : `${c.slice(0, 4)}…${c.slice(-3)}`;
}

export async function POST(request) {
  const reqMeta = startRequest({ request, route: "/api/qr/pay" });
  try {
    const rl = checkRateLimits({
      request,
      route: "qr.pay",
      rules: [
        { scope: "ip", limit: 30, burst: 30, windowMs: 60_000 },
        { scope: "ip", limit: 300, burst: 300, windowMs: 60 * 60_000 },
      ],
    });
    if (!rl.allowed) {
      const headers = {
        ...reqMeta.header(),
        "Retry-After": String(rl.retryAfter),
      };
      return Response.json(
        { ok: false, error: "rate_limited", retryAfter: rl.retryAfter },
        { status: 429, headers },
      );
    }

    let body = null;
    try {
      body = await request.json();
    } catch {}

    const code = String(body?.code || "").trim();
    const method = String(body?.method || "").toLowerCase();
    const phone_number = body?.phone_number
      ? String(body.phone_number).trim()
      : null;
    const wallet_no = body?.wallet_no ? String(body.wallet_no).trim() : null;
    const reference = body?.reference ? String(body.reference) : null;

    if (!code) {
      return Response.json(
        { ok: false, error: "validation_error", details: ["code is required"] },
        { status: 400, headers: reqMeta.header() },
      );
    }
    if (!["stk", "wallet"].includes(method)) {
      return Response.json(
        {
          ok: false,
          error: "validation_error",
          details: ["method must be 'stk' or 'wallet'"],
        },
        { status: 400, headers: reqMeta.header() },
      );
    }

    // CRITICAL FIX: Atomic QR code redemption to prevent double-use
    // Lock and update QR code status atomically
    const qrUpdate = await sql`
      UPDATE qr_codes 
      SET status = 'used', updated_at = NOW() 
      WHERE code = ${code} AND status = 'active'
      RETURNING id, amount, currency, mode, expires_at, metadata
    `;
    
    if (!qrUpdate || !qrUpdate[0]) {
      // QR code was already used, expired, or doesn't exist
      const currentQr = await getQr(code);
      if (!currentQr) {
        return Response.json(
          { ok: false, error: "not_found" },
          { status: 404, headers: reqMeta.header() },
        );
      }
      
      if (currentQr.status === "used") {
        return Response.json(
          { ok: false, error: "already_used", status: currentQr.status },
          { status: 400, headers: reqMeta.header() },
        );
      }
      
      if (currentQr.expires_at && new Date(currentQr.expires_at) < new Date()) {
        return Response.json(
          { ok: false, error: "expired" },
          { status: 400, headers: reqMeta.header() },
        );
      }
      
      return Response.json(
        { ok: false, error: "invalid_state", status: currentQr.status },
        { status: 400, headers: reqMeta.header() },
      );
    }
    
    // Use the atomically updated QR data
    const qr = qrUpdate[0];
    
    // Validate QR mode after atomic update
    if (qr.mode !== "pay") {
      // Revert QR status since mode is invalid
      await sql`UPDATE qr_codes SET status = 'active', updated_at = NOW() WHERE code = ${code}`;
      return Response.json(
        { ok: false, error: "invalid_mode" },
        { status: 400, headers: reqMeta.header() },
      );
    }

    const amount = qr.amount != null ? Number(qr.amount) : null;
    const currency = qr.currency || "KES";
    if (!(amount > 0)) {
      return Response.json(
        {
          ok: false,
          error: "validation_error",
          details: ["QR has no amount set"],
        },
        { status: 400, headers: reqMeta.header() },
      );
    }

    let action = null;
    let payload = {
      amount,
      currency,
      order_reference: reference || code,
      description: `QR Pay ${short(code)}`,
    };
    if (method === "stk") {
      if (!phone_number) {
        return Response.json(
          {
            ok: false,
            error: "validation_error",
            details: ["phone_number is required for stk"],
          },
          { status: 400, headers: reqMeta.header() },
        );
      }
      action = "stk_push";
      payload.phone_number = phone_number;
    } else if (method === "wallet") {
      if (!wallet_no) {
        return Response.json(
          {
            ok: false,
            error: "validation_error",
            details: ["wallet_no is required for wallet"],
          },
          { status: 400, headers: reqMeta.header() },
        );
      }
      action = "wallet_payment";
      payload.wallet_no = wallet_no;
    }

    // Call existing create endpoint to leverage existing DB + idempotency
    const url = `${process.env.APP_URL || ""}/api/payments/lemonade/create`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {}

    if (!res.ok) {
      // Payment creation failed - revert QR code status to allow retry
      await sql`UPDATE qr_codes SET status = 'active', updated_at = NOW() WHERE code = ${code}`;
      
      // record attempt
      try {
        await sql(
          "UPDATE qr_codes SET metadata = COALESCE(metadata,'{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE code = $2",
          [
            JSON.stringify({
              last_failed_attempt: {
                at: new Date().toISOString(),
                method,
                error: data || text || null,
              },
            }),
            code,
          ],
        );
      } catch {}
      return Response.json(
        {
          ok: false,
          error: data?.error || `create_failed_${res.status}`,
          details: data || text || null,
        },
        { status: 200, headers: reqMeta.header() },
      );
    }

    // success path
    const payment_id = data?.payment_id || data?.id || null;
    try {
      await sql(
        "UPDATE qr_codes SET metadata = COALESCE(metadata,'{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE code = $2",
        [
          JSON.stringify({
            last_attempt: {
              at: new Date().toISOString(),
              method,
              ok: true,
              payment_id,
            },
          }),
          code,
        ],
      );
    } catch {}

    return Response.json(
      { ok: true, payment_id, relayed: data?.mode || undefined, data },
      { headers: reqMeta.header() },
    );
  } catch (e) {
    return Response.json(
      { ok: false, error: e?.message || "unknown_error" },
      { status: 500, headers: reqMeta.header() },
    );
  }
}
