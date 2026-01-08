/**
 * Input Validation Utilities
 * Provides secure validation functions for all user inputs
 */

// Transaction limits per CBK requirements
export const TRANSACTION_LIMITS = {
  KES: {
    MIN_AMOUNT: 1,
    MAX_AMOUNT: 1000000, // 1M KES
    DAILY_LIMIT: 150000, // 150K KES per day
    SINGLE_LIMIT: 50000, // 50K KES per transaction (AML threshold)
  },
  USD: {
    MIN_AMOUNT: 0.01,
    MAX_AMOUNT: 10000,
    DAILY_LIMIT: 1500,
    SINGLE_LIMIT: 500,
  },
  EUR: {
    MIN_AMOUNT: 0.01,
    MAX_AMOUNT: 10000,
    DAILY_LIMIT: 1500,
    SINGLE_LIMIT: 500,
  }
};

export const SUPPORTED_CURRENCIES = ['KES', 'USD', 'EUR'];

/**
 * Validate payment amount
 */
export function validatePaymentAmount(amount, currency = 'KES') {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return { valid: false, error: 'Amount must be a valid number' };
  }
  
  const limits = TRANSACTION_LIMITS[currency];
  if (!limits) {
    return { valid: false, error: 'Unsupported currency' };
  }
  
  if (amount < limits.MIN_AMOUNT) {
    return { valid: false, error: `Amount must be at least ${limits.MIN_AMOUNT} ${currency}` };
  }
  
  if (amount > limits.MAX_AMOUNT) {
    return { valid: false, error: `Amount cannot exceed ${limits.MAX_AMOUNT} ${currency}` };
  }
  
  return { valid: true };
}

/**
 * Validate currency
 */
export function validateCurrency(currency) {
  if (typeof currency !== 'string') {
    return { valid: false, error: 'Currency must be a string' };
  }
  
  const normalizedCurrency = currency.toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(normalizedCurrency)) {
    return { valid: false, error: `Supported currencies: ${SUPPORTED_CURRENCIES.join(', ')}` };
  }
  
  return { valid: true, currency: normalizedCurrency };
}

/**
 * Validate merchant ID
 */
export async function validateMerchantId(merchantId) {
  if (!merchantId || typeof merchantId !== 'string') {
    return { valid: false, error: 'Invalid merchant ID format' };
  }
  
  try {
    const sql = (await import('./sql')).default;
    const rows = await sql`
      SELECT id, role 
      FROM auth_users 
      WHERE id = ${merchantId} 
      AND role IN ('merchant', 'admin') 
      AND created_at IS NOT NULL
      LIMIT 1
    `;
    
    if (!rows || rows.length === 0) {
      return { valid: false, error: 'Merchant not found or inactive' };
    }
    
    return { valid: true };
  } catch (error) {
    console.error('Merchant validation error:', error);
    return { valid: false, error: 'Merchant validation failed' };
  }
}

/**
 * Validate user ID format (UUID)
 */
export function validateUserId(userId) {
  if (!userId || typeof userId !== 'string') {
    return { valid: false, error: 'User ID is required' };
  }
  
  // UUID v4 regex
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(userId)) {
    return { valid: false, error: 'Invalid user ID format' };
  }
  
  return { valid: true };
}

/**
 * Validate phone number (Kenyan format)
 */
export function validatePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required' };
  }
  
  // Kenyan phone number formats: +254XXXXXXXXX, 254XXXXXXXXX, 07XXXXXXXX, 01XXXXXXXX
  const phoneRegex = /^(\+254|254|0)[17]\d{8}$/;
  if (!phoneRegex.test(phone)) {
    return { valid: false, error: 'Invalid Kenyan phone number format' };
  }
  
  return { valid: true };
}

/**
 * Validate email address
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  if (email.length > 254) {
    return { valid: false, error: 'Email too long' };
  }
  
  return { valid: true };
}

/**
 * Sanitize string input
 */
export function sanitizeString(input, maxLength = 255) {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, ''); // Remove potential XSS characters
}

/**
 * Validate funding plan
 */
export function validateFundingPlan(fundingPlan, totalAmount) {
  if (!Array.isArray(fundingPlan)) {
    return { valid: false, error: 'Funding plan must be an array' };
  }
  
  if (fundingPlan.length === 0) {
    return { valid: false, error: 'Funding plan cannot be empty' };
  }
  
  if (fundingPlan.length > 10) {
    return { valid: false, error: 'Too many funding sources (max 10)' };
  }
  
  const validTypes = ['BRIDGE_WALLET', 'LEMONADE_MPESA', 'LEMONADE_BANK', 'LEMONADE_CARD'];
  let sum = 0;
  
  for (const source of fundingPlan) {
    if (!source || typeof source !== 'object') {
      return { valid: false, error: 'Invalid funding source format' };
    }
    
    if (!validTypes.includes(source.type)) {
      return { valid: false, error: `Invalid funding type: ${source.type}` };
    }
    
    const amount = Number(source.amount);
    if (!amount || amount <= 0) {
      return { valid: false, error: 'Invalid funding amount' };
    }
    
    sum += amount;
  }
  
  // Allow small rounding differences (1 cent)
  if (Math.abs(sum - totalAmount) > 0.01) {
    return { valid: false, error: 'Funding plan sum does not match total amount' };
  }
  
  return { valid: true };
}

/**
 * Check daily transaction limits
 */
export async function checkDailyLimits(userId, amount, currency = 'KES') {
  const limits = TRANSACTION_LIMITS[currency];
  if (!limits) {
    return { valid: false, error: 'Unsupported currency' };
  }
  
  // Check single transaction limit
  if (amount > limits.SINGLE_LIMIT) {
    // Flag for AML review but don't block
    await flagSuspiciousActivity(userId, 'large_transaction', { amount, currency });
  }
  
  try {
    const sql = (await import('./sql')).default;
    const today = new Date().toISOString().split('T')[0];
    
    const dailyTotal = await sql`
      SELECT COALESCE(SUM(amount_due), 0) as total
      FROM payment_intents 
      WHERE user_id = ${userId} 
      AND DATE(created_at) = ${today}
      AND status NOT IN ('CANCELLED', 'FAILED')
    `;
    
    const currentTotal = Number(dailyTotal[0]?.total || 0);
    
    if (currentTotal + amount > limits.DAILY_LIMIT) {
      return { 
        valid: false, 
        error: `Daily limit exceeded. Limit: ${limits.DAILY_LIMIT} ${currency}, Current: ${currentTotal} ${currency}` 
      };
    }
    
    return { valid: true, currentTotal };
  } catch (error) {
    console.error('Daily limit check error:', error);
    return { valid: false, error: 'Unable to verify daily limits' };
  }
}

/**
 * Flag suspicious activity for AML monitoring
 */
async function flagSuspiciousActivity(userId, activityType, metadata = {}) {
  try {
    const sql = (await import('./sql')).default;
    await sql`
      INSERT INTO audit_logs (user_id, action, metadata, created_at)
      VALUES (${userId}, ${'suspicious_activity'}, ${JSON.stringify({
        type: activityType,
        ...metadata,
        flagged_at: new Date().toISOString()
      })}, NOW())
    `;
    
    // In production, this would also trigger alerts to compliance team
    console.warn(`[AML] Suspicious activity flagged for user ${userId}:`, activityType, metadata);
  } catch (error) {
    console.error('Failed to flag suspicious activity:', error);
  }
}