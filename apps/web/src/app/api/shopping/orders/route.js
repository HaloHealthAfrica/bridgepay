import { auth } from "@/auth";
import {
  OrderService,
  ShopService,
  ProductService,
} from "@/app/api/shopping/_services";
import {
  errorResponse,
  successResponse,
  ErrorCodes,
  withErrorHandling,
} from "@/app/api/utils/errorHandler";
import * as yup from "yup";
import { CommonSchemas } from "@/app/api/middleware/validate";
import { normalizeCurrency } from "@/app/api/utils/currencies";
import { parsePaginationParams, createPaginationResponse, processPaginatedResults } from "@/app/api/utils/pagination";
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
  validateUserId,
  validatePaymentAmount,
  checkDailyLimits 
} from "@/app/api/utils/validators";

const createOrderSchema = yup.object({
  shopId: yup.string().uuid().required("Shop ID is required"),
  items: yup
    .array()
    .of(
      yup.object({
        product_id: yup.string().uuid().required(),
        quantity: yup.number().integer().positive().required(),
      })
    )
    .min(1, "At least one item is required")
    .required("Items are required"),
  paymentMode: yup.string().oneOf(['PAY_NOW', 'ESCROW', 'INSTALLMENT']).default('PAY_NOW'),
  currency: CommonSchemas.currency,
});

/**
 * GET /api/shopping/orders
 * List orders for authenticated user
 * Query params: limit (default: 20), cursor (optional), shopId (optional filter)
 */
export const GET = withErrorHandling(async (request) => {
  const ip = request.headers.get('x-forwarded-for') || 
            request.headers.get('x-real-ip') || 
            'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  const session = await auth();
  if (!session?.user?.id) {
    await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
      ip,
      userAgent,
      endpoint: '/api/shopping/orders',
      threatLevel: THREAT_LEVELS.MEDIUM,
      metadata: { reason: 'missing_authentication' }
    });
    return errorResponse(ErrorCodes.UNAUTHORIZED);
  }

  // Validate user ID
  const userIdValidation = validateUserId(session.user.id);
  if (!userIdValidation.valid) {
    await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
      userId: session.user.id,
      ip,
      userAgent,
      endpoint: '/api/shopping/orders',
      threatLevel: THREAT_LEVELS.HIGH,
      metadata: { reason: 'invalid_user_id', error: userIdValidation.error }
    });
    return errorResponse(ErrorCodes.VALIDATION_ERROR, { message: userIdValidation.error });
  }

  // Rate limiting
  const rateLimitKey = generateUserKey(session.user.id, 'shopping_orders');
  const rateLimit = await rateLimitMiddleware(RATE_LIMITS.API_GENERAL)(request, { userId: session.user.id });
  
  if (rateLimit.blocked) {
    return rateLimit.response;
  }

  // Log sensitive data access
  await logSecurityEvent(SECURITY_EVENTS.SENSITIVE_DATA_ACCESS, {
    userId: session.user.id,
    ip,
    userAgent,
    endpoint: '/api/shopping/orders',
    threatLevel: THREAT_LEVELS.LOW,
    metadata: { operation: 'list_orders' }
  });

  const { searchParams } = new URL(request.url);
  const { limit, cursor } = parsePaginationParams(searchParams);
  const shopId = searchParams.get("shopId") || null;

  // Build query with pagination
  let query = sql`
    SELECT * FROM orders
    WHERE customer_user_id = ${session.user.id}
  `;

  if (shopId) {
    query = sql`${query} AND shop_id = ${shopId}`;
  }

  if (cursor) {
    query = sql`${query} AND created_at < ${new Date(cursor)}`;
  }

  query = sql`${query} ORDER BY created_at DESC LIMIT ${limit + 1}`;

  const rows = await query;
  const { items, cursor: nextCursor, hasMore } = processPaginatedResults(rows, limit);

  return successResponse(
    createPaginationResponse(items, nextCursor, hasMore, limit),
    200,
    rateLimit.headers
  );
});

/**
 * POST /api/shopping/orders
 * Create a new order
 * Body: { shopId, items[], paymentMode?, currency? }
 */
export const POST = withErrorHandling(async (request) => {
  const ip = request.headers.get('x-forwarded-for') || 
            request.headers.get('x-real-ip') || 
            'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  const session = await auth();
  if (!session?.user?.id) {
    await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
      ip,
      userAgent,
      endpoint: '/api/shopping/orders',
      threatLevel: THREAT_LEVELS.MEDIUM,
      metadata: { reason: 'missing_authentication' }
    });
    return errorResponse(ErrorCodes.UNAUTHORIZED);
  }

  // Validate user ID
  const userIdValidation = validateUserId(session.user.id);
  if (!userIdValidation.valid) {
    await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
      userId: session.user.id,
      ip,
      userAgent,
      endpoint: '/api/shopping/orders',
      threatLevel: THREAT_LEVELS.HIGH,
      metadata: { reason: 'invalid_user_id', error: userIdValidation.error }
    });
    return errorResponse(ErrorCodes.VALIDATION_ERROR, { message: userIdValidation.error });
  }

  // Rate limiting for order creation
  const rateLimitKey = generateUserKey(session.user.id, 'create_order');
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
      endpoint: '/api/shopping/orders',
      threatLevel: THREAT_LEVELS.MEDIUM,
      metadata: { reason: 'malformed_json' }
    });
    return errorResponse(ErrorCodes.INVALID_JSON, {
      message: "Invalid JSON in request body",
    });
  }

  // Validate with Yup schema
  let validated;
  try {
    validated = await createOrderSchema.validate(body, {
      abortEarly: false,
      stripUnknown: true,
    });
  } catch (validationError) {
    if (validationError.name === "ValidationError") {
      const errors = {};
      if (validationError.inner && validationError.inner.length > 0) {
        validationError.inner.forEach((err) => {
          if (err.path) {
            errors[err.path] = err.message;
          }
        });
      } else if (validationError.path) {
        errors[validationError.path] = validationError.message;
      }

      return errorResponse(ErrorCodes.VALIDATION_ERROR, {
        message: "Validation failed",
        details: { errors, summary: validationError.message },
      });
    }
    throw validationError;
  }

  // Log order creation attempt
  await logSecurityEvent(SECURITY_EVENTS.SENSITIVE_DATA_ACCESS, {
    userId: session.user.id,
    ip,
    userAgent,
    endpoint: '/api/shopping/orders',
    threatLevel: THREAT_LEVELS.LOW,
    metadata: { 
      operation: 'create_order',
      shopId: validated.shopId,
      itemCount: validated.items.length,
      paymentMode: validated.paymentMode
    }
  });

  // Customer is the current user
  const order = await OrderService.createOrder({
    shopId: validated.shopId,
    customerUserId: session.user.id,
    items: validated.items,
    currency: normalizeCurrency(validated.currency),
    paymentMode: validated.paymentMode,
  });

  return successResponse({ order }, 201, rateLimit.headers);
});
