/**
 * Security Monitoring System
 * Provides real-time security monitoring and threat detection
 */

import sql from './sql';
import { blockIP, isIPBlocked } from './rateLimiter';

/**
 * Security event types
 */
export const SECURITY_EVENTS = {
  // Authentication
  LOGIN_FAILED: 'login_failed',
  LOGIN_SUCCESS: 'login_success',
  ACCOUNT_LOCKED: 'account_locked',
  SUSPICIOUS_LOGIN: 'suspicious_login',
  
  // Authorization
  UNAUTHORIZED_ACCESS: 'unauthorized_access',
  PRIVILEGE_ESCALATION: 'privilege_escalation',
  
  // Financial
  LARGE_TRANSACTION: 'large_transaction',
  RAPID_TRANSACTIONS: 'rapid_transactions',
  UNUSUAL_PATTERN: 'unusual_pattern',
  DAILY_LIMIT_EXCEEDED: 'daily_limit_exceeded',
  
  // Technical
  SQL_INJECTION_ATTEMPT: 'sql_injection_attempt',
  XSS_ATTEMPT: 'xss_attempt',
  CSRF_VIOLATION: 'csrf_violation',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  
  // Data
  SENSITIVE_DATA_ACCESS: 'sensitive_data_access',
  DATA_EXPORT: 'data_export',
  BULK_OPERATION: 'bulk_operation',
};

/**
 * Security threat levels
 */
export const THREAT_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

/**
 * Log security event
 */
export async function logSecurityEvent(eventType, details = {}) {
  const {
    userId = null,
    ip = null,
    userAgent = null,
    endpoint = null,
    threatLevel = THREAT_LEVELS.LOW,
    metadata = {},
  } = details;

  try {
    await sql`
      INSERT INTO security_events (
        event_type, 
        user_id, 
        ip_address, 
        user_agent, 
        endpoint, 
        threat_level, 
        metadata, 
        created_at
      )
      VALUES (
        ${eventType}, 
        ${userId}, 
        ${ip}, 
        ${userAgent}, 
        ${endpoint}, 
        ${threatLevel}, 
        ${JSON.stringify(metadata)}, 
        NOW()
      )
    `;

    // Handle high-threat events
    if (threatLevel === THREAT_LEVELS.HIGH || threatLevel === THREAT_LEVELS.CRITICAL) {
      await handleHighThreatEvent(eventType, details);
    }

    // Check for patterns
    await checkSecurityPatterns(eventType, details);

  } catch (error) {
    console.error('Failed to log security event:', error);
    // Don't throw - security logging should not break the application
  }
}

/**
 * Handle high-threat security events
 */
async function handleHighThreatEvent(eventType, details) {
  const { userId, ip } = details;

  try {
    // Block IP for critical threats
    if (details.threatLevel === THREAT_LEVELS.CRITICAL && ip) {
      await blockIP(ip, 3600); // Block for 1 hour
      console.warn(`[SECURITY] IP ${ip} blocked due to critical threat: ${eventType}`);
    }

    // Lock account for certain events
    if (userId && [
      SECURITY_EVENTS.PRIVILEGE_ESCALATION,
      SECURITY_EVENTS.SUSPICIOUS_LOGIN,
    ].includes(eventType)) {
      await lockUserAccount(userId, `Security event: ${eventType}`);
    }

    // Send alert to security team
    await sendSecurityAlert(eventType, details);

  } catch (error) {
    console.error('Failed to handle high-threat event:', error);
  }
}

/**
 * Check for security patterns and anomalies
 */
async function checkSecurityPatterns(eventType, details) {
  const { userId, ip } = details;

  try {
    // Check for repeated failed logins
    if (eventType === SECURITY_EVENTS.LOGIN_FAILED) {
      await checkRepeatedFailedLogins(userId, ip);
    }

    // Check for rapid transactions
    if (eventType === SECURITY_EVENTS.LARGE_TRANSACTION && userId) {
      await checkRapidTransactions(userId);
    }

    // Check for suspicious IP patterns
    if (ip) {
      await checkSuspiciousIPPatterns(ip);
    }

  } catch (error) {
    console.error('Failed to check security patterns:', error);
  }
}

/**
 * Check for repeated failed login attempts
 */
