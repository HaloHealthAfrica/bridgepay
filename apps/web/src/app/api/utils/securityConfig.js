/**
 * Security Configuration
 * Centralized security settings and constants
 */

// Environment-based security settings
export const SECURITY_CONFIG = {
  // Session security
  SESSION: {
    MAX_AGE: 30 * 24 * 60 * 60, // 30 days
    UPDATE_AGE: 24 * 60 * 60, // 24 hours
    SECURE_COOKIES: process.env.NODE_ENV === 'production',
    SAME_SITE: 'lax',
    HTTP_ONLY: true,
  },

  // Password requirements
  PASSWORD: {
    MIN_LENGTH: 8,
    REQUIRE_UPPERCASE: true,
    REQUIRE_LOWERCASE: true,
    REQUIRE_NUMBERS: true,
    REQUIRE_SPECIAL: true,
    MAX_AGE_DAYS: 90, // Force password change after 90 days
    HISTORY_COUNT: 5, // Remember last 5 passwords
  },

  // Account lockout
  LOCKOUT: {
    MAX_FAILED_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60, // 15 minutes
    PROGRESSIVE_DELAY: true,
  },

  // Rate limiting
  RATE_LIMITS: {
    GLOBAL: { requests: 1000, window: 60 }, // 1000 requests per minute
    AUTH: { requests: 5, window: 300 }, // 5 auth attempts per 5 minutes
    PAYMENT: { requests: 10, window: 60 }, // 10 payments per minute
    SENSITIVE: { requests: 20, window: 60 }, // 20 sensitive ops per minute
  },

  // IP blocking
  IP_BLOCKING: {
    AUTO_BLOCK_THRESHOLD: 100, // Auto-block after 100 violations
    DEFAULT_BLOCK_DURATION: 3600, // 1 hour
    PERMANENT_BLOCK_THRESHOLD: 1000, // Permanent block after 1000 violations
  },

  // AML/Compliance
  AML: {
    SINGLE_TRANSACTION_THRESHOLD: 50000, // KES - flag for review
    DAILY_LIMIT_DEFAULT: 150000, // KES - CBK requirement
    VELOCITY_CHECK_WINDOW: 300, // 5 minutes
    VELOCITY_CHECK_THRESHOLD: 10, // 10 transactions in 5 minutes
    RISK_SCORE_THRESHOLD: 75, // Auto-flag transactions with risk score > 75
  },

  // Data protection
  DATA_PROTECTION: {
    ENCRYPT_PII: true,
    MASK_SENSITIVE_LOGS: true,
    DATA_RETENTION_DAYS: 2555, // 7 years for financial records
    AUDIT_LOG_RETENTION_DAYS: 2555,
  },

  // Security headers
  SECURITY_HEADERS: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  },

  // CORS settings
  CORS: {
    ALLOWED_ORIGINS: process.env.NODE_ENV === 'production' 
      ? [process.env.FRONTEND_URL, process.env.ADMIN_URL].filter(Boolean)
      : ['http://localhost:3000', 'http://localhost:4000'],
    ALLOWED_METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    ALLOWED_HEADERS: ['Content-Type', 'Authorization', 'X-Requested-With'],
    CREDENTIALS: true,
  },

  // Content Security Policy
  CSP: {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  },
};

