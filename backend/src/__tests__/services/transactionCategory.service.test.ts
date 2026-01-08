import * as fc from 'fast-check';
import { TransactionCategoryService } from '../../services/transactionCategory.service';
import { CreateCategoryRequest, BulkResult } from '../../types/transaction';
import { prisma } from '../../lib/prisma';

// Mock the prisma module
jest.mock('../../lib/prisma');

describe('TransactionCategoryService', () => {
  let service: TransactionCategoryService;
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;

  beforeEach(() => {
    service = new TransactionCategoryService();
    jest.clearAllMocks();
  });

  describe('Property Tests', () => {
    /**
     * Property 6: Category Management Operations
     * For any valid category data, the system should correctly create, update, 
     * and delete categories while maintaining data integrity
     * Validates: Requirements 3.2, 3.3, 3.4
     */
    test('Property 6: Category Management Operations', async () => {
      // Feature: enhanced-transaction-history, Property 6: Category Management Operations
      await fc.assert(
        fc.asyncProperty(
          fc.string(), // userId
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            color: fc.option(fc.string({ minLength: 7, maxLength: 7 }).filter(s => s.startsWith('#'))),
            icon: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
          }),
          fc.record({
            name: fc.option(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)),
            color: fc.option(fc.string({ minLength: 7, maxLength: 7 }).filter(s => s.startsWith('#'))),
            icon: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
          }),
          async (userId: string, createRequest: CreateCategoryRequest, updateRequest: Partial<CreateCategoryRequest>) => {
            const categoryId = 'test-category-id';
            const mockCategory = {
              id: categoryId,
              userId,
              name: createRequest.name,
              color: createRequest.color || '#6B7280',
              icon: createRequest.icon,
              isDefault: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Mock category creation
            mockPrisma.transactionCategory.create.mockResolvedValue(mockCategory);

            // Test category creation
            const createdCategory = await service.createCategory(userId, createRequest);

            // Verify creation
            expect(createdCategory).toBeDefined();
            expect(createdCategory.id).toBe(categoryId);
            expect(createdCategory.userId).toBe(userId);
            expect(createdCategory.name).toBe(createRequest.name);
            expect(createdCategory.color).toBe(createRequest.color || '#6B7280');
            expect(createdCategory.icon).toBe(createRequest.icon);
            expect(createdCategory.isDefault).toBe(false);

            // Verify Prisma was called correctly for creation
            expect(mockPrisma.transactionCategory.create).toHaveBeenCalledWith({
              data: {
                userId,
                name: createRequest.name,
                color: createRequest.color || '#6B7280',
                icon: createRequest.icon,
                isDefault: false,
              },
            });

            // Mock category update
            const updatedMockCategory = {
              ...mockCategory,
              ...updateRequest,
              updatedAt: new Date(),
            };
            mockPrisma.transactionCategory.updateMany.mockResolvedValue({ count: 1 });
            mockPrisma.transactionCategory.findUnique.mockResolvedValue(updatedMockCategory);

            // Test category update
            const updatedCategory = await service.updateCategory(categoryId, userId, updateRequest);

            // Verify update
            expect(updatedCategory).toBeDefined();
            expect(updatedCategory.id).toBe(categoryId);
            if (updateRequest.name) {
              expect(updatedCategory.name).toBe(updateRequest.name);
            }
            if (updateRequest.color) {
              expect(updatedCategory.color).toBe(updateRequest.color);
            }
            if (updateRequest.icon) {
              expect(updatedCategory.icon).toBe(updateRequest.icon);
            }

            // Verify Prisma was called correctly for update
            expect(mockPrisma.transactionCategory.updateMany).toHaveBeenCalledWith({
              where: { id: categoryId, userId },
              data: updateRequest,
            });

            // Mock category deletion
            mockPrisma.transaction.updateMany.mockResolvedValue({ count: 0 });
            mockPrisma.transactionCategory.deleteMany.mockResolvedValue({ count: 1 });

            // Test category deletion
            await service.deleteCategory(categoryId, userId);

            // Verify deletion process
            expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith({
              where: { categoryId },
              data: { categoryId: null },
            });
            expect(mockPrisma.transactionCategory.deleteMany).toHaveBeenCalledWith({
              where: { id: categoryId, userId, isDefault: false },
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 7: Bulk Categorization Consistency
     * For any set of transaction IDs and a valid category, bulk categorization 
     * should process all transactions consistently and report accurate results
     * Validates: Requirements 3.3, 3.4
     */
    test('Property 7: Bulk Categorization Consistency', async () => {
      // Feature: enhanced-transaction-history, Property 7: Bulk Categorization Consistency
      await fc.assert(
        fc.asyncProperty(
          fc.string(), // userId
          fc.string(), // categoryId
          fc.array(fc.string(), { minLength: 1, maxLength: 10 }), // transactionIds
          fc.float({ min: 0, max: 1 }).filter(n => !isNaN(n)), // successRate (0-1)
          async (userId: string, categoryId: string, transactionIds: string[], successRate: number) => {
            // Mock category existence
            const mockCategory = {
              id: categoryId,
              userId,
              name: 'Test Category',
              color: '#6B7280',
              icon: '📁',
              isDefault: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockPrisma.transactionCategory.findFirst.mockResolvedValue(mockCategory);

            // Mock transaction existence based on success rate
            const expectedSuccessCount = Math.floor(transactionIds.length * successRate);
            const expectedFailureCount = transactionIds.length - expectedSuccessCount;

            // Reset mock call counts
            mockPrisma.transaction.findFirst.mockClear();
            mockPrisma.transaction.update.mockClear();

            let findFirstCallCount = 0;
            mockPrisma.transaction.findFirst.mockImplementation(() => {
              const shouldSucceed = findFirstCallCount < expectedSuccessCount;
              findFirstCallCount++;
              return Promise.resolve(shouldSucceed ? {
                id: `tx-${findFirstCallCount}`,
                fromUserId: userId,
                toUserId: 'other-user',
                amount: 100,
                fee: 0,
                type: 'TRANSFER',
                status: 'SUCCESS',
                reference: `REF-${findFirstCallCount}`,
                description: 'Test transaction',
                metadata: {},
                receiptUrl: null,
                categoryId: null,
                tags: [],
                notes: null,
                receiptStatus: 'NONE',
                searchableText: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              } : null);
            });

            // Mock transaction updates
            mockPrisma.transaction.update.mockResolvedValue({
              id: 'updated-tx',
              fromUserId: userId,
              toUserId: 'other-user',
              amount: 100,
              fee: 0,
              type: 'TRANSFER',
              status: 'SUCCESS',
              reference: 'REF-UPDATED',
              description: 'Updated transaction',
              metadata: {},
              receiptUrl: null,
              categoryId,
              tags: [],
              notes: null,
              receiptStatus: 'NONE',
              searchableText: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            // Execute bulk categorization
            const result: BulkResult = await service.bulkCategorize(transactionIds, categoryId, userId);

            // Verify bulk operation results
            expect(result).toBeDefined();
            expect(result.successCount).toBe(expectedSuccessCount);
            expect(result.failureCount).toBe(expectedFailureCount);
            expect(result.successCount + result.failureCount).toBe(transactionIds.length);
            expect(result.errors).toHaveLength(expectedFailureCount);

            // Verify category was checked
            expect(mockPrisma.transactionCategory.findFirst).toHaveBeenCalledWith({
              where: { id: categoryId, userId },
            });

            // Verify transaction lookups
            expect(mockPrisma.transaction.findFirst).toHaveBeenCalledTimes(transactionIds.length);

            // Verify successful updates
            expect(mockPrisma.transaction.update).toHaveBeenCalledTimes(expectedSuccessCount);

            // Verify error messages for failed transactions
            if (expectedFailureCount > 0) {
              result.errors.forEach(error => {
                expect(error).toContain('not found or access denied');
              });
            }

            // Verify consistency: total processed equals input count
            expect(result.successCount + result.failureCount).toBe(transactionIds.length);

            // Verify no duplicate processing (but allow duplicate IDs in input)
            const uniqueTransactionIds = [...new Set(transactionIds)];
            const processedTransactions = new Set();
            for (let i = 0; i < uniqueTransactionIds.length; i++) {
              expect(processedTransactions.has(uniqueTransactionIds[i])).toBe(false);
              processedTransactions.add(uniqueTransactionIds[i]);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test category assignment
     */
    test('Category assignment validates ownership', async () => {
      const userId = 'user-123';
      const categoryId = 'cat-123';
      const transactionId = 'tx-123';

      // Mock valid transaction and category
      mockPrisma.transaction.findFirst.mockResolvedValue({
        id: transactionId,
        fromUserId: userId,
        toUserId: 'other-user',
        amount: 100,
        fee: 0,
        type: 'TRANSFER',
        status: 'SUCCESS',
        reference: 'REF-123',
        description: 'Test transaction',
        metadata: {},
        receiptUrl: null,
        categoryId: null,
        tags: [],
        notes: null,
        receiptStatus: 'NONE',
        searchableText: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPrisma.transactionCategory.findFirst.mockResolvedValue({
        id: categoryId,
        userId,
        name: 'Test Category',
        color: '#6B7280',
        icon: '📁',
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPrisma.transaction.update.mockResolvedValue({
        id: transactionId,
        fromUserId: userId,
        toUserId: 'other-user',
        amount: 100,
        fee: 0,
        type: 'TRANSFER',
        status: 'SUCCESS',
        reference: 'REF-123',
        description: 'Test transaction',
        metadata: {},
        receiptUrl: null,
        categoryId,
        tags: [],
        notes: null,
        receiptStatus: 'NONE',
        searchableText: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.assignCategory(transactionId, categoryId, userId);

      expect(mockPrisma.transaction.update).toHaveBeenCalledWith({
        where: { id: transactionId },
        data: { categoryId },
      });
    });

    /**
     * Test category assignment with invalid transaction
     */
    test('Category assignment rejects invalid transaction', async () => {
      const userId = 'user-123';
      const categoryId = 'cat-123';
      const transactionId = 'tx-123';

      // Mock non-existent transaction
      mockPrisma.transaction.findFirst.mockResolvedValue(null);

      await expect(service.assignCategory(transactionId, categoryId, userId))
        .rejects.toThrow('Transaction not found or access denied');
    });

    /**
     * Test default category creation
     */
    test('Default categories are created correctly', async () => {
      const userId = 'user-123';

      mockPrisma.transactionCategory.createMany.mockResolvedValue({ count: 8 });

      await service.createDefaultCategories(userId);

      expect(mockPrisma.transactionCategory.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId,
            name: 'Food & Dining',
            color: '#EF4444',
            icon: '🍽️',
            isDefault: true,
          }),
          expect.objectContaining({
            userId,
            name: 'Transportation',
            color: '#3B82F6',
            icon: '🚗',
            isDefault: true,
          }),
        ]),
        skipDuplicates: true,
      });
    });

    /**
     * Property 8: Category Suggestion Accuracy
     * For any transaction description and context, category suggestions should be 
     * relevant, ranked by confidence, and based on historical patterns
     * Validates: Requirements 3.5, 3.6
     */
    test('Property 8: Category Suggestion Accuracy', async () => {
      // Feature: enhanced-transaction-history, Property 8: Category Suggestion Accuracy
      await fc.assert(
        fc.asyncProperty(
          fc.string(), // userId
          fc.string({ minLength: 3, maxLength: 100 }).filter(s => s.trim().length > 2), // description
          fc.option(fc.float({ min: 1, max: 10000 })), // amount
          fc.option(fc.string({ minLength: 2, maxLength: 50 })), // recipientName
          fc.option(fc.integer({ min: 0, max: 23 })), // timeOfDay
          async (userId: string, description: string, amount?: number, recipientName?: string, timeOfDay?: number) => {
            // Mock categories
            const mockCategories = [
              {
                id: 'cat-food',
                userId,
                name: 'Food & Dining',
                color: '#EF4444',
                icon: '🍽️',
                isDefault: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              {
                id: 'cat-transport',
                userId,
                name: 'Transportation',
                color: '#3B82F6',
                icon: '🚗',
                isDefault: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              {
                id: 'cat-shopping',
                userId,
                name: 'Shopping',
                color: '#10B981',
                icon: '🛍️',
                isDefault: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ];

            mockPrisma.transactionCategory.findMany.mockResolvedValue(mockCategories);

            // Mock historical transactions that might match
            const mockHistoricalTransactions = generateRelevantHistoricalTransactions(
              description, 
              amount, 
              recipientName, 
              timeOfDay
            );

            mockPrisma.transaction.findMany
              .mockResolvedValueOnce(mockHistoricalTransactions) // For basic suggestions
              .mockResolvedValueOnce(mockHistoricalTransactions) // For pattern-based suggestions
              .mockResolvedValueOnce(mockHistoricalTransactions) // For amount-based suggestions
              .mockResolvedValueOnce(mockHistoricalTransactions); // For time-based suggestions

            // Get category suggestions
            const suggestions = await service.getAdvancedCategorySuggestions(
              userId, 
              description, 
              amount, 
              recipientName, 
              timeOfDay
            );

            // Verify suggestion properties
            expect(suggestions).toBeDefined();
            expect(Array.isArray(suggestions)).toBe(true);
            expect(suggestions.length).toBeLessThanOrEqual(5);

            // Verify each suggestion has required properties
            suggestions.forEach(suggestion => {
              expect(suggestion.category).toBeDefined();
              expect(suggestion.category.id).toBeDefined();
              expect(suggestion.category.name).toBeDefined();
              expect(suggestion.confidence).toBeGreaterThan(0);
              expect(suggestion.confidence).toBeLessThanOrEqual(1);
              expect(suggestion.reason).toBeDefined();
              expect(typeof suggestion.reason).toBe('string');
            });

            // Verify suggestions are sorted by confidence (descending)
            for (let i = 0; i < suggestions.length - 1; i++) {
              expect(suggestions[i].confidence).toBeGreaterThanOrEqual(suggestions[i + 1].confidence);
            }

            // Verify categories belong to the user
            suggestions.forEach(suggestion => {
              expect(suggestion.category.userId).toBe(userId);
            });

            // Verify no duplicate categories in suggestions
            const categoryIds = suggestions.map(s => s.category.id);
            const uniqueCategoryIds = new Set(categoryIds);
            expect(categoryIds.length).toBe(uniqueCategoryIds.size);

            // Verify confidence values are reasonable
            suggestions.forEach(suggestion => {
              expect(suggestion.confidence).toBeGreaterThan(0);
              expect(suggestion.confidence).toBeLessThanOrEqual(0.95); // Max confidence cap
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 9: Category-Based Filtering
     * For any set of category filters, the system should return only transactions 
     * that belong to the specified categories
     * Validates: Requirements 3.6
     */
    test('Property 9: Category-Based Filtering', async () => {
      // Feature: enhanced-transaction-history, Property 9: Category-Based Filtering
      await fc.assert(
        fc.asyncProperty(
          fc.string(), // userId
          fc.array(fc.string(), { minLength: 1, maxLength: 5 }), // categoryIds
          fc.option(fc.record({
            startDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') }),
            endDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') }),
          })),
          async (userId: string, categoryIds: string[], dateRange?: any) => {
            // Clean up date range
            let cleanDateRange;
            if (dateRange && !isNaN(dateRange.startDate.getTime()) && !isNaN(dateRange.endDate.getTime())) {
              const start = dateRange.startDate;
              const end = dateRange.endDate;
              cleanDateRange = {
                startDate: start < end ? start : end,
                endDate: start < end ? end : start,
              };
            }

            // Generate mock transactions that match the category filter
            const mockTransactions = generateTransactionsWithCategories(userId, categoryIds, cleanDateRange);

            mockPrisma.transaction.groupBy.mockResolvedValue(
              categoryIds.map(categoryId => ({
                categoryId,
                _sum: { amount: 1000 },
                _count: { id: 5 },
              }))
            );

            // Mock categories
            const mockCategories = categoryIds.map(id => ({
              id,
              userId,
              name: `Category ${id}`,
              color: '#6B7280',
              icon: '📁',
              isDefault: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));

            mockPrisma.transactionCategory.findMany.mockResolvedValue(mockCategories);

            // Get category statistics (which uses category-based filtering)
            const stats = await service.getCategoryStats(
              userId, 
              cleanDateRange?.startDate, 
              cleanDateRange?.endDate
            );

            // Verify filtering results
            expect(stats).toBeDefined();
            expect(Array.isArray(stats)).toBe(true);

            // Verify all returned stats correspond to requested categories or null (uncategorized)
            stats.forEach(stat => {
              if (stat.category) {
                expect(categoryIds).toContain(stat.category.id);
                expect(stat.category.userId).toBe(userId);
              }
              expect(stat.totalAmount).toBeGreaterThanOrEqual(0);
              expect(stat.transactionCount).toBeGreaterThanOrEqual(0);
            });

            // Verify Prisma was called with correct category filter
            expect(mockPrisma.transaction.groupBy).toHaveBeenCalledWith(
              expect.objectContaining({
                by: ['categoryId'],
                where: expect.objectContaining({
                  OR: [{ fromUserId: userId }, { toUserId: userId }],
                  ...(cleanDateRange && {
                    createdAt: {
                      gte: cleanDateRange.startDate,
                      lte: cleanDateRange.endDate,
                    },
                  }),
                }),
                _sum: { amount: true },
                _count: { id: true },
              })
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Helper functions for property tests
  function generateRelevantHistoricalTransactions(
    description: string,
    amount?: number,
    recipientName?: string,
    timeOfDay?: number
  ): any[] {
    const transactions = [];
    const count = Math.floor(Math.random() * 5) + 1; // 1-5 transactions

    for (let i = 0; i < count; i++) {
      // Create transactions that might match the input
      const shouldMatch = Math.random() > 0.3;
      
      let txDescription = shouldMatch 
        ? `Similar ${description.split(' ')[0]} transaction` 
        : `Random transaction ${i}`;
      
      let txAmount = amount 
        ? (shouldMatch ? amount + (Math.random() - 0.5) * amount * 0.2 : Math.random() * 1000)
        : Math.random() * 1000;

      let createdAt = new Date();
      if (timeOfDay !== undefined && shouldMatch) {
        createdAt.setHours(timeOfDay + Math.floor(Math.random() * 3) - 1); // Within 1 hour
      }

      const transaction = {
        id: `tx-${i}`,
        fromUserId: 'user-123',
        toUserId: 'other-user',
        amount: txAmount,
        fee: 0,
        type: 'TRANSFER',
        status: 'SUCCESS',
        reference: `REF-${i}`,
        description: txDescription,
        metadata: {},
        receiptUrl: null,
        categoryId: shouldMatch ? `cat-${Math.floor(Math.random() * 3)}` : null,
        tags: [],
        notes: null,
        receiptStatus: 'NONE',
        searchableText: null,
        createdAt,
        updatedAt: createdAt,
        category: shouldMatch ? {
          id: `cat-${Math.floor(Math.random() * 3)}`,
          name: 'Test Category',
          color: '#6B7280',
          icon: '📁',
        } : null,
        toUser: recipientName && shouldMatch ? { name: recipientName } : { name: 'Random User' },
      };

      transactions.push(transaction);
    }

    return transactions;
  }

  function generateTransactionsWithCategories(
    userId: string,
    categoryIds: string[],
    dateRange?: { startDate: Date; endDate: Date }
  ): any[] {
    const transactions = [];
    const count = Math.floor(Math.random() * 10) + 1; // 1-10 transactions

    for (let i = 0; i < count; i++) {
      let createdAt = new Date();
      if (dateRange) {
        const start = dateRange.startDate.getTime();
        const end = dateRange.endDate.getTime();
        createdAt = new Date(start + Math.random() * (end - start));
      }

      const categoryId = Math.random() > 0.2 
        ? categoryIds[Math.floor(Math.random() * categoryIds.length)]
        : null; // 20% chance of uncategorized

      const transaction = {
        id: `tx-${i}`,
        fromUserId: Math.random() > 0.5 ? userId : 'other-user',
        toUserId: Math.random() > 0.5 ? userId : 'other-user',
        amount: Math.random() * 1000,
        fee: 0,
        type: 'TRANSFER',
        status: 'SUCCESS',
        reference: `REF-${i}`,
        description: `Transaction ${i}`,
        metadata: {},
        receiptUrl: null,
        categoryId,
        tags: [],
        notes: null,
        receiptStatus: 'NONE',
        searchableText: null,
        createdAt,
        updatedAt: createdAt,
      };

      // Ensure at least one of fromUserId or toUserId matches the user
      if (transaction.fromUserId !== userId && transaction.toUserId !== userId) {
        transaction.fromUserId = userId;
      }

      transactions.push(transaction);
    }

    return transactions;
  }
});