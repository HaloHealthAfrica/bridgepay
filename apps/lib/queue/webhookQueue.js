/**
 * Webhook Processing Queue
 * Handles async webhook processing with retries
 */

import { createRequire } from 'node:module';

import { connection } from './redis.js';

// BullMQ is CommonJS; load via require to avoid ESM/CJS interop issues in SSR builds.
const require = createRequire(import.meta.url);
const { Queue, Worker } = require('bullmq');

const shouldStartWorkers =
  process.env.ENABLE_QUEUE_WORKERS === 'true' &&
  process.env.VERCEL !== '1' &&
  process.env.NODE_ENV !== 'test';

// IMPORTANT: Do not create queues at module import-time.
export let webhookQueue = null;

export function getWebhookQueue() {
  if (!webhookQueue) {
    webhookQueue = new Queue('webhooks', {
      connection,
      defaultJobOptions: {
        attempts: 5, // More attempts for webhooks
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 500,
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    });
  }
  return webhookQueue;
}

// IMPORTANT: Workers should NOT run inside serverless (Vercel) functions or during build/prerender.
// They should run in a dedicated process/container/cron worker.
let webhookWorker = null;
export { webhookWorker };

export function startWebhookWorker() {
  if (!shouldStartWorkers) return null;
  if (webhookWorker) return webhookWorker;

  webhookWorker = new Worker(
    'webhooks',
    async (job) => {
      const { webhookType, payload, endpoint } = job.data;

      console.log(`[Webhook Queue] Processing job ${job.id} for ${webhookType}`);

      try {
        // Import here to avoid circular dependencies
        const sql = await import('../../web/src/app/api/utils/sql.js').then(m => m.default);

        // Process webhook based on type
        switch (webhookType) {
          case 'wallet':
            await processWalletWebhook(payload, sql);
            break;
          case 'lemonade':
            await processLemonadeWebhook(payload, sql);
            break;
          default:
            console.warn(`[Webhook Queue] Unknown webhook type: ${webhookType}`);
        }

        return { ok: true };
      } catch (error) {
        console.error(`[Webhook Queue] Job ${job.id} failed:`, error);
        throw error;
      }
    },
    {
      connection,
      concurrency: 20, // Process 20 webhooks concurrently
      limiter: {
        max: 200, // Max 200 jobs
        duration: 1000, // Per second
      },
    }
  );

  // Event handlers
  webhookWorker.on('completed', (job) => {
    console.log(`[Webhook Queue] Job ${job.id} completed`);
  });

  webhookWorker.on('failed', (job, err) => {
    console.error(`[Webhook Queue] Job ${job.id} failed:`, err.message);
  });

  webhookWorker.on('error', (err) => {
    console.error('[Webhook Queue] Worker error:', err);
  });

  return webhookWorker;
}

/**
 * Process wallet webhook
 */
async function processWalletWebhook(payload, sql) {
  const sqlModule = await import('../../web/src/app/api/utils/sql.js');
  const sqlFn = sqlModule.default;
  
  // Process wallet webhook logic directly
  const { body, headers } = payload;
  
  // Verify webhook (basic check)
  const authz = headers?.authorization || headers?.Authorization;
  const bridgeKey = headers?.['x-bridge-relay-key'] || headers?.['X-Bridge-Relay-Key'];
  const expected = process.env.LEMONADE_RELAY_KEY;
  
  if (expected && authz !== `Bearer ${expected}` && bridgeKey !== expected) {
    await sqlFn(
      "INSERT INTO wallet_webhook_events (event_type, payload) VALUES ($1, $2::jsonb)",
      ['unauthorized', JSON.stringify({ body, headers })]
    );
    throw new Error('Unauthorized webhook');
  }

  // Process webhook event
  const provider_tx_id = body?.transaction_id || body?.reference || body?.data?.transaction_id || null;
  const order_reference = body?.order_reference || body?.reference || null;
  
  // Log webhook event
  await sqlFn(
    "INSERT INTO wallet_webhook_events (event_type, payload, related_order_reference, related_provider_tx_id) VALUES ($1, $2::jsonb, $3, $4)",
    ['webhook.received', JSON.stringify(body), order_reference, provider_tx_id]
  );

  // Apply fees if needed (simplified - full logic in route handler)
  // This is a simplified version - full processing should be in the route
  console.log(`[Webhook Queue] Processed wallet webhook: ${provider_tx_id}`);
}

/**
 * Process Lemonade webhook
 */
async function processLemonadeWebhook(payload, sql) {
  // Process Lemonade webhook logic
  const { body, headers } = payload;
  
  // Log webhook
  const sqlModule = await import('../../web/src/app/api/utils/sql.js');
  const sqlFn = sqlModule.default;
  
  await sqlFn(
    "INSERT INTO lemonade_webhooks (payload, headers) VALUES ($1::jsonb, $2::jsonb)",
    [JSON.stringify(body), JSON.stringify(headers)]
  );

  console.log(`[Webhook Queue] Processed Lemonade webhook`);
}

// Event handlers
// NOTE: Worker event handlers are registered inside `startWebhookWorker()`.

/**
 * Add webhook to queue
 */
export async function queueWebhook(webhookType, payload, options = {}) {
  const { priority = 0, delay = 0 } = options;

  const q = getWebhookQueue();
  const job = await q.add(
    'process-webhook',
    {
      webhookType,
      payload,
      endpoint: payload.endpoint || null,
    },
    {
      priority,
      delay,
      jobId: `webhook-${webhookType}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    }
  );

  return job;
}

/**
 * Get queue status
 */
export async function getQueueStatus() {
  if (!process.env.REDIS_URL) {
    return { error: 'redis_not_configured' };
  }
  const q = getWebhookQueue();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    q.getWaitingCount(),
    q.getActiveCount(),
    q.getCompletedCount(),
    q.getFailedCount(),
    q.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  };
}

/**
 * Clean up on shutdown
 */
export async function closeQueues() {
  if (webhookWorker) {
    await webhookWorker.close();
  }
  if (webhookQueue) {
    await webhookQueue.close();
    webhookQueue = null;
  }
  // Don't close connection if shared with payment queue
}

