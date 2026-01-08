import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../lib/prisma';
import jwt from 'jsonwebtoken';

// Mock the receipt service
jest.mock('../../services/transactionReceipt.service', () => ({
  transactionReceiptService: {
    generateReceiptForTransaction: jest.fn(),
    getReceiptStatus: jest.fn(),
    generateBulkReceipts: jest.fn(),
    getReceiptSharingOptions: jest.fn(),
    shareReceipt: jest.fn(),
  },
}));

const { transactionReceiptService } = require('../../services/transactionReceipt.service');

describe('Transaction Receipt Endpoints', () => {
  let authToken: string;
  let userId: string;
  let transactionId: string;

  beforeAll(async () => {
    // Create test user
    const user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        phone: '+254700000000',
        password: 'hashedpassword',
        name: 'Test User',
      },
    });
    userId = user.id;

    // Create test transaction
    const transaction = await prisma.transaction.create({
      data: {
        fromUserId: userId,
        amount: 1000,
        type: 'TRANSFER',
        status: 'SUCCESS',
        reference: 'TEST-REF-001',
        description: 'Test transaction',
      },
    });
    transactionId = transaction.id;

    // Generate auth token
    authToken = jwt.sign(
      { userId, role: 'CUSTOMER' },
      process.env.JWT_SECRET || 'test-secret'
    );
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { fromUserId: userId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/transactions/:id/receipt', () => {
    it('should generate receipt for transaction', async () => {
      const mockResult = {
        receiptId: 'receipt-123',
        status: 'COMPLETED',
        downloadUrl: 'https://example.com/receipt.pdf',
      };

      transactionReceiptService.generateReceiptForTransaction.mockResolvedValue(mockResult);

      const response = await request(app)
        .post(`/api/transactions/${transactionId}/receipt`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          format: 'PDF',
          includeQRCode: true,
          includeLogo: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.receiptId).toBe('receipt-123');
      expect(transactionReceiptService.generateReceiptForTransaction).toHaveBeenCalledWith({
        transactionId,
        userId,
        format: 'PDF',
        includeQRCode: true,
        includeLogo: true,
      });
    });

    it('should return 404 for non-existent transaction', async () => {
      const response = await request(app)
        .post('/api/transactions/non-existent-id/receipt')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/transactions/:id/receipt/status', () => {
    it('should get receipt status', async () => {
      const mockStatus = {
        receiptId: 'receipt-123',
        transactionId,
        status: 'COMPLETED',
        format: 'PDF',
        downloadUrl: 'https://example.com/receipt.pdf',
        createdAt: new Date(),
      };

      transactionReceiptService.getReceiptStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get(`/api/transactions/${transactionId}/receipt/status`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.receiptId).toBe('receipt-123');
    });
  });

  describe('POST /api/transactions/receipts/bulk', () => {
    it('should generate bulk receipts', async () => {
      const mockResult = {
        batchId: 'batch-123',
        status: 'PROCESSING',
        totalReceipts: 2,
        successCount: 0,
        failureCount: 0,
      };

      transactionReceiptService.generateBulkReceipts.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/transactions/receipts/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transactionIds: [transactionId],
          format: 'PDF',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.batchId).toBe('batch-123');
    });
  });

  describe('GET /api/transactions/:id/receipt/sharing', () => {
    it('should get receipt sharing options', async () => {
      const mockOptions = {
        receiptId: 'receipt-123',
        availableMethods: ['EMAIL', 'LINK', 'SMS'],
        currentShares: [],
        maxSharesPerMethod: { EMAIL: 10, LINK: 5, SMS: 3 },
      };

      transactionReceiptService.getReceiptSharingOptions.mockResolvedValue(mockOptions);

      const response = await request(app)
        .get(`/api/transactions/${transactionId}/receipt/sharing`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.availableMethods).toContain('EMAIL');
    });
  });

  describe('POST /api/transactions/:id/receipt/share', () => {
    it('should share receipt via email', async () => {
      const mockResult = {
        shareId: 'share-123',
        method: 'EMAIL',
        recipient: 'test@example.com',
        expiresAt: new Date(),
      };

      transactionReceiptService.shareReceipt.mockResolvedValue(mockResult);

      const response = await request(app)
        .post(`/api/transactions/${transactionId}/receipt/share`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          method: 'EMAIL',
          recipient: 'test@example.com',
          message: 'Here is your receipt',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.shareId).toBe('share-123');
    });
  });
});