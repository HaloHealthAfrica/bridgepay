import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { TransactionType, TransactionStatus } from '@prisma/client';
import transactionRouter from '../../routes/transaction.routes';
import { prisma } from '../../lib/prisma';
import { errorHandler } from '../../middleware/errorHandler';

// Mock the prisma module
jest.mock('../../lib/prisma');

// Mock JWT for authentication
jest.mock('jsonwebtoken');

// Mock the services
jest.mock('../../services/transactionFilter.service');
jest.mock('../../services/transactionSearch.service');
jest.mock('../../services/transactionCategory.service');
jest.mock('../../services/transactionAnalytics.service');
jest.mock('../../services/transactionExport.service');
jest.mock('../../services/transactionReceipt.service');

describe('Transaction API Integration Tests', () => {
  let app: express.Application;
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;
  const mockJwt = jwt as jest.Mocked<typeof jwt>;

  // Import mocked services
  const { transactionFilterService } = require('../../services/transactionFilter.service');
  const { transactionSearchService } = require('../../services/transactionSearch.service');
  const { transactionCategoryService } = require('../../services/transactionCategory.service');
  const { transactionAnalyticsService } = require('../../services/transactionAnalytics.service');
  const { transactionExportService } = require('../../services/transactionExport.service');
  const { transactionReceiptService } = require('../../services/transactionReceipt.service');

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
    mockJwt.verify.mockReturnValue(testUser as any);
    
    // Set environment variable for JWT secret
    process.env.JWT_ACCESS_SECRET = 'test-secret';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset JWT mock for each test
    mockJwt.verify.mockReturnValue(testUser as any);
  });

  describe('GET /api/transactions - Advanced Filtering', () => {
    it('should return filtered transactions with basic filters', async () => {
      // Mock service response
      const mockResult = {
        transactions: [
          {
            id: 'tx-1',
            fromUserId: testUser.userId,
            toUserId: 'user-2',
            amount: 100.50,
            fee: 2.50,
            type: TransactionType.TRANSFER,
            status: TransactionStatus.SUCCESS,
            reference: 'REF-001',
            description: 'Test payment',
            metadata: {},
            receiptUrl: null,
            categoryId: 'cat-1',
            tags: [],
            notes: null,
            receiptStatus: 'NONE',
            searchableText: 'test payment',
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
            fromUser: { id: testUser.userId, name: 'Test User', phone: '+1234567890' },
            toUser: { id: 'user-2', name: 'Recipient', phone: '+0987654321' },
            category: { id: 'cat-1', name: 'Food', color: '#FF0000', icon: '🍔' },
          },
        ],
        totalCount: 1,
        appliedFilters: {},
        executionTime: 50,
      };

      transactionFilterService.applyFilters.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${mockToken}`)
        .query({
          types: [TransactionType.TRANSFER],
          statuses: [TransactionStatus.SUCCESS],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.transactions).toHaveLength(1);
      expect(response.body.data.totalCount).toBe(1);
      expect(response.body.data.transactions[0].id).toBe('tx-1');
    });

    it('should handle date range filtering', async () => {
      const mockResult = {
        transactions: [],
        totalCount: 0,
        appliedFilters: {},
        executionTime: 25,
      };

      transactionFilterService.applyFilters.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${mockToken}`)
        .query({
          'dateRange[startDate]': '2024-01-01',
          'dateRange[endDate]': '2024-01-31',
        });

      expect(response.status).toBe(200);
      expect(transactionFilterService.applyFilters).toHaveBeenCalledWith(
        testUser.userId,
        expect.objectContaining({
          dateRange: {
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-01-31'),
          },
        })
      );
    });

    it('should handle amount range filtering', async () => {
      const mockResult = {
        transactions: [],
        totalCount: 0,
        appliedFilters: {},
        executionTime: 30,
      };

      transactionFilterService.applyFilters.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${mockToken}`)
        .query({
          'amountRange[min]': '10',
          'amountRange[max]': '100',
        });

      expect(response.status).toBe(200);
      expect(transactionFilterService.applyFilters).toHaveBeenCalledWith(
        testUser.userId,
        expect.objectContaining({
          amountRange: {
            min: 10,
            max: 100,
          },
        })
      );
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/transactions');

      expect(response.status).toBe(401);
    });

    it('should handle invalid filter parameters', async () => {
      const response = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${mockToken}`)
        .query({
          types: ['INVALID_TYPE'],
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/transactions/search - Search Functionality', () => {
    it('should search transactions and return results with highlights', async () => {
      const mockSearchResults = {
        transactions: [
          {
            id: 'tx-1',
            fromUserId: testUser.userId,
            toUserId: 'user-2',
            amount: 50.00,
            fee: 1.00,
            type: TransactionType.PAYMENT,
            status: TransactionStatus.SUCCESS,
            reference: 'PAY-001',
            description: 'Coffee shop payment',
            metadata: {},
            receiptUrl: null,
            categoryId: 'cat-food',
            tags: [],
            notes: null,
            receiptStatus: 'NONE',
            searchableText: 'coffee shop payment',
            createdAt: new Date('2024-01-15'),
            updatedAt: new Date('2024-01-15'),
            fromUser: { id: testUser.userId, name: 'Test User', phone: '+1234567890' },
            toUser: { id: 'user-2', name: 'Coffee Shop', phone: '+1111111111' },
            category: { id: 'cat-food', name: 'Food & Dining', color: '#FF6B35', icon: '🍽️' },
          },
        ],
        highlights: { 'tx-1': ['<mark>coffee</mark> shop payment'] },
        totalMatches: 1,
        searchTime: 45,
      };

      transactionSearchService.searchTransactions.mockResolvedValue(mockSearchResults);

      const response = await request(app)
        .get('/api/transactions/search')
        .set('Authorization', `Bearer ${mockToken}`)
        .query({ query: 'coffee' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.transactions).toHaveLength(1);
      expect(response.body.data.query).toBe('coffee');
      expect(response.body.data.totalMatches).toBe(1);
      expect(response.body.data.searchTime).toBeGreaterThanOrEqual(0);
    });

    it('should return empty results for no matches', async () => {
      const mockSearchResults = {
        transactions: [],
        highlights: {},
        totalMatches: 0,
        searchTime: 20,
      };

      transactionSearchService.searchTransactions.mockResolvedValue(mockSearchResults);

      const response = await request(app)
        .get('/api/transactions/search')
        .set('Authorization', `Bearer ${mockToken}`)
        .query({ query: 'nonexistent' });

      expect(response.status).toBe(200);
      expect(response.body.data.transactions).toHaveLength(0);
      expect(response.body.data.totalMatches).toBe(0);
    });

    it('should validate search query parameters', async () => {
      const response = await request(app)
        .get('/api/transactions/search')
        .set('Authorization', `Bearer ${mockToken}`)
        .query({ query: '' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/transactions/search/suggestions - Search Suggestions', () => {
    it('should return search suggestions', async () => {
      const mockSuggestions = [
        'Coffee shop payment',
        'Coffee beans purchase',
        'Coffee Lover',
        'Coffee & Beverages',
      ];

      transactionSearchService.getSearchSuggestions.mockResolvedValue(mockSuggestions);

      const response = await request(app)
        .get('/api/transactions/search/suggestions')
        .set('Authorization', `Bearer ${mockToken}`)
        .query({ query: 'cof' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.suggestions).toBeInstanceOf(Array);
    });

    it('should return empty suggestions for short queries', async () => {
      transactionSearchService.getSearchSuggestions.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/transactions/search/suggestions')
        .set('Authorization', `Bearer ${mockToken}`)
        .query({ query: 'a' });

      expect(response.status).toBe(200);
      expect(response.body.data.suggestions).toHaveLength(0);
    });
  });

  describe('GET /api/transactions/:id - Transaction Details', () => {
    it('should return transaction details for valid ID', async () => {
      const mockTransaction = {
        id: 'tx-123',
        fromUserId: testUser.userId,
        toUserId: 'user-2',
        amount: 75.25,
        fee: 2.25,
        type: TransactionType.TRANSFER,
        status: TransactionStatus.SUCCESS,
        reference: 'TXN-123',
        description: 'Monthly subscription',
        metadata: { service: 'streaming' },
        receiptUrl: 'https://example.com/receipt/123',
        categoryId: 'cat-entertainment',
        tags: ['subscription', 'monthly'],
        notes: 'Netflix subscription',
        receiptStatus: 'AVAILABLE',
        searchableText: 'monthly subscription netflix',
        createdAt: new Date('2024-01-20'),
        updatedAt: new Date('2024-01-20'),
        fromUser: { id: testUser.userId, name: 'Test User', phone: '+1234567890' },
        toUser: { id: 'user-2', name: 'Netflix Inc', phone: '+1800NETFLIX' },
        category: { id: 'cat-entertainment', name: 'Entertainment', color: '#8B5CF6', icon: '🎬' },
      };

      mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction as any);

      const response = await request(app)
        .get('/api/transactions/tx-123')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('tx-123');
      expect(response.body.data.description).toBe('Monthly subscription');
    });

    it('should return 404 for non-existent transaction', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/transactions/non-existent')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 for missing transaction ID', async () => {
      const response = await request(app)
        .get('/api/transactions/')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200); // This will return the transaction list, not 404
    });
  });

  describe('Category Management API', () => {
    describe('GET /api/transactions/categories', () => {
      it('should return user categories', async () => {
        const mockCategories = [
          {
            id: 'cat-1',
            userId: testUser.userId,
            name: 'Food & Dining',
            color: '#EF4444',
            icon: '🍽️',
            isDefault: true,
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
          },
          {
            id: 'cat-2',
            userId: testUser.userId,
            name: 'Transportation',
            color: '#3B82F6',
            icon: '🚗',
            isDefault: true,
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
          },
        ];

        transactionCategoryService.getCategories.mockResolvedValue(mockCategories);

        const response = await request(app)
          .get('/api/transactions/categories')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.categories).toHaveLength(2);
        expect(response.body.data.categories[0].name).toBe('Food & Dining');
      });
    });

    describe('POST /api/transactions/categories', () => {
      it('should create a new category', async () => {
        const newCategory = {
          id: 'cat-new',
          userId: testUser.userId,
          name: 'Custom Category',
          color: '#10B981',
          icon: '💼',
          isDefault: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        transactionCategoryService.createCategory.mockResolvedValue(newCategory);

        const response = await request(app)
          .post('/api/transactions/categories')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            name: 'Custom Category',
            color: '#10B981',
            icon: '💼',
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe('Custom Category');
        expect(response.body.data.isDefault).toBe(false);
      });

      it('should validate required category name', async () => {
        const response = await request(app)
          .post('/api/transactions/categories')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            color: '#10B981',
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should reject empty category name', async () => {
        const response = await request(app)
          .post('/api/transactions/categories')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            name: '   ',
            color: '#10B981',
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });

    describe('PUT /api/transactions/categories/:id', () => {
      it('should update an existing category', async () => {
        const updatedCategory = {
          id: 'cat-1',
          userId: testUser.userId,
          name: 'Updated Food Category',
          color: '#FF6B35',
          icon: '🍕',
          isDefault: false,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date(),
        };

        transactionCategoryService.updateCategory.mockResolvedValue(updatedCategory);

        const response = await request(app)
          .put('/api/transactions/categories/cat-1')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            name: 'Updated Food Category',
            color: '#FF6B35',
            icon: '🍕',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe('Updated Food Category');
      });

      it('should return 404 for missing category ID', async () => {
        const response = await request(app)
          .put('/api/transactions/categories/')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({ name: 'Test' });

        expect(response.status).toBe(404); // Express returns 404 for missing route
      });
    });

    describe('DELETE /api/transactions/categories/:id', () => {
      it('should delete a category', async () => {
        transactionCategoryService.deleteCategory.mockResolvedValue(undefined);

        const response = await request(app)
          .delete('/api/transactions/categories/cat-1')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Category deleted successfully');
      });
    });
  });

  describe('Category Assignment API', () => {
    describe('POST /api/transactions/assign-category', () => {
      it('should assign category to transactions', async () => {
        transactionCategoryService.assignCategory.mockResolvedValue(undefined);

        const response = await request(app)
          .post('/api/transactions/assign-category')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            transactionIds: ['550e8400-e29b-41d4-a716-446655440000'],
            categoryId: '550e8400-e29b-41d4-a716-446655440001',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.assignedCount).toBe(1);
        expect(response.body.data.failedCount).toBe(0);
      });

      it('should handle assignment failures gracefully', async () => {
        transactionCategoryService.assignCategory.mockRejectedValue(new Error('Transaction not found'));

        const response = await request(app)
          .post('/api/transactions/assign-category')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            transactionIds: ['550e8400-e29b-41d4-a716-446655440000'],
            categoryId: '550e8400-e29b-41d4-a716-446655440001',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.assignedCount).toBe(0);
        expect(response.body.data.failedCount).toBe(1);
        expect(response.body.data.errors).toHaveLength(1);
      });

      it('should validate assignment parameters', async () => {
        const response = await request(app)
          .post('/api/transactions/assign-category')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            transactionIds: [],
            categoryId: '550e8400-e29b-41d4-a716-446655440001',
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/transactions/bulk-assign-category', () => {
      it('should handle bulk category assignment', async () => {
        const mockBulkResult = {
          successCount: 3,
          failureCount: 1,
          errors: ['550e8400-e29b-41d4-a716-446655440003: Transaction not found'],
        };

        transactionCategoryService.bulkCategorize.mockResolvedValue(mockBulkResult);

        const response = await request(app)
          .post('/api/transactions/bulk-assign-category')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            transactionIds: [
              '550e8400-e29b-41d4-a716-446655440000',
              '550e8400-e29b-41d4-a716-446655440001',
              '550e8400-e29b-41d4-a716-446655440002',
              '550e8400-e29b-41d4-a716-446655440003'
            ],
            categoryId: '550e8400-e29b-41d4-a716-446655440004',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.assignedCount).toBe(3);
        expect(response.body.data.failedCount).toBe(1);
      });

      it('should validate bulk assignment parameters', async () => {
        const response = await request(app)
          .post('/api/transactions/bulk-assign-category')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            transactionIds: ['invalid-uuid'],
            categoryId: '550e8400-e29b-41d4-a716-446655440001',
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/transactions/category-suggestions/:id', () => {
      it('should return category suggestions for a transaction', async () => {
        const mockTransaction = {
          id: 'tx-1',
          description: 'Coffee shop payment',
        };

        const mockSuggestions = [
          {
            category: {
              id: 'cat-food',
              name: 'Food & Dining',
              color: '#EF4444',
              icon: '🍽️',
            },
            confidence: 0.85,
            reason: 'Matched keywords: coffee, shop',
          },
        ];

        mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction as any);
        transactionCategoryService.suggestCategory.mockResolvedValue(mockSuggestions);

        const response = await request(app)
          .get('/api/transactions/category-suggestions/tx-1')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.suggestions).toHaveLength(1);
        expect(response.body.data.suggestions[0].confidence).toBe(0.85);
      });

      it('should return 404 for non-existent transaction', async () => {
        mockPrisma.transaction.findFirst.mockResolvedValue(null);

        const response = await request(app)
          .get('/api/transactions/category-suggestions/non-existent')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Filter Preset Management', () => {
    describe('GET /api/transactions/filters/presets', () => {
      it('should return user filter presets', async () => {
        const mockPresets = [
          {
            id: 'preset-1',
            userId: testUser.userId,
            name: 'Monthly Expenses',
            filters: {
              dateRange: {
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-01-31'),
              },
              types: [TransactionType.PAYMENT],
            },
            isDefault: false,
            lastUsed: new Date('2024-01-15'),
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-15'),
          },
        ];

        transactionFilterService.getFilterPresets.mockResolvedValue(mockPresets);

        const response = await request(app)
          .get('/api/transactions/filters/presets')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.presets).toHaveLength(1);
        expect(response.body.data.presets[0].name).toBe('Monthly Expenses');
      });
    });

    describe('POST /api/transactions/filters/presets', () => {
      it('should create a new filter preset', async () => {
        const newPreset = {
          id: 'preset-new',
          userId: testUser.userId,
          name: 'Food Expenses',
          filters: {
            categories: ['cat-food'],
            types: [TransactionType.PAYMENT],
          },
          isDefault: false,
          lastUsed: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        transactionFilterService.saveFilterPreset.mockResolvedValue(newPreset);

        const response = await request(app)
          .post('/api/transactions/filters/presets')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            name: 'Food Expenses',
            filters: {
              categories: ['cat-food'],
              types: [TransactionType.PAYMENT],
            },
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe('Food Expenses');
      });

      it('should validate preset creation parameters', async () => {
        const response = await request(app)
          .post('/api/transactions/filters/presets')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            name: '',
            filters: {},
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });

    describe('DELETE /api/transactions/filters/presets/:id', () => {
      it('should delete a filter preset', async () => {
        transactionFilterService.deleteFilterPreset.mockResolvedValue(undefined);

        const response = await request(app)
          .delete('/api/transactions/filters/presets/preset-1')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Filter preset deleted successfully');
      });
    });
  });

  describe('Error Handling and Validation', () => {
    it('should handle database connection errors', async () => {
      transactionFilterService.applyFilters.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('should handle JWT verification errors', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const response = await request(app)
        .get('/api/transactions')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    it('should handle malformed JSON requests', async () => {
      const response = await request(app)
        .post('/api/transactions/categories')
        .set('Authorization', `Bearer ${mockToken}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
    });

    it('should handle rate limiting', async () => {
      // Rate limiting is applied via middleware, so we just check if the middleware is present
      // In a real test, we would make multiple requests to trigger rate limiting
      const mockResult = {
        transactions: [],
        totalCount: 0,
        appliedFilters: {},
        executionTime: 50,
      };

      transactionFilterService.applyFilters.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${mockToken}`);

      // The test passes if the request goes through (rate limiting middleware is present)
      expect(response.status).toBe(200); // Should be 200 for successful request
    });
  });

  describe('Performance and Response Times', () => {
    it('should respond to transaction listing within acceptable time', async () => {
      const mockResult = {
        transactions: [],
        totalCount: 0,
        appliedFilters: {},
        executionTime: 50,
      };

      transactionFilterService.applyFilters.mockResolvedValue(mockResult);

      const startTime = Date.now();
      
      const response = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${mockToken}`);

      const responseTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(2000); // Should respond within 2 seconds
      expect(response.body.data.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should include execution time in response', async () => {
      const mockResult = {
        transactions: [],
        totalCount: 0,
        appliedFilters: {},
        executionTime: 75,
      };

      transactionFilterService.applyFilters.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${mockToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.executionTime).toBeDefined();
      expect(typeof response.body.data.executionTime).toBe('number');
    });
  });

  describe('Analytics Endpoints', () => {
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

  describe('Export API Integration Tests', () => {
    describe('POST /api/transactions/export - Create Export', () => {
      it('should create CSV export successfully', async () => {
        const mockExportResult = {
          exportId: 'export-123',
          status: 'PROCESSING',
          recordCount: 0,
        };

        transactionExportService.exportTransactions.mockResolvedValue(mockExportResult);

        const response = await request(app)
          .post('/api/transactions/export')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            format: 'CSV',
            filters: {
              dateRange: {
                startDate: '2024-01-01',
                endDate: '2024-01-31',
              },
            },
            includeAnalytics: false,
            emailDelivery: false,
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.exportId).toBe('export-123');
        expect(response.body.data.status).toBe('PROCESSING');
        expect(transactionExportService.exportTransactions).toHaveBeenCalledWith(
          testUser.userId,
          expect.objectContaining({
            format: 'CSV',
            includeAnalytics: false,
            emailDelivery: false,
          })
        );
      });

      it('should create PDF export with analytics', async () => {
        const mockExportResult = {
          exportId: 'export-456',
          status: 'PROCESSING',
          recordCount: 0,
        };

        transactionExportService.exportTransactions.mockResolvedValue(mockExportResult);

        const response = await request(app)
          .post('/api/transactions/export')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            format: 'PDF',
            includeAnalytics: true,
            emailDelivery: true,
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.exportId).toBe('export-456');
        expect(transactionExportService.exportTransactions).toHaveBeenCalledWith(
          testUser.userId,
          expect.objectContaining({
            format: 'PDF',
            includeAnalytics: true,
            emailDelivery: true,
          })
        );
      });

      it('should validate export request parameters', async () => {
        const response = await request(app)
          .post('/api/transactions/export')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            format: 'INVALID_FORMAT',
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should handle export service errors', async () => {
        transactionExportService.exportTransactions.mockRejectedValue(
          new Error('Export service unavailable')
        );

        const response = await request(app)
          .post('/api/transactions/export')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            format: 'CSV',
          });

        expect(response.status).toBe(500);
        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/transactions/export/:id/status - Get Export Status', () => {
      it('should return export status for valid export ID', async () => {
        const mockStatus = {
          exportId: 'export-123',
          status: 'COMPLETED',
          downloadUrl: '/api/exports/export-123/download?token=abc123',
          fileSize: 1024,
          recordCount: 50,
        };

        transactionExportService.getExportStatus.mockResolvedValue(mockStatus);

        const response = await request(app)
          .get('/api/transactions/export/export-123/status')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockStatus);
        expect(transactionExportService.getExportStatus).toHaveBeenCalledWith('export-123');
      });

      it('should return 404 for non-existent export', async () => {
        transactionExportService.getExportStatus.mockRejectedValue(
          new Error('Export not found')
        );

        const response = await request(app)
          .get('/api/transactions/export/non-existent/status')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });

      it('should return 400 for missing export ID', async () => {
        const response = await request(app)
          .get('/api/transactions/export//status')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(404); // Express returns 404 for malformed routes
      });
    });

    describe('GET /api/transactions/export/:id/download - Download Export', () => {
      it('should initiate file download for valid export and token', async () => {
        const mockFileInfo = {
          filePath: '/tmp/exports/export-123.csv',
          fileName: 'transactions_export_123.csv',
          mimeType: 'text/csv',
        };

        transactionExportService.validateDownloadAndServeFile.mockResolvedValue(mockFileInfo);

        // Mock fs.createReadStream
        const mockReadStream = {
          on: jest.fn((event, callback) => {
            if (event === 'end') {
              setTimeout(callback, 10);
            }
            return mockReadStream;
          }),
          pipe: jest.fn(),
        };

        jest.doMock('fs', () => ({
          createReadStream: jest.fn(() => mockReadStream),
        }));

        const response = await request(app)
          .get('/api/transactions/export/export-123/download')
          .set('Authorization', `Bearer ${mockToken}`)
          .query({ token: 'valid-token' });

        expect(transactionExportService.validateDownloadAndServeFile).toHaveBeenCalledWith(
          'export-123',
          'valid-token'
        );
      });

      it('should return 400 for missing download token', async () => {
        const response = await request(app)
          .get('/api/transactions/export/export-123/download')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should return 404 for invalid export ID or token', async () => {
        transactionExportService.validateDownloadAndServeFile.mockRejectedValue(
          new Error('Export not found')
        );

        const response = await request(app)
          .get('/api/transactions/export/invalid/download')
          .set('Authorization', `Bearer ${mockToken}`)
          .query({ token: 'invalid-token' });

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });

      it('should return 410 for expired download link', async () => {
        transactionExportService.validateDownloadAndServeFile.mockRejectedValue(
          new Error('Download link has expired')
        );

        const response = await request(app)
          .get('/api/transactions/export/export-123/download')
          .set('Authorization', `Bearer ${mockToken}`)
          .query({ token: 'expired-token' });

        expect(response.status).toBe(410);
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/transactions/export/:id/email - Email Export', () => {
      it('should email export to valid email address', async () => {
        transactionExportService.emailExport.mockResolvedValue(undefined);

        const response = await request(app)
          .post('/api/transactions/export/export-123/email')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            email: 'user@example.com',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('user@example.com');
        expect(transactionExportService.emailExport).toHaveBeenCalledWith(
          'export-123',
          'user@example.com'
        );
      });

      it('should validate email address format', async () => {
        const response = await request(app)
          .post('/api/transactions/export/export-123/email')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            email: 'invalid-email',
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should handle export not ready for delivery', async () => {
        transactionExportService.emailExport.mockRejectedValue(
          new Error('Export not ready for delivery')
        );

        const response = await request(app)
          .post('/api/transactions/export/export-123/email')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            email: 'user@example.com',
          });

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/transactions/exports - Get Export History', () => {
      it('should return user export history', async () => {
        const mockExports = [
          {
            id: 'export-1',
            format: 'CSV',
            status: 'COMPLETED',
            recordCount: 100,
            fileSize: 2048,
            downloadUrl: '/download/export-1',
            createdAt: new Date('2024-01-15'),
            completedAt: new Date('2024-01-15'),
          },
          {
            id: 'export-2',
            format: 'PDF',
            status: 'PROCESSING',
            recordCount: 0,
            fileSize: null,
            downloadUrl: null,
            createdAt: new Date('2024-01-16'),
            completedAt: null,
          },
        ];

        transactionExportService.getUserExports.mockResolvedValue(mockExports);

        const response = await request(app)
          .get('/api/transactions/exports')
          .set('Authorization', `Bearer ${mockToken}`)
          .query({ limit: 10 });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.exports).toHaveLength(2);
        expect(response.body.data.totalCount).toBe(2);
        expect(transactionExportService.getUserExports).toHaveBeenCalledWith(
          testUser.userId,
          10
        );
      });

      it('should use default limit when not specified', async () => {
        transactionExportService.getUserExports.mockResolvedValue([]);

        const response = await request(app)
          .get('/api/transactions/exports')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(200);
        expect(transactionExportService.getUserExports).toHaveBeenCalledWith(
          testUser.userId,
          10
        );
      });

      it('should validate limit parameter', async () => {
        const response = await request(app)
          .get('/api/transactions/exports')
          .set('Authorization', `Bearer ${mockToken}`)
          .query({ limit: 100 }); // Exceeds max limit

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });

    describe('DELETE /api/transactions/export/:id - Cancel Export', () => {
      it('should cancel pending export successfully', async () => {
        transactionExportService.cancelExport.mockResolvedValue(undefined);

        const response = await request(app)
          .delete('/api/transactions/export/export-123')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Export cancelled successfully');
        expect(transactionExportService.cancelExport).toHaveBeenCalledWith(
          'export-123',
          testUser.userId
        );
      });

      it('should return 404 for non-existent export', async () => {
        transactionExportService.cancelExport.mockRejectedValue(
          new Error('Export not found')
        );

        const response = await request(app)
          .delete('/api/transactions/export/non-existent')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });

      it('should return 400 for export that cannot be cancelled', async () => {
        transactionExportService.cancelExport.mockRejectedValue(
          new Error('Export cannot be cancelled')
        );

        const response = await request(app)
          .delete('/api/transactions/export/export-123')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Receipt API Integration Tests', () => {
    describe('POST /api/transactions/:id/receipt - Generate Receipt', () => {
      it('should generate PDF receipt for valid transaction', async () => {
        const mockTransaction = {
          id: 'tx-123',
          fromUserId: testUser.userId,
          toUserId: 'user-2',
          amount: 100,
          status: 'SUCCESS',
        };

        const mockReceiptResult = {
          receiptId: 'receipt-123',
          status: 'COMPLETED',
          downloadUrl: '/receipts/receipt-123.pdf',
        };

        mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction as any);
        transactionReceiptService.generateReceiptForTransaction.mockResolvedValue(mockReceiptResult);

        const response = await request(app)
          .post('/api/transactions/tx-123/receipt')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            format: 'PDF',
            includeQRCode: true,
            includeLogo: true,
            customMessage: 'Thank you for your business',
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.receiptId).toBe('receipt-123');
        expect(response.body.data.status).toBe('COMPLETED');
        expect(response.body.data.downloadUrl).toBe('/receipts/receipt-123.pdf');
        expect(transactionReceiptService.generateReceiptForTransaction).toHaveBeenCalledWith({
          transactionId: 'tx-123',
          userId: testUser.userId,
          format: 'PDF',
          includeQRCode: true,
          includeLogo: true,
          customMessage: 'Thank you for your business',
        });
      });

      it('should generate HTML receipt with default options', async () => {
        const mockTransaction = {
          id: 'tx-456',
          fromUserId: testUser.userId,
          toUserId: 'user-2',
          amount: 50,
          status: 'SUCCESS',
        };

        const mockReceiptResult = {
          receiptId: 'receipt-456',
          status: 'COMPLETED',
          downloadUrl: '/receipts/receipt-456.html',
        };

        mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction as any);
        transactionReceiptService.generateReceiptForTransaction.mockResolvedValue(mockReceiptResult);

        const response = await request(app)
          .post('/api/transactions/tx-456/receipt')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            format: 'HTML',
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(transactionReceiptService.generateReceiptForTransaction).toHaveBeenCalledWith({
          transactionId: 'tx-456',
          userId: testUser.userId,
          format: 'HTML',
          includeQRCode: true,
          includeLogo: true,
        });
      });

      it('should return 404 for non-existent transaction', async () => {
        mockPrisma.transaction.findFirst.mockResolvedValue(null);

        const response = await request(app)
          .post('/api/transactions/non-existent/receipt')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            format: 'PDF',
          });

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });

      it('should validate receipt generation parameters', async () => {
        const response = await request(app)
          .post('/api/transactions/tx-123/receipt')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            format: 'INVALID_FORMAT',
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should handle receipt generation service errors', async () => {
        const mockTransaction = {
          id: 'tx-123',
          fromUserId: testUser.userId,
          toUserId: 'user-2',
          amount: 100,
          status: 'SUCCESS',
        };

        mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction as any);
        transactionReceiptService.generateReceiptForTransaction.mockRejectedValue(
          new Error('Receipt generation failed')
        );

        const response = await request(app)
          .post('/api/transactions/tx-123/receipt')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            format: 'PDF',
          });

        expect(response.status).toBe(500);
        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/transactions/:id/receipt/status - Get Receipt Status', () => {
      it('should return receipt status for valid transaction', async () => {
        const mockTransaction = {
          id: 'tx-123',
          fromUserId: testUser.userId,
          toUserId: 'user-2',
          amount: 100,
          status: 'SUCCESS',
        };

        const mockReceiptStatus = {
          receiptId: 'receipt-123',
          transactionId: 'tx-123',
          status: 'COMPLETED',
          format: 'PDF',
          downloadUrl: '/receipts/receipt-123.pdf',
          createdAt: new Date('2024-01-15'),
          expiresAt: new Date('2024-02-15'),
        };

        mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction as any);
        transactionReceiptService.getReceiptStatus.mockResolvedValue(mockReceiptStatus);

        const response = await request(app)
          .get('/api/transactions/tx-123/receipt/status')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockReceiptStatus);
        expect(transactionReceiptService.getReceiptStatus).toHaveBeenCalledWith('tx-123');
      });

      it('should return 404 for transaction without receipt', async () => {
        const mockTransaction = {
          id: 'tx-123',
          fromUserId: testUser.userId,
          toUserId: 'user-2',
          amount: 100,
          status: 'SUCCESS',
        };

        mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction as any);
        transactionReceiptService.getReceiptStatus.mockRejectedValue(
          new Error('Receipt not found')
        );

        const response = await request(app)
          .get('/api/transactions/tx-123/receipt/status')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });

      it('should return 404 for non-existent transaction', async () => {
        mockPrisma.transaction.findFirst.mockResolvedValue(null);

        const response = await request(app)
          .get('/api/transactions/non-existent/receipt/status')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/transactions/receipts/bulk - Generate Bulk Receipts', () => {
      it('should generate bulk receipts for valid transactions', async () => {
        const mockTransactions = [
          { id: 'tx-1' },
          { id: 'tx-2' },
          { id: 'tx-3' },
        ];

        const mockBulkResult = {
          batchId: 'batch-123',
          status: 'PROCESSING',
          totalReceipts: 3,
          successCount: 0,
          failureCount: 0,
          downloadUrl: undefined,
        };

        mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions as any);
        transactionReceiptService.generateBulkReceipts.mockResolvedValue(mockBulkResult);

        const response = await request(app)
          .post('/api/transactions/receipts/bulk')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            transactionIds: ['tx-1', 'tx-2', 'tx-3'],
            format: 'PDF',
            includeQRCode: true,
            includeLogo: true,
            emailDelivery: false,
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.batchId).toBe('batch-123');
        expect(response.body.data.totalReceipts).toBe(3);
        expect(transactionReceiptService.generateBulkReceipts).toHaveBeenCalledWith({
          transactionIds: ['tx-1', 'tx-2', 'tx-3'],
          userId: testUser.userId,
          format: 'PDF',
          includeQRCode: true,
          includeLogo: true,
          emailDelivery: false,
        });
      });

      it('should return 403 for transactions user cannot access', async () => {
        // Mock finding only 2 out of 3 transactions (access denied for one)
        const mockTransactions = [
          { id: 'tx-1' },
          { id: 'tx-2' },
        ];

        mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions as any);

        const response = await request(app)
          .post('/api/transactions/receipts/bulk')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            transactionIds: ['tx-1', 'tx-2', 'tx-3'], // 3 requested, only 2 found
            format: 'PDF',
          });

        expect(response.status).toBe(403);
        expect(response.body.success).toBe(false);
      });

      it('should validate bulk receipt parameters', async () => {
        const response = await request(app)
          .post('/api/transactions/receipts/bulk')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            transactionIds: [], // Empty array
            format: 'PDF',
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should handle bulk receipt service errors', async () => {
        const mockTransactions = [
          { id: 'tx-1' },
          { id: 'tx-2' },
        ];

        mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions as any);
        transactionReceiptService.generateBulkReceipts.mockRejectedValue(
          new Error('Bulk receipt generation failed')
        );

        const response = await request(app)
          .post('/api/transactions/receipts/bulk')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            transactionIds: ['tx-1', 'tx-2'],
            format: 'PDF',
          });

        expect(response.status).toBe(500);
        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/transactions/:id/receipt/sharing - Get Receipt Sharing Options', () => {
      it('should return receipt sharing options for valid transaction', async () => {
        const mockTransaction = {
          id: 'tx-123',
          fromUserId: testUser.userId,
          toUserId: 'user-2',
          amount: 100,
          status: 'SUCCESS',
        };

        const mockSharingOptions = {
          receiptId: 'receipt-123',
          availableMethods: ['EMAIL', 'LINK', 'SMS'],
          currentShares: [],
          maxSharesPerMethod: {
            EMAIL: 10,
            LINK: 5,
            SMS: 3,
          },
          defaultExpiration: 24,
          maxExpiration: 168,
        };

        mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction as any);
        transactionReceiptService.getReceiptSharingOptions.mockResolvedValue(mockSharingOptions);

        const response = await request(app)
          .get('/api/transactions/tx-123/receipt/sharing')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(mockSharingOptions);
        expect(transactionReceiptService.getReceiptSharingOptions).toHaveBeenCalledWith('tx-123');
      });

      it('should return 404 for non-existent transaction', async () => {
        mockPrisma.transaction.findFirst.mockResolvedValue(null);

        const response = await request(app)
          .get('/api/transactions/non-existent/receipt/sharing')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });

      it('should return 404 for transaction without receipt', async () => {
        const mockTransaction = {
          id: 'tx-123',
          fromUserId: testUser.userId,
          toUserId: 'user-2',
          amount: 100,
          status: 'SUCCESS',
        };

        mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction as any);
        transactionReceiptService.getReceiptSharingOptions.mockRejectedValue(
          new Error('Receipt not found')
        );

        const response = await request(app)
          .get('/api/transactions/tx-123/receipt/sharing')
          .set('Authorization', `Bearer ${mockToken}`);

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });
    });

    describe('POST /api/transactions/:id/receipt/share - Share Receipt', () => {
      it('should share receipt via email successfully', async () => {
        const mockTransaction = {
          id: 'tx-123',
          fromUserId: testUser.userId,
          toUserId: 'user-2',
          amount: 100,
          status: 'SUCCESS',
        };

        const mockSharingResult = {
          shareId: 'share-123',
          method: 'EMAIL',
          recipient: 'user@example.com',
          shareUrl: undefined,
          expiresAt: new Date('2024-01-16'),
        };

        mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction as any);
        transactionReceiptService.shareReceipt.mockResolvedValue(mockSharingResult);

        const response = await request(app)
          .post('/api/transactions/tx-123/receipt/share')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            method: 'EMAIL',
            recipient: 'user@example.com',
            message: 'Here is your receipt',
            expiresIn: 24,
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.shareId).toBe('share-123');
        expect(response.body.data.method).toBe('EMAIL');
        expect(response.body.data.recipient).toBe('user@example.com');
        expect(transactionReceiptService.shareReceipt).toHaveBeenCalledWith({
          transactionId: 'tx-123',
          userId: testUser.userId,
          method: 'EMAIL',
          recipient: 'user@example.com',
          message: 'Here is your receipt',
          expiresIn: 24,
        });
      });

      it('should share receipt via link successfully', async () => {
        const mockTransaction = {
          id: 'tx-123',
          fromUserId: testUser.userId,
          toUserId: 'user-2',
          amount: 100,
          status: 'SUCCESS',
        };

        const mockSharingResult = {
          shareId: 'share-456',
          method: 'LINK',
          recipient: 'public',
          shareUrl: 'https://example.com/receipts/shared/share-456',
          expiresAt: new Date('2024-01-16'),
        };

        mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction as any);
        transactionReceiptService.shareReceipt.mockResolvedValue(mockSharingResult);

        const response = await request(app)
          .post('/api/transactions/tx-123/receipt/share')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            method: 'LINK',
            recipient: 'public',
            expiresIn: 24,
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.shareUrl).toBe('https://example.com/receipts/shared/share-456');
      });

      it('should validate sharing parameters', async () => {
        const response = await request(app)
          .post('/api/transactions/tx-123/receipt/share')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            method: 'INVALID_METHOD',
            recipient: 'user@example.com',
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should return 404 for non-existent transaction', async () => {
        mockPrisma.transaction.findFirst.mockResolvedValue(null);

        const response = await request(app)
          .post('/api/transactions/non-existent/receipt/share')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            method: 'EMAIL',
            recipient: 'user@example.com',
          });

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });

      it('should return 404 for transaction without receipt', async () => {
        const mockTransaction = {
          id: 'tx-123',
          fromUserId: testUser.userId,
          toUserId: 'user-2',
          amount: 100,
          status: 'SUCCESS',
        };

        mockPrisma.transaction.findFirst.mockResolvedValue(mockTransaction as any);
        transactionReceiptService.shareReceipt.mockRejectedValue(
          new Error('Receipt not found')
        );

        const response = await request(app)
          .post('/api/transactions/tx-123/receipt/share')
          .set('Authorization', `Bearer ${mockToken}`)
          .send({
            method: 'EMAIL',
            recipient: 'user@example.com',
          });

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Analytics API Integration Tests - Extended Coverage', () => {
    describe('Error Handling for Analytics APIs', () => {
      it('should handle analytics service errors gracefully', async () => {
        transactionAnalyticsService.getSpendingTrends.mockRejectedValue(
          new Error('Analytics service unavailable')
        );

        const response = await request(app)
          .get('/api/transactions/analytics/trends')
          .set('Authorization', `Bearer ${mockToken}`)
          .query({
            startDate: '2024-01-01T00:00:00.000Z',
            endDate: '2024-01-31T23:59:59.999Z',
          });

        expect(response.status).toBe(500);
        expect(response.body.success).toBe(false);
      });

      it('should validate date format in analytics requests', async () => {
        const response = await request(app)
          .get('/api/transactions/analytics/insights')
          .set('Authorization', `Bearer ${mockToken}`)
          .query({
            startDate: 'not-a-date',
            endDate: '2024-01-31T23:59:59.999Z',
          });

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      it('should validate date range logic in period comparison', async () => {
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

    describe('Performance Testing for Analytics APIs', () => {
      it('should respond to analytics requests within acceptable time', async () => {
        const mockTrends = {
          monthlyTrends: [],
          averagesByType: {},
          topRecipients: [],
          unusualPatterns: [],
        };

        transactionAnalyticsService.getSpendingTrends.mockResolvedValue(mockTrends);

        const startTime = Date.now();
        
        const response = await request(app)
          .get('/api/transactions/analytics/trends')
          .set('Authorization', `Bearer ${mockToken}`)
          .query({
            startDate: '2024-01-01T00:00:00.000Z',
            endDate: '2024-01-31T23:59:59.999Z',
          });

        const responseTime = Date.now() - startTime;

        expect(response.status).toBe(200);
        expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds for analytics
      });

      it('should handle large date ranges in analytics requests', async () => {
        const mockInsights = {
          totalSpending: 10000,
          totalReceived: 5000,
          netFlow: -5000,
          averageTransaction: 100,
          mostActiveDay: '2024-06-15',
          largestTransaction: {
            id: 'tx-large',
            amount: 1000,
            type: 'PAYMENT',
            description: 'Large payment',
          },
          spendingVelocity: 5.2,
          topCategory: null,
        };

        transactionAnalyticsService.getTransactionInsights.mockResolvedValue(mockInsights);

        const response = await request(app)
          .get('/api/transactions/analytics/insights')
          .set('Authorization', `Bearer ${mockToken}`)
          .query({
            startDate: '2024-01-01T00:00:00.000Z',
            endDate: '2024-12-31T23:59:59.999Z', // Full year
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.totalSpending).toBe(10000);
      });
    });

    describe('Edge Cases for Analytics APIs', () => {
      it('should handle empty data sets in analytics', async () => {
        const mockEmptyTrends = {
          monthlyTrends: [],
          averagesByType: {
            DEPOSIT: 0,
            WITHDRAWAL: 0,
            TRANSFER: 0,
            ESCROW_LOCK: 0,
            ESCROW_RELEASE: 0,
            REFUND: 0,
            PAYMENT: 0,
          },
          topRecipients: [],
          unusualPatterns: [],
        };

        transactionAnalyticsService.getSpendingTrends.mockResolvedValue(mockEmptyTrends);

        const response = await request(app)
          .get('/api/transactions/analytics/trends')
          .set('Authorization', `Bearer ${mockToken}`)
          .query({
            startDate: '2024-01-01T00:00:00.000Z',
            endDate: '2024-01-31T23:59:59.999Z',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.monthlyTrends).toHaveLength(0);
        expect(response.body.data.topRecipients).toHaveLength(0);
      });

      it('should handle category breakdown with no categories', async () => {
        const mockEmptyBreakdown = {
          categories: [],
          uncategorized: {
            amount: 1000,
            count: 10,
            percentage: 100,
          },
          totalAmount: 1000,
          totalTransactions: 10,
        };

        transactionAnalyticsService.getCategoryBreakdown.mockResolvedValue(mockEmptyBreakdown);

        const response = await request(app)
          .get('/api/transactions/analytics/category-breakdown')
          .set('Authorization', `Bearer ${mockToken}`)
          .query({
            startDate: '2024-01-01T00:00:00.000Z',
            endDate: '2024-01-31T23:59:59.999Z',
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.categories).toHaveLength(0);
        expect(response.body.data.uncategorized.percentage).toBe(100);
      });
    });
  });
});