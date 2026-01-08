import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";
import { getOrCreateWallet } from "@/app/api/wallet/_helpers_secure";
import { 
  validatePaymentAmount, 
  validateCurrency, 
  validateMerchantId, 
  validateFundingPlan,
  checkDailyLimits 
} from "@/app/api/utils/validators";
import { 
  rateLimitMiddleware, 
  RATE_LIMITS, 
  generateUserKey 
} from "@/app/api/utils/rateLimiter";
import {
  errorResponse,
  successResponse,
  ErrorCodes,
  withErrorHandling,
} from "@/app/api/utils/errorHandler";

function toNumber(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

export const POST = withErrorHandling(async (request) => {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse(ErrorCodes.UNAUTHORIZED);
  }

  // Rate limiting
  const rateLimitKey = generateUserKey(session.user.id, 'payment_intent');
  const rateLimit = await rateLimitMiddleware(RATE_LIMITS.PAYMENT_INTENT)(request, { userId: session.user.id });
  
  if (rateLimit.blocked) {
    return rateLimit.response;
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return errorResponse(ErrorCodes.INVALID_JSON);
  }

  // Validate and sanitize inputs
  const amountDue = toNumber(body?.amountDue || body?.amount || 0);
  const currency = String(body?.currency || "KES").toUpperCase();
  const merchantId = body?.merchantId ? String(body.merchantId) : null;
  const providedPlan = Array.isArray(body?.fundingPlan) ? body.fundingPlan : null;

  // Validate amount
  const amountValidation = validatePaymentAmount(amountDue, currency);
  if (!amountValidation.valid) {
    return errorResponse(ErrorCodes.INVALID_AMOUNT, {
      message: amountValidation.error
    });
  }

  // Validate currency
  const currencyValidation = validateCurrency(currency);
  if (!currencyValidation.valid) {
    return errorResponse(ErrorCodes.INVALID_CURRENCY, {
      message: currencyValidation.error
    });
  }

  // Validate merchant if provided
  if (merchantId) {
    const merchantValidation = await validateMerchantId(merchantId);
    if (!merchantValidation.valid) {
      return errorResponse(ErrorCodes.NOT_FOUND, {
        message: merchantValidation.error
      });
    }
  }

  // Check daily limits
  const limitsCheck = await checkDailyLimits(session.user.id, amountDue, currency);
  if (!limitsCheck.valid) {
    return errorResponse(ErrorCodes.INSUFFICIENT_FUNDS, {
      message: limitsCheck.error
    });
  }

  // Build funding plan
  let fundingPlan = [];
  if (providedPlan && providedPlan.length) {
    // Validate provided plan
    const planValidation = validateFundingPlan(providedPlan, amountDue);
    if (!planValidation.valid) {
      return errorResponse(ErrorCodes.VALIDATION_ERROR, {
        message: planValidation.error
      });
    }

    fundingPlan = providedPlan.map((fs, index) => ({
      id: fs.id ? String(fs.id) : null,
      type: String(fs.type),
      amount: toNumber(fs.amount),
      priority: Number.isFinite(fs.priority) ? fs.priority : index + 1,
    }));

    // Sort by priority
    fundingPlan.sort((a, b) => a.priority - b.priority);
  } else {
    // Autopilot plan: wallet first, then mpesa; for banks, fall back using virtual sources if available
    const wallet = await getOrCreateWallet(session.user.id, currency);
    const bridgeAvailable = Math.max(0, toNumber(wallet.balance));

    // Load virtual sources
    const sources = await sql(
      "SELECT source, balance, hold FROM wallet_sources WHERE user_id = $1 AND currency = $2 AND status = 'active'",
      [session.user.id, currency],
    );
    const avail = { kcb: 0, dtb: 0, mpesa: 0 };
    for (const r of sources || []) {
      const a = Math.max(0, toNumber(r.balance) - toNumber(r.hold));
      const key = String(r.source);
      if (key === "kcb") avail.kcb = a;
      else if (key === "dtb") avail.dtb = a;
      else if (key === "mpesa") avail.mpesa = a;
    }

    let rem = amountDue;
    const plan = [];
    const take = (type, id, a) => {
      if (rem <= 0) return;
      const t = Math.min(rem, Math.max(0, a));
      if (t > 0) {
        plan.push({ type, id, amount: t });
        rem -= t;
      }
    };

    take("BRIDGE_WALLET", wallet.id, bridgeAvailable);
    if (rem > 0) take("LEMONADE_MPESA", "mpesa", avail.mpesa);
    if (rem > 0) take("LEMONADE_BANK", "kcb", avail.kcb);
    if (rem > 0) take("LEMONADE_BANK", "dtb", avail.dtb);
    if (rem > 0) {
      // still remainder — assign the rest to mpesa as default external source
      plan.push({ type: "LEMONADE_MPESA", id: "mpesa", amount: rem });
      rem = 0;
    }
    // Add priorities in order
    fundingPlan = plan.map((p, i) => ({ ...p, priority: i + 1 }));
  }

  // Persist intent
  const rows = await sql(
    "INSERT INTO payment_intents (user_id, merchant_id, amount_due, currency, status, funding_plan) VALUES ($1,$2,$3,$4,'PENDING',$5::jsonb) RETURNING id, user_id, merchant_id, amount_due, currency, status, funding_plan, created_at",
    [
      session.user.id,
      merchantId,
      amountDue,
      currency,
      JSON.stringify(fundingPlan),
    ],
  );
  const intent = rows[0];

  // Audit log
  try {
    await sql`
      INSERT INTO audit_logs (user_id, action, metadata, created_at)
      VALUES (${session.user.id}, ${'payment_intent_created'}, ${JSON.stringify({
        intentId: intent.id,
        amount: amountDue,
        currency,
        merchantId,
        fundingPlan: fundingPlan.map(p => ({ type: p.type, amount: p.amount }))
      })}, NOW())
    `;
  } catch (auditError) {
    console.error('Audit logging failed:', auditError);
    // Don't fail the request if audit logging fails
  }

  return successResponse({
    intentId: intent.id,
    fundingPlan: intent.funding_plan,
    currency: intent.currency,
    amountDue: intent.amount_due,
  }, 200, rateLimit.headers);
});
