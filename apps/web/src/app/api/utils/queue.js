/**
 * Queue Utilities
 * Provides access to payment and webhook queues
 */

/**
 * Get payment queue (lazy load to avoid circular dependencies)
 */
export async function getPaymentQueue() {
  const { getPaymentQueue: getPaymentQueueInstance, queuePayment } = await import('@apps-lib/queue/paymentQueue.js');
  return { paymentQueue: getPaymentQueueInstance(), queuePayment };
}

/**
 * Get webhook queue (lazy load)
 */
export async function getWebhookQueue() {
  const { getWebhookQueue: getWebhookQueueInstance, queueWebhook } = await import('@apps-lib/queue/webhookQueue.js');
  return { webhookQueue: getWebhookQueueInstance(), queueWebhook };
}

/**
 * Get queue status for all queues
 */
export async function getQueueStatus() {
  try {
    const { getQueueStatus: getPaymentStatus } = await import('@apps-lib/queue/paymentQueue.js');
    const { getQueueStatus: getWebhookStatus } = await import('@apps-lib/queue/webhookQueue.js');
    
    const [paymentStatus, webhookStatus] = await Promise.all([
      getPaymentStatus().catch(() => ({ error: 'unavailable' })),
      getWebhookStatus().catch(() => ({ error: 'unavailable' })),
    ]);

    return {
      payments: paymentStatus,
      webhooks: webhookStatus,
    };
  } catch (error) {
    console.error('[Queue] Error getting queue status:', error);
    return {
      error: 'queue_unavailable',
      message: error.message,
    };
  }
}