async function checkRepeatedFailedLogins(userId, ip) {
  const timeWindow = 15 * 60 * 1000; // 15 minutes
  const threshold = 5;

  try {
    const recentFailures = await sql`
      SELECT COUNT(*) as count
      FROM security_events
      WHERE event_type = ${SECURITY_EVENTS.LOGIN_FAILED}
      AND (user_id = ${userId} OR ip_address = ${ip})
      AND created_at > NOW() - INTERVAL '15 minutes'
    `;

    const failureCount = parseInt(recentFailures[0]?.count || 0);

    if (failureCount >= threshold) {
      await logSecurityEvent(SECURITY_EVENTS.ACCOUNT_LOCKED, {
        userId,
        ip,
        threatLevel: THREAT_LEVELS.HIGH,
        metadata: { failureCount, timeWindow: '15 minutes' },
      });

      if (userId) {
        await lockUserAccount(userId, `Too many failed login attempts: ${failureCount}`);
      }

      if (ip) {
        await blockIP(ip, 1800); // Block for 30 minutes
      }
    }
  } catch (error) {
    console.error('Failed to check repeated failed logins:', error);
  }
}

/**
 * Check for rapid transaction patterns
 */
async function checkRapidTransactions(userId) {
  const timeWindow = 5 * 60 * 1000; // 5 minutes
  const threshold = 10;

  try {
    const recentTransactions = await sql`
      SELECT COUNT(*) as count
      FROM payment_intents
      WHERE user_id = ${userId}
      AND created_at > NOW() - INTERVAL '5 minutes'
    `;

    const transactionCount = parseInt(recentTransactions[0]?.count || 0);

    if (transactionCount >= threshold) {
      await logSecurityEvent(SECURITY_EVENTS.RAPID_TRANSACTIONS, {
        userId,
        threatLevel: THREAT_LEVELS.MEDIUM,
        metadata: { transactionCount, timeWindow: '5 minutes' },
      });
    }
  } catch (error) {
    console.error('Failed to check rapid transactions:', error);
  }
}

/**
 * Check for suspicious IP patterns
 */
async function checkSuspiciousIPPatterns(ip) {
  try {
    // Check if IP is already blocked
    if (await isIPBlocked(ip)) {
      return;
    }

    // Check for multiple event types from same IP
    const recentEvents = await sql`
      SELECT DISTINCT event_type, COUNT(*) as count
      FROM security_events
      WHERE ip_address = ${ip}
      AND created_at > NOW() - INTERVAL '1 hour'
      GROUP BY event_type
    `;

    const eventTypes = recentEvents.length;
    const totalEvents = recentEvents.reduce((sum, event) => sum + parseInt(event.count), 0);

    // Suspicious if many different event types or high volume
    if (eventTypes >= 5 || totalEvents >= 50) {
      await logSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_LOGIN, {
        ip,
        threatLevel: THREAT_LEVELS.HIGH,
        metadata: { eventTypes, totalEvents, timeWindow: '1 hour' },
      });
    }
  } catch (error) {
    console.error('Failed to check suspicious IP patterns:', error);
  }
}

/**
 * Lock user account
 */
async function lockUserAccount(userId, reason) {
  try {
    await sql`
      UPDATE auth_users 
      SET 
        account_locked = true,
        locked_at = NOW(),
        lock_reason = ${reason}
      WHERE id = ${userId}
    `;

    console.warn(`[SECURITY] User account ${userId} locked: ${reason}`);
  } catch (error) {
    console.error('Failed to lock user account:', error);
  }
}

/**
 * Send security alert
 */
async function sendSecurityAlert(eventType, details) {
  try {
    // In production, this would send alerts via email, Slack, PagerDuty, etc.
    const alert = {
      timestamp: new Date().toISOString(),
      eventType,
      threatLevel: details.threatLevel,
      userId: details.userId,
      ip: details.ip,
      endpoint: details.endpoint,
      metadata: details.metadata,
    };

    console.error('[SECURITY ALERT]', JSON.stringify(alert, null, 2));

    // Store alert for dashboard
    await sql`
      INSERT INTO security_alerts (
        event_type,
        threat_level,
        user_id,
        ip_address,
        details,
        status,
        created_at
      )
      VALUES (
        ${eventType},
        ${details.threatLevel},
        ${details.userId},
        ${details.ip},
        ${JSON.stringify(alert)},
        'open',
        NOW()
      )
    `;
  } catch (error) {
    console.error('Failed to send security alert:', error);
  }
}

/**
 * Security middleware for API routes
 */
