/**
 * Shared Redis Connection
 * Provides a single Redis connection for all queues to avoid connection limits
 */

import { createRequire } from 'node:module';

// `apps/lib` is shared across packages; resolve deps from the consuming app at runtime.
const require = createRequire(import.meta.url);
const Redis = require('ioredis');

// Create single Redis connection
export const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  // Avoid connecting during build/prerender (especially on Vercel) and only
  // connect when the first command is executed.
  lazyConnect: true,
});

// Connection event handlers
connection.on('connect', () => {
  console.log('[Redis] Connected to Redis');
});

connection.on('ready', () => {
  console.log('[Redis] Redis ready');
});

connection.on('error', (err) => {
  console.error('[Redis] Connection error:', err);
});

connection.on('close', () => {
  console.log('[Redis] Connection closed');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Redis] Closing connection...');
  await connection.quit();
});

process.on('SIGINT', async () => {
  console.log('[Redis] Closing connection...');
  await connection.quit();
});

