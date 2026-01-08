import sql from "@/app/api/utils/sql";
import {
  errorResponse,
  successResponse,
  ErrorCodes,
  withErrorHandling,
} from "@/app/api/utils/errorHandler";

/**
 * POST /api/payment-links/[code]/pay
 * Process payment via payment link (no authentication required for public links)
 * Body: { method, phone_number?, ... } - Payment method details
 */
export const POST = withErrorHandling(async (request, { params: { code } }) => {
  if (!code || typeof code !== 'string') {
    return errorResponse(ErrorCodes.INVALID_INPUT, {
      message: "Payment link code is required",
    });
  }

  // Get payment link
  const link = await sql`
    SELECT * FROM payment_links
    WHERE code = ${code} AND status = 'active'
    LIMIT 1
  `;

  if (link.length === 0) {
    return errorResponse(ErrorCodes.NOT_FOUND, {
      message: "Payment link not found or not active",
    });
  }

  const linkData = link[0];

  // Check expiration
  if (linkData.expires_at && new Date(linkData.expires_at) < new Date()) {
    await sql`UPDATE payment_links SET status = 'expired' WHERE id = ${linkData.id}`;
    return errorResponse(ErrorCodes.INVALID_STATUS, {
      message: "Payment link has expired",
    });
  }

  // Check if already paid
  if (linkData.payment_intent_id) {
    const payment = await sql`
      SELECT status FROM payment_intents WHERE id = ${linkData.payment_intent_id} LIMIT 1
    `;
    if (payment.length > 0 && payment[0].status === 'succeeded') {
      await sql`UPDATE payment_links SET status = 'paid' WHERE id = ${linkData.id}`;
      return errorResponse(ErrorCodes.ALREADY_EXISTS, {
        message: "Payment link has already been paid",
      });
    }
  }

  // Parse request body for payment method
  let body = {};
  try {
    body = await request.json();
  } catch {
    return errorResponse(ErrorCodes.INVALID_JSON, {
      message: "Invalid JSON in request body",
    });
  }

  // Import payment intent creation (dynamically to avoid circular dependencies)
  const { createPaymentIntent } = await import("@/app/api/payments/intent/_helpers.js");

  // Create payment intent
  try {
    const paymentIntent = await createPaymentIntent({
      // NOTE: Payment intents require a `user_id`. For public payment links we
      // currently attach the link owner as the user. If you want true "guest"
      // payments, you'll need a guest-user model or a nullable `user_id`.
      userId: linkData.user_id,
      merchantId: linkData.user_id,
      amount: Number(linkData.amount),
      currency: linkData.currency,
      description: linkData.description || `Payment for link ${code}`,
      metadata: {
        payment_link_id: linkData.id,
        payment_link_code: code,
      },
      fundingPlan: body.fundingPlan || null,
    });

    // Update link with payment intent ID
    await sql`
      UPDATE payment_links
      SET payment_intent_id = ${paymentIntent.id}
      WHERE id = ${linkData.id}
    `;

    // Process payment based on method
    // This would integrate with the existing payment processing system
    // For now, return the payment intent ID for the frontend to handle
    
    return successResponse({
      payment_id: paymentIntent.id,
      payment_intent_id: paymentIntent.id,
      amount: Number(linkData.amount),
      currency: linkData.currency,
      redirect_url: `/pay/success/${paymentIntent.id}`,
    });
  } catch (error) {
    console.error("Payment link payment error:", error);
    return errorResponse(ErrorCodes.PAYMENT_GATEWAY_ERROR, {
      message: "Failed to process payment",
    });
  }
});

