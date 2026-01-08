import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import transactionRouter from '../routes/transaction.routes';
import { errorHandler } from '../middleware/errorHandler';

// Mock the services
jest.mock('../services/transactionAnalytics.service');

describe('Analytics Endpoints', () => {
  let app: express.Application;
  const mockJwt = jwt as jest.Mocked<typeof jwt>;

  // Import mocked service
  const { transactionAnalyticsService } = require('../services/transactionAnalytics.service');

  // Test user data
  const testUser = {
    userId: 'test-user-id',
    role: 'USER',
    sessionId: 'test-session-id',
  };

  // Mock JWT token
  const mockToken = 'mock-jwt-token';

  beforeAll(() => {
    // Setup Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/transactions', transactionRouter);
    app.use(errorHandler);

    // Mock JWT verification
    mockJwt.verify = jest.fn().mockReturnValue(testUser as any);
    
    // Set environment variable for JWT secret
    process.env.JWT_ACCESS_SECRET = 'test-secret';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset JWT mock for each test
    mockJwt.verify = jest.fn().mockReturnValue(testUser as any);
  });

  describe('GET /api/transactions/analytics/trends', () => {
    it('should return spending trends for valid date range', async () => {
      const mockTrends = {
        monthlyTrends: [
          {
            month: '2024-01',
            totalSpent: 1000,
            totalReceived: 500,
            transactionCount: 10,
            averageAmount: 150,
          },
        ],
        averagesByType: {
          DEPOSIT: 200,
          WITHDRAWAL: 150,
          TRANSFER: 100,
          ESCROW_LOCK: 0,
          ESCROW_RELEASE: 0,
          REFUND: 0,
          PAYMENT: 250,
        },
        topRecipients: [],
        unusualPatterns: [],
      };

      transactionAnalyticsService.getSpendingTrends.mockResolvedValue(mockTrends);

      const response = await request(app)
        .get('/api/transactions/analytics/trends')
        .set('Authorization', `Bearer ${mockToken}`)
        .query({
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-01-31T23:59:59.999Z',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockTrends);
      expect(transactionAnalyticsService.getSpendingTrends).toHaveBeenCalledWith(
        testUser.userId,
        new Date('2024-01-01T00:00:00.000Z'),
        new Date('2024-01-31T23:59:59.999Z')
      );
    });

    it('should return 400 for invalid date range', async () => {
      const response = await request(app)
        .get('/api/transactions/analytics/trends')
        .set('Authorization', `Bearer ${mockToken}`)
        .query({
          startDate: 'invalid-date',
          endDate: '2024-01-31T23:59:59.999Z',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/transactions/analytics/insights', () => {
    it('should return transaction insights for valid date range', async () => {
      const mockInsights = {
        totalSpending: 1000,
        totalReceived: 500,
        netFlow: -500,
        averageTransaction: 150,
        mostActiveDay: '2024-01-15',
        largestTransaction: {
          id: 'tx-1',
          amount: 500,
          type: 'PAYMENT',
          description: 'Large payment',
        },
        spendingVelocity: 2.5,
        topCategory: {
          category: { id: 'cat-1', name: 'Food' },
          amount: 300,
          count: 5,
          percentage: 30,
          trend: 'STABLE',
        },
      };

      transactionAnalyticsService.getTransactionInsights.mockResolvedValue(mockInsights);

      const response = await request(app)
        .get('/api/transactions/analytics/insights')
        .set('Authorization', `Bearer ${mockToken}`)
        .query({
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-01-31T23:59:59.999Z',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockInsights);
    });
  });

  describe('GET /api/transactions/analytics/category-breakdown', () => {
    it('should return category breakdown for valid date range', async () => {
      const mockBreakdown = {
        categories: [
          {
            category: { id: 'cat-1', name: 'Food', color: '#FF0000', icon: '🍔' },
            amount: 300,
            count: 5,
            percentage: 60,
            trend: 'STABLE',
          },
        ],
        uncategorized: {
          amount: 200,
          count: 3,
          percentage: 40,
        },
        totalAmount: 500,
        totalTransactions: 8,
      };

      transactionAnalyticsService.getCategoryBreakdown.mockResolvedValue(mockBreakdown);

      const response = await request(app)
        .get('/api/transactions/analytics/category-breakdown')
        .set('Authorization', `Bearer ${mockToken}`)
        .query({
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-01-31T23:59:59.999Z',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockBreakdown);
    });
  });

  describe('GET /api/transactions/analytics/compare-periods', () => {
    it('should return period comparison for valid date ranges', async () => {
      const mockComparison = {
        period1: {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31'),
          totalSpent: 1000,
          totalReceived: 500,
          transactionCount: 10,
        },
        period2: {
          startDate: new Date('2024-02-01'),
          endDate: new Date('2024-02-29'),
          totalSpent: 1200,
          totalReceived: 600,
          transactionCount: 12,
        },
        changes: {
          spentChange: 200,
          spentChangePercent: 20,
          receivedChange: 100,
          receivedChangePercent: 20,
          countChange: 2,
          countChangePercent: 20,
        },
      };

      transactionAnalyticsService.comparePeriods.mockResolvedValue(mockComparison);

      const response = await request(app)
        .get('/api/transactions/analytics/compare-periods')
        .set('Authorization', `Bearer ${mockToken}`)
        .query({
          period1Start: '2024-01-01T00:00:00.000Z',
          period1End: '2024-01-31T23:59:59.999Z',
          period2Start: '2024-02-01T00:00:00.000Z',
          period2End: '2024-02-29T23:59:59.999Z',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockComparison);
    });

    it('should return 400 for invalid period parameters', async () => {
      const response = await request(app)
        .get('/api/transactions/analytics/compare-periods')
        .set('Authorization', `Bearer ${mockToken}`)
        .query({
          period1Start: '2024-01-31T00:00:00.000Z', // Start after end
          period1End: '2024-01-01T23:59:59.999Z',
          period2Start: '2024-02-01T00:00:00.000Z',
          period2End: '2024-02-29T23:59:59.999Z',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});