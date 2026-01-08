/**
 * Rate Limiting Utilities
 * Provides Redis-based rate limiting for API endpoints
 */

import { Redis } from 'ioredis';

// Initialize Redis client
let redis;
try {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
} catch (error) {
  console.warn('Redis not available, using in-memory rate limiting');
  redis = null;
}

// In-memory fallback for development
const memoryStore = new Map();

/**
 * Rate limiting configurations
 */
export const RATE_LIMITS = {
  // Authentication endpoints
  LOGIN: { requests: 5, window: 300 }, // 5 attempts per 5 minutes
  REGISTER: { requests: 3, window: 3600 }, // 3 attempts per hour
  
  // Payment endpoints
  PAYMENT_INTENT: { requests: 10, window: 60 }, // 10 payments per minute
  WALLET_TOPUP: { requests: 5, window: 300 }, // 5 topups per 5 minutes
  WALLET_WITHDRAW: { requests: 3, window: 300 }, // 3 withdrawals per 5 minutes
  
  // General API
  API_GENERAL: { requests: 100, window: 60 }, // 100 requests per minute
  API_SENSITIVE: { requests: 20, window: 60 }, // 20 sensitive operations per minute
};

/**
 * Check rate limit for a key
 */
export async function checkRateLimit(key, limit = RATE_LIMITS.API_GENERAL) {
  const { requests, window } = limit;
  
  try {
    if (redis && redis.status === 'ready') {
      return await checkRateLimitRedis(key, requests, window);
    } else {
      return await checkRateLimitMemory(key, requests, window);
    }
  } catch (error) {
    console.error('Rate limit check failed:', error);
    // Fail open - allow request if rate limiting fails
    return { allowed: true, remaining: requests, resetTime: Date.now() + window * 1000 };
  }
}

/**
 * Redis-based rate limiting
 */
async function checkRateLimitRedis(key, requests, window) {
  const multi = redis.multi();
  const now = Date.now();
  const windowStart = now - window * 1000;
  
  // Remove old entries and count current requests
  multi.zremrangebyscore(key, 0, windowStart);
  multi.zcard(key);
  multi.zadd(key, now, `${now}-${Math.random()}`);
  multi.expire(key, window);
  
  const results = await multi.exec();
  const currentRequests = results[1][1];
  
  const allowed = currentRequests < requests;
  const remaining = Math.max(0, requests - currentRequests - 1);
  const resetTime = now + window * 1000;
  
  return {
    allowed,
    remaining,
    resetTime,
    total: requests,
    current: currentRequests + 1,
  };
}

/**
 * Memory-based rate limiting (fallback)
 */
async function checkRateLimitMemory(key, requests, window) {
  const now = Date.now();
  const windowStart = now - window * 1000;
  
  if (!memoryStore.has(key)) {
    memoryStore.set(key, []);
  }
  
  const timestamps = memoryStore.get(key);
  
  // Remove old timestamps
  const validTimestamps = timestamps.filter(ts => ts > windowStart);
  
  const allowed = validTimestamps.length < requests;
  
  if (allowed) {
    validTimestamps.push(now);
  }
  
  memoryStore.set(key, validTimestamps);
  
  // Clean up old entries periodically
  if (Math.random() < 0.01) {
    cleanupMemoryStore();
  }
  
  return {
    allowed,
    remaining: Math.max(0, requests - validTimestamps.length),
    resetTime: now + window * 1000,
    total: requests,
    current: validTimestamps.length,
  };
}

/**
 * Clean up old entries from memory store
 */
function cleanupMemoryStore() {
  const now = Date.now();
  const maxAge = 3600 * 1000; // 1 hour
  
  for (const [key, timestamps] of memoryStore.entries()) {
    const validTimestamps = timestamps.filter(ts => now - ts < maxAge);
    if (validTimestamps.length === 0) {
      memoryStore.delete(key);
    } else {
      memoryStore.set(key, validTimestamps);
    }
  }
}

/**
 * Rate limiting middleware for API routes
 */
export function rateLimitMiddleware(limitConfig = RATE_LIMITS.API_GENERAL, keyGenerator = null) {
  return async (request, context = {}) => {
    try {
      // Generate rate limit key
      const key = keyGenerator ? keyGenerator(request, context) : generateDefaultKey(request);
      
      // Check rate limit
      const result = await checkRateLimit(key, limitConfig);
      
      if (!result.allowed) {
        return {
          blocked: true,
          response: Response.json(
            {
              ok: false,
              error: 'rate_limit_exceeded',
              message: 'Too many requests',
              retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
            },
            {
              status: 429,
              headers: {
                'X-RateLimit-Limit': result.total.toString(),
                'X-RateLimit-Remaining': result.remaining.toString(),
                'X-RateLimit-Reset': result.resetTime.toString(),
                'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
              },
            }
          ),
        };
      }
      
      return {
        blocked: false,
        headers: {
          'X-RateLimit-Limit': result.total.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': result.resetTime.toString(),
        },
      };
    } catch (error) {
      console.error('Rate limiting middleware error:', error);
      // Fail open
      return { blocked: false, headers: {} };
    }
  };
}

/**
 * Generate default rate limit key
 */
function generateDefaultKey(request) {
  const url = new URL(request.url);
  const ip = request.headers.get('x-forwarded-for') || 
            request.headers.get('x-real-ip') || 
            'unknown';
  
  return `rate_limit:${ip}:${url.pathname}`;
}

/**
 * Generate user-specific rate limit key
 */
export function generateUserKey(userId, endpoint) {
  return `rate_limit:user:${userId}:${endpoint}`;
}

/**
 * Generate IP-based rate limit key
 */
export function generateIPKey(request, endpoint) {
  const ip = request.headers.get('x-forwarded-for') || 
            request.headers.get('x-real-ip') || 
            'unknown';
  return `rate_limit:ip:${ip}:${endpoint}`;
}

/**
 * Block IP address temporarily
 */
export async function blockIP(ip, duration = 3600) {
  const key = `blocked_ip:${ip}`;
  
  try {
    if (redis && redis.status === 'ready') {
      await redis.setex(key, duration, '1');
    } else {
      // Memory fallback
      memoryStore.set(key, Date.now() + duration * 1000);
    }
  } catch (error) {
    console.error('Failed to block IP:', error);
  }
}

/**
 * Check if IP is blocked
 */
export async function isIPBlocked(ip) {
  const key = `blocked_ip:${ip}`;
  
  try {
    if (redis && redis.status === 'ready') {
      const result = await redis.get(key);
      return result === '1';
    } else {
      // Memory fallback
      const blockTime = memoryStore.get(key);
      return blockTime && Date.now() < blockTime;
    }
  } catch (error) {
    console.error('Failed to check IP block:', error);
    return false;
  }
}

/**
 * Progressive delay for repeated failures
 */
export function calculateBackoffDelay(attemptCount) {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 60s
  return Math.min(Math.pow(2, attemptCount - 1) * 1000, 60000);
}