// Security validation patterns
export const SECURITY_PATTERNS = {
  // SQL injection detection
  SQL_INJECTION: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
    /(--|\/\*|\*\/)/,
    /(\b(OR|AND)\b.*=.*)/i,
    /(1=1|1=0)/,
    /(\bUNION\b.*\bSELECT\b)/i,
    /(\bINTO\b.*\bOUTFILE\b)/i,
    /(\bLOAD_FILE\b)/i,
  ],

  // XSS detection
  XSS: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe\b/i,
    /<object\b/i,
    /<embed\b/i,
    /<link\b/i,
    /<meta\b/i,
  ],

  // Path traversal
  PATH_TRAVERSAL: [
    /\.\.\//,
    /\.\.\\/,
    /%2e%2e%2f/i,
    /%2e%2e%5c/i,
    /\.\.%2f/i,
    /\.\.%5c/i,
  ],

  // Command injection
  COMMAND_INJECTION: [
    /[;&|`$()]/,
    /\b(cat|ls|pwd|whoami|id|uname|wget|curl)\b/i,
  ],
};

// Trusted domains and IPs
export const TRUSTED_SOURCES = {
  // Internal IP ranges
  INTERNAL_IPS: [
    '127.0.0.1',
    '::1',
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
  ],

  // Trusted domains for webhooks
  WEBHOOK_DOMAINS: [
    'stripe.com',
    'lemonade.co.ke',
    // Add other trusted payment providers
  ],

  // Admin IP whitelist (if needed)
  ADMIN_IPS: process.env.ADMIN_IP_WHITELIST 
    ? process.env.ADMIN_IP_WHITELIST.split(',')
    : [],
};

// Security event severity mapping
export const SEVERITY_MAPPING = {
  // Critical - immediate action required
  CRITICAL: [
    'sql_injection_attempt',
    'privilege_escalation',
    'data_breach_attempt',
    'system_compromise',
  ],

  // High - urgent attention needed
  HIGH: [
    'xss_attempt',
    'csrf_violation',
    'unauthorized_admin_access',
    'suspicious_login',
    'account_takeover_attempt',
  ],

  // Medium - monitor and investigate
  MEDIUM: [
    'rapid_transactions',
    'unusual_pattern',
    'failed_authentication',
    'rate_limit_exceeded',
  ],

  // Low - log for analysis
  LOW: [
    'login_success',
    'normal_transaction',
    'api_access',
  ],
};

// Compliance requirements
export const COMPLIANCE_CONFIG = {
  // CBK (Central Bank of Kenya) requirements
  CBK: {
    TRANSACTION_LIMITS: {
      KES: {
        DAILY: 150000,
        SINGLE: 50000,
        MONTHLY: 1000000,
      }
    },
    REPORTING_THRESHOLDS: {
      LARGE_TRANSACTION: 50000, // KES
      SUSPICIOUS_PATTERN: 25000, // KES
    },
    DATA_RETENTION: 2555, // 7 years in days
    AML_MONITORING: true,
  },

  // GDPR/Kenya DPA requirements
  DATA_PROTECTION: {
    CONSENT_REQUIRED: true,
    RIGHT_TO_DELETION: true,
    DATA_PORTABILITY: true,
    BREACH_NOTIFICATION_HOURS: 72,
    PRIVACY_BY_DESIGN: true,
  },

  // PCI DSS requirements (if handling cards directly)
  PCI_DSS: {
    ENCRYPT_CARD_DATA: true,
    SECURE_TRANSMISSION: true,
    ACCESS_CONTROL: true,
    REGULAR_TESTING: true,
  },
};

// Security monitoring thresholds
export const MONITORING_THRESHOLDS = {
  // Failed login attempts
  FAILED_LOGINS: {
    USER_THRESHOLD: 5, // per user
    IP_THRESHOLD: 20, // per IP
    GLOBAL_THRESHOLD: 100, // globally
    TIME_WINDOW: 300, // 5 minutes
  },

  // Transaction velocity
  TRANSACTION_VELOCITY: {
    USER_THRESHOLD: 10, // transactions per user
    AMOUNT_THRESHOLD: 100000, // KES per user
    TIME_WINDOW: 300, // 5 minutes
  },

  // API abuse
  API_ABUSE: {
    ERROR_RATE_THRESHOLD: 0.5, // 50% error rate
    REQUEST_SPIKE_THRESHOLD: 10, // 10x normal rate
    TIME_WINDOW: 60, // 1 minute
  },
};

/**
 * Get security configuration for environment
 */
export function getSecurityConfig() {
  return {
    ...SECURITY_CONFIG,
    environment: process.env.NODE_ENV,
    debug: process.env.NODE_ENV !== 'production',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check if IP is in trusted range
 */
export function isTrustedIP(ip) {
  if (!ip) return false;
  
  // Check if IP is in internal ranges
  return TRUSTED_SOURCES.INTERNAL_IPS.some(range => {
    if (range.includes('/')) {
      // CIDR notation - would need IP range checking library
      return false; // Simplified for now
    }
    return ip === range;
  });
}

/**
 * Get CSP header value
 */
export function getCSPHeader() {
  return Object.entries(SECURITY_CONFIG.CSP)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password) {
  const config = SECURITY_CONFIG.PASSWORD;
  const errors = [];

  if (password.length < config.MIN_LENGTH) {
    errors.push(`Password must be at least ${config.MIN_LENGTH} characters long`);
  }

  if (config.REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (config.REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (config.REQUIRE_NUMBERS && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (config.REQUIRE_SPECIAL && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    valid: errors.length === 0,
    errors,
    strength: calculatePasswordStrength(password),
  };
}

/**
 * Calculate password strength score
 */
function calculatePasswordStrength(password) {
  let score = 0;
  
  // Length bonus
  score += Math.min(password.length * 2, 20);
  
  // Character variety bonus
  if (/[a-z]/.test(password)) score += 5;
  if (/[A-Z]/.test(password)) score += 5;
  if (/\d/.test(password)) score += 5;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 10;
  
  // Pattern penalties
  if (/(.)\1{2,}/.test(password)) score -= 10; // Repeated characters
  if (/123|abc|qwe/i.test(password)) score -= 10; // Common patterns
  
  return Math.max(0, Math.min(100, score));
}