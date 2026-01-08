import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { apiRateLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../middleware/asyncHandler';
import * as transactionController from '../controllers/transaction.controller';

const router = Router();

// Apply authentication to all routes
router.use(requireAuth);

// Category management routes (must come before /:id route)
router.get('/categories', apiRateLimiter, asyncHandler(transactionController.getCategories));
router.post('/categories', apiRateLimiter, asyncHandler(transactionController.createCategory));
router.put('/categories/:id', apiRateLimiter, asyncHandler(transactionController.updateCategory));
router.delete('/categories/:id', apiRateLimiter, asyncHandler(transactionController.deleteCategory));

// Search routes (must come before /:id route)
router.get('/search', apiRateLimiter, asyncHandler(transactionController.searchTransactions));
router.get('/search/suggestions', apiRateLimiter, asyncHandler(transactionController.getSearchSuggestions));

// Category assignment routes
router.post('/assign-category', apiRateLimiter, asyncHandler(transactionController.assignCategory));
router.post('/bulk-assign-category', apiRateLimiter, asyncHandler(transactionController.bulkAssignCategory));
router.get('/category-suggestions/:id', apiRateLimiter, asyncHandler(transactionController.getCategorySuggestions));

// Filter preset routes
router.get('/filters/presets', apiRateLimiter, asyncHandler(transactionController.getFilterPresets));
router.post('/filters/presets', apiRateLimiter, asyncHandler(transactionController.saveFilterPreset));
router.delete('/filters/presets/:id', apiRateLimiter, asyncHandler(transactionController.deleteFilterPreset));

// Analytics routes
router.get('/analytics/trends', apiRateLimiter, asyncHandler(transactionController.getSpendingTrends));
router.get('/analytics/insights', apiRateLimiter, asyncHandler(transactionController.getTransactionInsights));
router.get('/analytics/category-breakdown', apiRateLimiter, asyncHandler(transactionController.getCategoryBreakdown));
router.get('/analytics/compare-periods', apiRateLimiter, asyncHandler(transactionController.comparePeriods));

// Export routes
router.post('/export', apiRateLimiter, asyncHandler(transactionController.createExport));
router.get('/export/:id/status', apiRateLimiter, asyncHandler(transactionController.getExportStatus));
router.get('/export/:id/download', apiRateLimiter, asyncHandler(transactionController.downloadExport));
router.post('/export/:id/email', apiRateLimiter, asyncHandler(transactionController.emailExport));
router.get('/exports', apiRateLimiter, asyncHandler(transactionController.getExportHistory));
router.delete('/export/:id', apiRateLimiter, asyncHandler(transactionController.cancelExport));

// Receipt routes
router.post('/:id/receipt', apiRateLimiter, asyncHandler(transactionController.generateReceipt));
router.get('/:id/receipt/status', apiRateLimiter, asyncHandler(transactionController.getReceiptStatus));
router.post('/receipts/bulk', apiRateLimiter, asyncHandler(transactionController.generateBulkReceipts));
router.get('/:id/receipt/sharing', apiRateLimiter, asyncHandler(transactionController.getReceiptSharingOptions));
router.post('/:id/receipt/share', apiRateLimiter, asyncHandler(transactionController.shareReceipt));
router.get('/analytics/compare-periods', apiRateLimiter, asyncHandler(transactionController.comparePeriods));

// Export routes
router.post('/export', apiRateLimiter, asyncHandler(transactionController.createExport));
router.get('/export/:id/status', apiRateLimiter, asyncHandler(transactionController.getExportStatus));
router.get('/export/:id/download', apiRateLimiter, asyncHandler(transactionController.downloadExport));
router.post('/export/:id/email', apiRateLimiter, asyncHandler(transactionController.emailExport));
router.get('/exports', apiRateLimiter, asyncHandler(transactionController.getExportHistory));
router.delete('/export/:id', apiRateLimiter, asyncHandler(transactionController.cancelExport));

// Receipt routes (Task 11.3 - Requirements 8.1-8.6)
router.post('/:id/receipt', apiRateLimiter, asyncHandler(transactionController.generateReceipt));
router.get('/:id/receipt/status', apiRateLimiter, asyncHandler(transactionController.getReceiptStatus));
router.post('/receipts/bulk', apiRateLimiter, asyncHandler(transactionController.generateBulkReceipts));
router.get('/:id/receipt/sharing', apiRateLimiter, asyncHandler(transactionController.getReceiptSharingOptions));
router.post('/:id/receipt/share', apiRateLimiter, asyncHandler(transactionController.shareReceipt));

// Transaction listing and details routes (parameterized routes must come last)
router.get('/', apiRateLimiter, asyncHandler(transactionController.getTransactions));
router.get('/:id', apiRateLimiter, asyncHandler(transactionController.getTransactionDetails));

export default router;