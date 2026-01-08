/**
 * Circuit Breaker for External Services
 * Implements circuit breaker pattern to prevent cascading failures
 */

// `opossum` is CommonJS. In ESM builds (React Router/Vite SSR), import it as default.
import CircuitBreaker from 'opossum';

const defaultOptions = {
  timeout: 3000, // 3 second timeout
  errorThresholdPercentage: 50, // Open after 50% errors
  resetTimeout: 30000, // Try again after 30 seconds
  rollingCountTimeout: 60000, // Rolling window of 60 seconds
  rollingCountBuckets: 10, // 10 buckets in rolling window
  name: 'default',
};

/**
 * Create a circuit breaker for an external service
 */
export function createCircuitBreaker(fn, options = {}) {
  const config = { ...defaultOptions, ...options };
  const breaker = new CircuitBreaker(fn, config);

  // Event handlers with enhanced logging
  breaker.on('open', () => {
    console.error(`[Circuit Breaker] ${config.name} OPENED - too many failures`, {
      name: config.name,
      state: 'OPEN',
      timestamp: new Date().toISOString(),
      stats: breaker.stats,
    });
    // TODO: Send alert to monitoring system (Sentry, PagerDuty, etc.)
  });

  breaker.on('halfOpen', () => {
    console.log(`[Circuit Breaker] ${config.name} HALF-OPEN - testing connection`, {
      name: config.name,
      state: 'HALF_OPEN',
      timestamp: new Date().toISOString(),
    });
  });

  breaker.on('close', () => {
    console.log(`[Circuit Breaker] ${config.name} CLOSED - service recovered`, {
      name: config.name,
      state: 'CLOSED',
      timestamp: new Date().toISOString(),
      stats: breaker.stats,
    });
  });

  breaker.on('reject', () => {
    console.warn(`[Circuit Breaker] ${config.name} REJECTED - circuit is open`, {
      name: config.name,
      state: breaker.status,
      timestamp: new Date().toISOString(),
    });
  });

  breaker.on('timeout', () => {
    console.warn(`[Circuit Breaker] ${config.name} TIMEOUT`, {
      name: config.name,
      timestamp: new Date().toISOString(),
    });
  });

  breaker.on('failure', (error) => {
    console.error(`[Circuit Breaker] ${config.name} FAILURE`, {
      name: config.name,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  });

  breaker.on('success', () => {
    // Only log in debug mode to avoid noise
    if (process.env.NODE_ENV === 'development' && process.env.DEBUG_CIRCUIT_BREAKER === 'true') {
      console.debug(`[Circuit Breaker] ${config.name} SUCCESS`, {
        name: config.name,
        timestamp: new Date().toISOString(),
      });
    }
  });

  return breaker;
}

/**
 * Lemonade API Circuit Breaker
 */
export const lemonadeBreaker = createCircuitBreaker(
  async (action, payload) => {
    const lemonade = await import('@/app/api/utils/lemonadeClient');
    return await lemonade.default.call({ action, payload, mode: 'auto' });
  },
  {
    name: 'lemonade',
    timeout: 12000, // 12 second timeout for payment APIs
    errorThresholdPercentage: 40, // More sensitive
  }
);

/**
 * Stripe API Circuit Breaker
 */
export const stripeBreaker = createCircuitBreaker(
  async (method, params) => {
    const stripe = await import('@/__create/stripe');
    const client = stripe.default;
    return await client[method](params);
  },
  {
    name: 'stripe',
    timeout: 10000,
    errorThresholdPercentage: 50,
  }
);

/**
 * Database Circuit Breaker
 */
export const databaseBreaker = createCircuitBreaker(
  async (queryFn) => {
    return await queryFn();
  },
  {
    name: 'database',
    timeout: 5000,
    errorThresholdPercentage: 30, // Very sensitive for DB
  }
);

/**
 * Get circuit breaker status for monitoring
 */
export function getCircuitBreakerStatus() {
  return {
    lemonade: {
      state: lemonadeBreaker.status,
      stats: lemonadeBreaker.stats,
    },
    stripe: {
      state: stripeBreaker.status,
      stats: stripeBreaker.stats,
    },
    database: {
      state: databaseBreaker.status,
      stats: databaseBreaker.stats,
    },
  };
}
