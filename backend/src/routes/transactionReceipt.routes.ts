import { Router } from 'express';
import {
  generateReceipt,
  generateBulkReceipts,
  getReceiptStatus,
  getReceiptSharingOptions,
  shareReceipt,
  getCachedReceiptInfo,
  clearReceiptCache,
  getAllCachedReceipts,
  cleanupExpiredCache,
} from '../controllers/transactionReceipt.controller';
// Using a simple auth middleware for now
const authenticateToken = (req: any, res: any, next: any) => {
  // Mock authentication - in real app this would validate JWT
  req.user = { userId: 'test-user', role: 'user' };
  next();
};
// Using simple rate limiters for now
const paymentRateLimiter = (req: any, res: any, next: any) => next();
const apiRateLimiter = (req: any, res: any, next: any) => next();

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Receipt generation routes (use payment rate limiter for generation)
router.post('/generate', paymentRateLimiter, generateReceipt);
router.post('/bulk-generate', paymentRateLimiter, generateBulkReceipts);

// Receipt status and sharing routes (use API rate limiter for reads)
router.get('/:transactionId/status', getReceiptStatus);
router.get('/:transactionId/sharing-options', getReceiptSharingOptions);
router.post('/share', apiRateLimiter, shareReceipt);

// Receipt caching routes
router.get('/:transactionId/cache-info', getCachedReceiptInfo);
router.delete('/:transactionId/cache', clearReceiptCache);

// Admin routes (would typically require admin authentication)
router.get('/cache/all', getAllCachedReceipts);
router.post('/cache/cleanup', cleanupExpiredCache);

export default router;