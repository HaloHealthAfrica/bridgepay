import sql from "@/app/api/utils/sql";

function toNumber(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

/**
 * Shared helper to create a payment intent record.
 *
 * Note: this intentionally only relies on the core columns that exist across
 * environments (`user_id`, `merchant_id`, `amount_due`, `currency`, `status`,
 * `funding_plan`). Callers can attach additional metadata elsewhere.
 */
export async function createPaymentIntent({
  userId,
  merchantId = null,
  amount,
  currency = "KES",
  fundingPlan = null,
}) {
  if (!userId) throw new Error("userId_required");
  const amountDue = toNumber(amount);
  if (!(amountDue > 0)) throw new Error("invalid_amount");

  const ccy = String(currency || "KES").toUpperCase();

  const plan =
    Array.isArray(fundingPlan) && fundingPlan.length
      ? fundingPlan
      : [{ type: "LEMONADE_MPESA", id: "mpesa", amount: amountDue, priority: 1 }];

  const rows = await sql(
    "INSERT INTO payment_intents (user_id, merchant_id, amount_due, currency, status, funding_plan) VALUES ($1,$2,$3,$4,'PENDING',$5::jsonb) RETURNING id",
    [String(userId), merchantId ? String(merchantId) : null, amountDue, ccy, JSON.stringify(plan)]
  );

  return rows?.[0] || null;
}


