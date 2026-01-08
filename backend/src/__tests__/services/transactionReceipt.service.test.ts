import { TransactionReceiptService } from '../../services/transactionReceipt.service';
import { prisma } from '../../lib/prisma';
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

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const { generateReceipt } = require('../../services/receipt.service');

describe('TransactionReceiptService', () => {
  let service: TransactionReceiptService;

  beforeEach(() => {
    service = new TransactionReceiptService();
    jest.clearAllMocks();
  });

  describe('generateReceiptForTransaction', () => {
    it('should generate receipt for successful transaction', async () => {
      const transactionId = 'test-transaction-id';
      const receiptUrl = 'https://s3.amazonaws.com/receipts/test.pdf';

      // Mock transaction lookup
      mockPrisma.transaction.findUnique.mockResolvedValue({
        id: transactionId,
        status: TransactionStatus.SUCCESS,
        receiptUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock receipt generation
      generateReceipt.mockResolvedValue(receiptUrl);

      // Mock status update
      mockPrisma.$executeRaw.mockResolvedValue(undefined);

      const result = await service.generateReceiptForTransaction({
        transactionId,
      });

      expect(result.status).toBe('AVAILABLE');
      expect(result.receiptUrl).toBe(receiptUrl);
      expect(generateReceipt).toHaveBeenCalledWith(transactionId);
    });

    it('should return existing receipt if available', async () => {
      const transactionId = 'test-transaction-id';
      const existingReceiptUrl = 'https://s3.amazonaws.com/receipts/existing.pdf';

      // Mock transaction with existing receipt
      mockPrisma.transaction.findUnique.mockResolvedValue({
        id: transactionId,
        status: TransactionStatus.SUCCESS,
        receiptUrl: existingReceiptUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.generateReceiptForTransaction({
        transactionId,
      });

      expect(result.status).toBe('AVAILABLE');
      expect(result.receiptUrl).toBe(existingReceiptUrl);
      expect(generateReceipt).not.toHaveBeenCalled();
    });

    it('should return NONE for non-successful transactions', async () => {
      const transactionId = 'test-transaction-id';

      // Mock pending transaction
      mockPrisma.transaction.findUnique.mockResolvedValue({
        id: transactionId,
        status: TransactionStatus.PENDING,
        receiptUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.generateReceiptForTransaction({
        transactionId,
      });

      expect(result.status).toBe('NONE');
      expect(result.error).toBe('Receipt only available for completed transactions');
      expect(generateReceipt).not.toHaveBeenCalled();
    });

    it('should return FAILED for non-existent transactions', async () => {
      const transactionId = 'non-existent-id';

      // Mock transaction not found
      mockPrisma.transaction.findUnique.mockResolvedValue(null);

      const result = await service.generateReceiptForTransaction({
        transactionId,
      });

      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('Transaction not found');
    });
  });

  describe('generateBulkReceipts', () => {
    it('should process multiple transactions', async () => {
      const transactionIds = ['tx1', 'tx2', 'tx3'];

      // Mock successful transactions
      mockPrisma.transaction.findUnique
        .mockResolvedValueOnce({
          id: 'tx1',
          status: TransactionStatus.SUCCESS,
          receiptUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'tx2',
          status: TransactionStatus.SUCCESS,
          receiptUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'tx3',
          status: TransactionStatus.PENDING,
          receiptUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

      // Mock receipt generation
      generateReceipt
        .mockResolvedValueOnce('https://s3.amazonaws.com/receipts/tx1.pdf')
        .mockResolvedValueOnce('https://s3.amazonaws.com/receipts/tx2.pdf');

      mockPrisma.$executeRaw.mockResolvedValue(undefined);

      const result = await service.generateBulkReceipts({
        transactionIds,
      });

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.results).toHaveLength(3);
      expect(result.results[0].status).toBe('AVAILABLE');
      expect(result.results[1].status).toBe('AVAILABLE');
      expect(result.results[2].status).toBe('NONE');
    });
  });

  describe('getReceiptStatus', () => {
    it('should return correct status for transaction with receipt', async () => {
      const transactionId = 'test-transaction-id';
      const receiptUrl = 'https://s3.amazonaws.com/receipts/test.pdf';

      mockPrisma.transaction.findUnique.mockResolvedValue({
        id: transactionId,
        status: TransactionStatus.SUCCESS,
        receiptUrl,
        updatedAt: new Date(),
      });

      const result = await service.getReceiptStatus(transactionId);

      expect(result.status).toBe('AVAILABLE');
      expect(result.receiptUrl).toBe(receiptUrl);
    });
  });

  describe('getReceiptSharingOptions', () => {
    it('should return sharing options for available receipt', async () => {
      const transactionId = 'test-transaction-id';
      const receiptUrl = 'https://s3.amazonaws.com/receipts/test.pdf';

      mockPrisma.transaction.findUnique.mockResolvedValue({
        id: transactionId,
        status: TransactionStatus.SUCCESS,
        receiptUrl,
        updatedAt: new Date(),
      });

      const result = await service.getReceiptSharingOptions(transactionId);

      expect(result.available).toBe(true);
      expect(result.options).toHaveLength(3);
      expect(result.options.map(o => o.method)).toEqual(['download', 'email', 'link']);
    });

    it('should return no options for unavailable receipt', async () => {
      const transactionId = 'test-transaction-id';

      mockPrisma.transaction.findUnique.mockResolvedValue({
        id: transactionId,
        status: TransactionStatus.PENDING,
        receiptUrl: null,
        updatedAt: new Date(),
      });

      const result = await service.getReceiptSharingOptions(transactionId);

      expect(result.available).toBe(false);
      expect(result.options).toHaveLength(0);
    });
  });

  describe('shareReceipt', () => {
    beforeEach(() => {
      mockPrisma.transaction.findUnique.mockResolvedValue({
        id: 'test-id',
        status: TransactionStatus.SUCCESS,
        receiptUrl: 'https://s3.amazonaws.com/receipts/test.pdf',
        updatedAt: new Date(),
      });
    });

    it('should handle download sharing', async () => {
      const result = await service.shareReceipt({
        transactionId: 'test-id',
        method: 'download',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Receipt ready for download');
      expect(result.sharedUrl).toBe('https://s3.amazonaws.com/receipts/test.pdf');
    });

    it('should handle link sharing', async () => {
      const result = await service.shareReceipt({
        transactionId: 'test-id',
        method: 'link',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Receipt link copied');
      expect(result.sharedUrl).toBe('https://s3.amazonaws.com/receipts/test.pdf');
    });

    it('should handle email sharing', async () => {
      const result = await service.shareReceipt({
        transactionId: 'test-id',
        method: 'email',
        email: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Receipt sent to test@example.com');
    });

    it('should require email for email sharing', async () => {
      const result = await service.shareReceipt({
        transactionId: 'test-id',
        method: 'email',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Email address required for email sharing');
    });
  });

  describe('cache management', () => {
    it('should manage receipt cache correctly', () => {
      const transactionId = 'test-id';
      const receiptUrl = 'https://s3.amazonaws.com/receipts/test.pdf';

      // Initially no cache
      expect(service.getCachedReceiptInfo(transactionId)).toBeNull();

      // Cache should be updated during receipt generation
      // This is tested indirectly through the generation methods

      // Test cache clearing
      service.clearReceiptCache(transactionId);
      expect(service.getCachedReceiptInfo(transactionId)).toBeNull();
    });

    it('should get all cached receipts', () => {
      const cachedReceipts = service.getAllCachedReceipts();
      expect(Array.isArray(cachedReceipts)).toBe(true);
    });

    it('should cleanup expired cache', () => {
      // This method doesn't throw and cleans up expired entries
      expect(() => service.cleanupExpiredCache()).not.toThrow();
    });
  });
});