/**
 * Security Middleware
 * Applies comprehensive security controls to API routes
 */

import { 
  rateLimitMiddleware, 
  RATE_LIMITS, 
  generateUserKey, 
  generateIPKey,
  isIPBlocked 
} from '../utils/rateLimiter';
import { 
  logSecurityEvent, 
  SECURITY_EVENTS, 
  THREAT_LEVELS,
  securityMiddleware 
} from '../utils/securityMonitor';
import { SECURITY_CONFIG } from '../utils/securityConfig';

/**
 * Apply comprehensive security middleware to API routes
 */
export function withSecurity(handler, options = {}) {
  const {
    rateLimit = RATE_LIMITS.API_GENERAL,
    requireAuth = true,
    roles = [],
    sensitiveOperation = false,
  } = options;

  return async (request, context = {}) => {
    const startTime = Date.now();
    const ip = request.headers.get('x-forwarded-for') || 
              request.headers.get('x-real-ip') || 
              'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const url = new URL(request.url);
    const endpoint = url.pathname;

    try {
      // 1. Apply basic security checks
      const securityCheck = await securityMiddleware()(request, context);
      if (securityCheck.blocked) {
        return securityCheck.response;
      }

      // 2. Apply rate limiting
      const rateLimitKey = context.userId 
        ? generateUserKey(context.userId, endpoint)
        : generateIPKey(request, endpoint);
      
      const rateLimitCheck = await rateLimitMiddleware(
        sensitiveOperation ? RATE_LIMITS.API_SENSITIVE : rateLimit
      )(request, context);
      
      if (rateLimitCheck.blocked) {
        await logSecurityEvent(SECURITY_EVENTS.RATE_LIMIT_EXCEEDED, {
          userId: context.userId,
          ip,
          userAgent,
          endpoint,
          threatLevel: THREAT_LEVELS.MEDIUM,
          metadata: { rateLimitKey }
        });
        return rateLimitCheck.response;
      }

      // 3. Apply authentication if required
      if (requireAuth && !context.userId) {
        await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
          ip,
          userAgent,
          endpoint,
          threatLevel: THREAT_LEVELS.MEDIUM,
          metadata: { reason: 'missing_authentication' }
        });
        
        return Response.json(
          { ok: false, error: 'authentication_required' },
          { status: 401 }
        );
      }

      // 4. Apply role-based access control
      if (roles.length > 0 && context.userRole && !roles.includes(context.userRole)) {
        await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
          userId: context.userId,
          ip,
          userAgent,
          endpoint,
          threatLevel: THREAT_LEVELS.HIGH,
          metadata: { 
            requiredRoles: roles, 
            userRole: context.userRole,
            reason: 'insufficient_privileges'
          }
        });
        
        return Response.json(
          { ok: false, error: 'insufficient_privileges' },
          { status: 403 }
        );
      }

      // 5. Log successful access for sensitive operations
      if (sensitiveOperation) {
        await logSecurityEvent(SECURITY_EVENTS.SENSITIVE_DATA_ACCESS, {
          userId: context.userId,
          ip,
          userAgent,
          endpoint,
          threatLevel: THREAT_LEVELS.LOW,
          metadata: { operation: endpoint }
        });
      }

      // 6. Call the actual handler
      const response = await handler(request, {
        ...context,
        security: {
          ip,
          userAgent,
          endpoint,
          startTime
        }
      });

      // 7. Add security headers to response
      const securityHeaders = {
        ...SECURITY_CONFIG.SECURITY_HEADERS,
        ...rateLimitCheck.headers
      };

      // Clone response to add headers
      const secureResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          ...securityHeaders
        }
      });

      return secureResponse;

    } catch (error) {
      // Log security-related errors
      await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
        userId: context.userId,
        ip,
        userAgent,
        endpoint,
        threatLevel: THREAT_LEVELS.HIGH,
        metadata: { 
          error: error.message,
          stack: error.stack,
          reason: 'handler_error'
        }
      });

      console.error('[Security Middleware] Error:', error);
      
      return Response.json(
        { ok: false, error: 'internal_server_error' },
        { status: 500 }
      );
    }
  };
}

/**
 * Enhanced error handler with security logging
 */
export function withSecurityErrorHandling(handler) {
  return async (request, context = {}) => {
    try {
      return await handler(request, context);
    } catch (error) {
      const ip = request.headers.get('x-forwarded-for') || 
                request.headers.get('x-real-ip') || 
                'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';
      const url = new URL(request.url);
      const endpoint = url.pathname;

      // Log the error for security monitoring
      await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
        userId: context.userId,
        ip,
        userAgent,
        endpoint,
        threatLevel: THREAT_LEVELS.MEDIUM,
        metadata: { 
          error: error.message,
          errorType: error.constructor.name,
          reason: 'unhandled_error'
        }
      });

      console.error('[API Error]', {
        endpoint,
        error: error.message,
        stack: error.stack,
        userId: context.userId,
        ip
      });

      return Response.json(
        { ok: false, error: 'internal_server_error' },
        { status: 500 }
      );
    }
  };
}

/**
 * Middleware for admin-only endpoints
 */
export function withAdminSecurity(handler) {
  return withSecurity(handler, {
    requireAuth: true,
    roles: ['admin'],
    sensitiveOperation: true,
    rateLimit: RATE_LIMITS.API_SENSITIVE
  });
}

/**
 * Middleware for payment endpoints
 */
export function withPaymentSecurity(handler) {
  return withSecurity(handler, {
    requireAuth: true,
    sensitiveOperation: true,
    rateLimit: RATE_LIMITS.PAYMENT_INTENT
  });
}

/**
 * Middleware for wallet endpoints
 */
export function withWalletSecurity(handler) {
  return withSecurity(handler, {
    requireAuth: true,
    sensitiveOperation: true,
    rateLimit: RATE_LIMITS.WALLET_TOPUP
  });
}