export function securityMiddleware() {
  return async (request, context = {}) => {
    const ip = request.headers.get('x-forwarded-for') || 
              request.headers.get('x-real-ip') || 
              'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const url = new URL(request.url);
    const endpoint = url.pathname;

    try {
      // Check if IP is blocked
      if (await isIPBlocked(ip)) {
        await logSecurityEvent(SECURITY_EVENTS.UNAUTHORIZED_ACCESS, {
          ip,
          userAgent,
          endpoint,
          threatLevel: THREAT_LEVELS.HIGH,
          metadata: { reason: 'blocked_ip' },
        });

        return {
          blocked: true,
          response: Response.json(
            { ok: false, error: 'access_denied' },
            { status: 403 }
          ),
        };
      }

      // Check for suspicious patterns in request
      await checkRequestSecurity(request, { ip, userAgent, endpoint });

      return { blocked: false };
    } catch (error) {
      console.error('Security middleware error:', error);
      return { blocked: false }; // Fail open
    }
  };
}

/**
 * Check request for security issues
 */
async function checkRequestSecurity(request, context) {
  const { ip, userAgent, endpoint } = context;

  try {
    // Check for SQL injection patterns
    const url = new URL(request.url);
    const queryString = url.search;
    
    if (containsSQLInjectionPatterns(queryString)) {
      await logSecurityEvent(SECURITY_EVENTS.SQL_INJECTION_ATTEMPT, {
        ip,
        userAgent,
        endpoint,
        threatLevel: THREAT_LEVELS.CRITICAL,
        metadata: { queryString },
      });
    }

    // Check for XSS patterns
    if (containsXSSPatterns(queryString)) {
      await logSecurityEvent(SECURITY_EVENTS.XSS_ATTEMPT, {
        ip,
        userAgent,
        endpoint,
        threatLevel: THREAT_LEVELS.HIGH,
        metadata: { queryString },
      });
    }

    // Check for suspicious user agents
    if (isSuspiciousUserAgent(userAgent)) {
      await logSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_LOGIN, {
        ip,
        userAgent,
        endpoint,
        threatLevel: THREAT_LEVELS.MEDIUM,
        metadata: { reason: 'suspicious_user_agent' },
      });
    }
  } catch (error) {
    console.error('Failed to check request security:', error);
  }
}

/**
 * Check for SQL injection patterns
 */
function containsSQLInjectionPatterns(input) {
  if (!input || typeof input !== 'string') return false;
  
  const patterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
    /(--|\/\*|\*\/)/,
    /(\b(OR|AND)\b.*=.*)/i,
    /(1=1|1=0)/,
    /(\bUNION\b.*\bSELECT\b)/i,
  ];
  
  return patterns.some(pattern => pattern.test(input));
}

/**
 * Check for XSS patterns
 */
function containsXSSPatterns(input) {
  if (!input || typeof input !== 'string') return false;
  
  const patterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe\b/i,
    /<object\b/i,
    /<embed\b/i,
  ];
  
  return patterns.some(pattern => pattern.test(input));
}

/**
 * Check for suspicious user agents
 */
function isSuspiciousUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') return true;
  
  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /^$/,
  ];
  
  return suspiciousPatterns.some(pattern => pattern.test(userAgent));
}

/**
 * Get security dashboard data
 */
export async function getSecurityDashboard(timeRange = '24 hours') {
  try {
    const events = await sql`
      SELECT 
        event_type,
        threat_level,
        COUNT(*) as count,
        DATE_TRUNC('hour', created_at) as hour
      FROM security_events
      WHERE created_at > NOW() - INTERVAL ${timeRange}
      GROUP BY event_type, threat_level, hour
      ORDER BY hour DESC
    `;

    const alerts = await sql`
      SELECT *
      FROM security_alerts
      WHERE created_at > NOW() - INTERVAL ${timeRange}
      AND status = 'open'
      ORDER BY created_at DESC
    `;

    const blockedIPs = await sql`
      SELECT DISTINCT ip_address, COUNT(*) as event_count
      FROM security_events
      WHERE created_at > NOW() - INTERVAL ${timeRange}
      AND threat_level IN ('high', 'critical')
      GROUP BY ip_address
      ORDER BY event_count DESC
      LIMIT 10
    `;

    return {
      events: events || [],
      alerts: alerts || [],
      blockedIPs: blockedIPs || [],
      timeRange,
    };
  } catch (error) {
    console.error('Failed to get security dashboard data:', error);
    return { events: [], alerts: [], blockedIPs: [], timeRange };
  }
}