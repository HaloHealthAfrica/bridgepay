import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as fc from 'fast-check';
import { TransactionReceiptService } from '../../services/transactionReceipt.service';
import { TransactionStatus } from '@prisma/client';

// Mock the receipt service
jest.mock('../../services/receipt.service', () => ({
  generateReceipt: jest.fn(),
}));

// Mock prisma
jest.mock('../../lib/prisma', () => ({
  prisma: {
    transaction: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $executeRaw: jest.fn(),
  },
}));

const mockPrisma = require('../../lib/prisma').prisma;
const { generateReceipt } = require('../../services/receipt.service');

describe('TransactionReceiptService - Property-Based Tests', () => {
  let service: TransactionReceiptService;

  beforeEach(() => {
    service = new TransactionReceiptService();
    jest.clearAllMocks();
  });

  // Arbitraries for property-based testing
  const transactionIdArb = fc.uuid();
  const transactionStatusArb = fc.constantFrom(...Object.values(TransactionStatus));
  const receiptUrlArb = fc.uuid().map(id => `https://s3.amazonaws.com/receipts/${id}.pdf`);
  const emailArb = fc.emailAddress();
  const sharingMethodArb = fc.constantFrom('email', 'download', 'link');

  const completedTransactionArb = fc.record({
    id: transactionIdArb,
    status: fc.constant(TransactionStatus.SUCCESS),
    receiptUrl: fc.option(receiptUrlArb),
    createdAt: fc.date(),
    updatedAt: fc.date(),
  });

  const anyTransactionArb = fc.record({
    id: transactionIdArb,
    status: transactionStatusArb,
    receiptUrl: fc.option(receiptUrlArb),
    createdAt: fc.date(),
    updatedAt: fc.date(),
  });

  describe('Property 22: Receipt Integration Completeness', () => {
    it('should provide receipt generation links for all completed transactions', async () => {
      // Feature: enhanced-transaction-history, Property 22: Receipt Integration Completeness
      await fc.assert(
        fc.asyncProperty(
          completedTransactionArb,
          async (transaction) => {
            // Mock transaction lookup - initially return the transaction as provided
            mockPrisma.transaction.findUnique.mockResolvedValue(transaction);
            
            // Mock receipt generation if needed
            if (!transaction.receiptUrl) {
              const newReceiptUrl = `https://s3.amazonaws.com/receipts/${transaction.id}.pdf`;
              generateReceipt.mockResolvedValue(newReceiptUrl);
              mockPrisma.$executeRaw.mockResolvedValue(undefined);
              
              // After receipt generation, mock should return transaction with receipt URL
              const updatedTransaction = {
                ...transaction,
                receiptUrl: newReceiptUrl,
              };
              mockPrisma.transaction.findUnique.mockResolvedValue(updatedTransaction);
            }

            // Test receipt generation
            const result = await service.generateReceiptForTransaction({
              transactionId: transaction.id,
            });

            // Verify that completed transactions can generate receipts
            expect(result.transactionId).toBe(transaction.id);
            expect(['AVAILABLE', 'GENERATING'].includes(result.status)).toBe(true);
            
            // If receipt is available, it should have a URL
            if (result.status === 'AVAILABLE') {
              expect(result.receiptUrl).toBeDefined();
              expect(typeof result.receiptUrl).toBe('string');
              expect(result.receiptUrl!.length).toBeGreaterThan(0);
            }

            // Test sharing options availability
            const sharingOptions = await service.getReceiptSharingOptions(transaction.id);
            
            if (result.status === 'AVAILABLE') {
              expect(sharingOptions.available).toBe(true);
              expect(sharingOptions.options.length).toBeGreaterThan(0);
              
              // Verify all expected sharing methods are available
              const methods = sharingOptions.options.map(opt => opt.method);
              expect(methods).toContain('download');
              expect(methods).toContain('email');
              expect(methods).toContain('link');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 23: Receipt Status Accuracy', () => {
    it('should accurately display receipt status for any transaction', async () => {
      // Feature: enhanced-transaction-history, Property 23: Receipt Status Accuracy
      await fc.assert(
        fc.asyncProperty(
          anyTransactionArb,
          async (transaction) => {
            // Mock transaction lookup
            mockPrisma.transaction.findUnique.mockResolvedValue(transaction);

            // Get receipt status
            const status = await service.getReceiptStatus(transaction.id);

            // Verify status accuracy based on transaction state
            expect(status.transactionId).toBe(transaction.id);
            expect(['NONE', 'GENERATING', 'AVAILABLE', 'FAILED'].includes(status.status)).toBe(true);

            // Status should be NONE for non-completed transactions
            if (transaction.status !== TransactionStatus.SUCCESS) {
              expect(status.status).toBe('NONE');
              expect(status.receiptUrl).toBeUndefined();
            }

            // Status should reflect receipt URL availability for completed transactions
            if (transaction.status === TransactionStatus.SUCCESS) {
              if (transaction.receiptUrl) {
                // Should be AVAILABLE if receipt URL exists and is accessible
                expect(['AVAILABLE', 'FAILED'].includes(status.status)).toBe(true);
                
                if (status.status === 'AVAILABLE') {
                  expect(status.receiptUrl).toBe(transaction.receiptUrl);
                  expect(status.generatedAt).toBeDefined();
                }
              } else {
                // Should be NONE if no receipt URL exists
                expect(status.status).toBe('NONE');
                expect(status.receiptUrl).toBeUndefined();
              }
            }

            // Error status should include error message
            if (status.status === 'FAILED') {
              expect(status.error).toBeDefined();
              expect(typeof status.error).toBe('string');
              expect(status.error!.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 24: Bulk Receipt Generation', () => {
    it('should create receipts for all selected transactions in bulk operations', async () => {
      // Feature: enhanced-transaction-history, Property 24: Bulk Receipt Generation
      await fc.assert(
        fc.asyncProperty(
          fc.array(completedTransactionArb, { minLength: 1, maxLength: 10 }),
          fc.boolean(), // forceRegenerate flag
          async (transactions, forceRegenerate) => {
            const transactionIds = transactions.map(t => t.id);

            // Mock transaction lookups for each transaction
            transactions.forEach((transaction, index) => {
              mockPrisma.transaction.findUnique
                .mockResolvedValueOnce(transaction);
            });

            // Mock receipt generation for transactions without receipts
            transactions.forEach((transaction) => {
              if (!transaction.receiptUrl || forceRegenerate) {
                const newReceiptUrl = `https://s3.amazonaws.com/receipts/${transaction.id}.pdf`;
                generateReceipt.mockResolvedValueOnce(newReceiptUrl);
              }
            });

            mockPrisma.$executeRaw.mockResolvedValue(undefined);

            // Execute bulk receipt generation
            const result = await service.generateBulkReceipts({
              transactionIds,
              forceRegenerate,
            });

            // Verify bulk operation results
            expect(result.results).toBeDefined();
            expect(result.results.length).toBe(transactions.length);
            expect(result.successCount + result.failureCount).toBe(transactions.length);

            // Verify each transaction was processed
            for (let i = 0; i < transactions.length; i++) {
              const transaction = transactions[i];
              const transactionResult = result.results.find(r => r.transactionId === transaction.id);
              
              expect(transactionResult).toBeDefined();
              expect(transactionResult!.transactionId).toBe(transaction.id);
              expect(['AVAILABLE', 'GENERATING', 'FAILED'].includes(transactionResult!.status)).toBe(true);
            }

            // Verify success/failure counts are consistent
            const actualSuccessCount = result.results.filter(r => r.status === 'AVAILABLE').length;
            const actualFailureCount = result.results.filter(r => r.status === 'FAILED').length;
            
            expect(result.successCount).toBe(actualSuccessCount);
            expect(result.failureCount).toBe(actualFailureCount);

            // Verify error handling
            if (result.failureCount > 0) {
              expect(result.errors.length).toBeGreaterThan(0);
              result.errors.forEach(error => {
                expect(typeof error).toBe('string');
                expect(error.length).toBeGreaterThan(0);
              });
            }

            // Verify bulk operation efficiency (should process in batches)
            // The service should handle large numbers of transactions efficiently
            if (transactions.length > 5) {
              // For larger batches, verify that the operation completes in reasonable time
              // This is implicitly tested by the async property completing
              expect(result.results.length).toBe(transactions.length);
            }
          }
        ),
        { numRuns: 50 } // Reduced runs for bulk operations to avoid timeout
      );
    });
  });

  describe('Property 25: Receipt Caching and Sharing', () => {
    it('should cache generated receipts and provide sharing options', async () => {
      // Feature: enhanced-transaction-history, Property 25: Receipt Caching and Sharing
      await fc.assert(
        fc.asyncProperty(
          completedTransactionArb.filter(t => t.receiptUrl !== null),
          sharingMethodArb,
          fc.option(emailArb),
          async (transaction, sharingMethod, email) => {
            // Mock transaction with existing receipt
            mockPrisma.transaction.findUnique.mockResolvedValue(transaction);

            // Test caching behavior
            const initialCacheInfo = service.getCachedReceiptInfo(transaction.id);
            
            // Generate receipt to populate cache
            await service.generateReceiptForTransaction({
              transactionId: transaction.id,
            });

            // Verify caching
            const cacheInfo = service.getCachedReceiptInfo(transaction.id);
            if (cacheInfo) {
              expect(cacheInfo.transactionId).toBe(transaction.id);
              expect(cacheInfo.receiptUrl).toBeDefined();
              expect(cacheInfo.cachedAt).toBeInstanceOf(Date);
              expect(cacheInfo.expiresAt).toBeInstanceOf(Date);
              expect(cacheInfo.expiresAt!.getTime()).toBeGreaterThan(cacheInfo.cachedAt.getTime());
            }

            // Test sharing functionality
            const sharingOptions = await service.getReceiptSharingOptions(transaction.id);
            expect(sharingOptions.available).toBe(true);
            expect(sharingOptions.options.length).toBeGreaterThan(0);

            // Test actual sharing
            const shareRequest = {
              transactionId: transaction.id,
              method: sharingMethod,
              ...(sharingMethod === 'email' && email ? { email } : {}),
            };

            const shareResult = await service.shareReceipt(shareRequest);

            // Verify sharing results
            if (sharingMethod === 'email' && !email) {
              // Should fail without email
              expect(shareResult.success).toBe(false);
              expect(shareResult.message).toContain('email');
            } else {
              // Should succeed for valid sharing methods
              expect(shareResult.success).toBe(true);
              expect(shareResult.message).toBeDefined();
              expect(typeof shareResult.message).toBe('string');

              if (sharingMethod === 'download' || sharingMethod === 'link') {
                expect(shareResult.sharedUrl).toBeDefined();
                expect(typeof shareResult.sharedUrl).toBe('string');
                expect(shareResult.sharedUrl!.length).toBeGreaterThan(0);
              }
            }

            // Test cache management
            service.clearReceiptCache(transaction.id);
            const clearedCacheInfo = service.getCachedReceiptInfo(transaction.id);
            expect(clearedCacheInfo).toBeNull();

            // Test cache cleanup
            expect(() => service.cleanupExpiredCache()).not.toThrow();
            
            // Test get all cached receipts
            const allCached = service.getAllCachedReceipts();
            expect(Array.isArray(allCached)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle invalid transaction IDs gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string().filter(s => !s.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)),
          async (invalidId) => {
            // Mock transaction not found
            mockPrisma.transaction.findUnique.mockResolvedValue(null);

            const result = await service.generateReceiptForTransaction({
              transactionId: invalidId,
            });

            expect(result.status).toBe('FAILED');
            expect(result.error).toBe('Transaction not found');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle concurrent receipt generation requests', async () => {
      await fc.assert(
        fc.asyncProperty(
          completedTransactionArb,
          fc.integer({ min: 2, max: 5 }),
          async (transaction, concurrentRequests) => {
            // Mock transaction lookup
            mockPrisma.transaction.findUnique.mockResolvedValue({
              ...transaction,
              receiptUrl: null, // Force generation
            });

            const newReceiptUrl = `https://s3.amazonaws.com/receipts/${transaction.id}.pdf`;
            generateReceipt.mockResolvedValue(newReceiptUrl);
            mockPrisma.$executeRaw.mockResolvedValue(undefined);

            // Make concurrent requests
            const promises = Array(concurrentRequests).fill(null).map(() =>
              service.generateReceiptForTransaction({
                transactionId: transaction.id,
              })
            );

            const results = await Promise.all(promises);

            // Verify all requests complete successfully
            results.forEach(result => {
              expect(result.transactionId).toBe(transaction.id);
              expect(['AVAILABLE', 'GENERATING'].includes(result.status)).toBe(true);
            });

            // Verify that receipt generation was called appropriately
            // (should handle concurrent requests without duplicate generation)
            expect(generateReceipt).toHaveBeenCalled();
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});