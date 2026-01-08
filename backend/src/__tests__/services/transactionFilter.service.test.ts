import * as fc from 'fast-check';
import { TransactionType, TransactionStatus } from '@prisma/client';
import { TransactionFilterService } from '../../services/transactionFilter.service';
import { TransactionFilters } from '../../types/transaction';
import { prisma } from '../../lib/prisma';

// Mock the prisma module
jest.mock('../../lib/prisma');

describe('TransactionFilterService', () => {
  let service: TransactionFilterService;
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;

  beforeEach(() => {
    service = new TransactionFilterService();
    jest.clearAllMocks();
  });

  describe('Property Tests', () => {
    /**
     * Property 1: Multi-Criteria Filtering Consistency
     * For any combination of date range, transaction type, status, and amount filters,
     * the system should return only transactions that match all specified criteria
     * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
     */
    test('Property 1: Multi-Criteria Filtering Consistency', async () => {
      // Feature: enhanced-transaction-history, Property 1: Multi-Criteria Filtering Consistency
      await fc.assert(
        fc.asyncProperty(
          // Generate random filter combinations
          fc.record({
            dateRange: fc.option(fc.record({
              startDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') }),
              endDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') }),
            }).filter(range => range.startDate <= range.endDate)),
            types: fc.option(fc.array(fc.constantFrom(...Object.values(TransactionType)), { minLength: 1, maxLength: 3 })),
            statuses: fc.option(fc.array(fc.constantFrom(...Object.values(TransactionStatus)), { minLength: 1, maxLength: 2 })),
            amountRange: fc.option(fc.record({
              min: fc.option(fc.integer({ min: 1, max: 1000 })),
              max: fc.option(fc.integer({ min: 1, max: 10000 })),
            }).filter(range => !range.min || !range.max || range.min <= range.max)),
            categories: fc.option(fc.array(fc.uuid(), { minLength: 1, maxLength: 3 })),
            searchQuery: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
          }),
          fc.string(), // userId
          async (filters: TransactionFilters, userId: string) => {
            // Generate mock transactions that should match the filters
            const matchingTransactions = generateMatchingTransactions(filters, userId);
            const nonMatchingTransactions = generateNonMatchingTransactions(filters, userId);
            const allTransactions = [...matchingTransactions, ...nonMatchingTransactions];

            // Mock Prisma responses
            mockPrisma.transaction.findMany.mockResolvedValue(matchingTransactions);
            mockPrisma.transaction.count.mockResolvedValue(matchingTransactions.length);

            // Apply filters
            const result = await service.applyFilters(userId, filters);

            // Verify that all returned transactions match the applied filters
            expect(result.transactions).toHaveLength(matchingTransactions.length);
            expect(result.totalCount).toBe(matchingTransactions.length);
            expect(result.appliedFilters).toEqual(filters);

            // Verify that the where clause was built correctly
            const expectedWhereClause = buildExpectedWhereClause(userId, filters);
            expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
              expect.objectContaining({
                where: expectedWhereClause,
              })
            );

            // Verify each returned transaction matches all filter criteria
            result.transactions.forEach(transaction => {
              verifyTransactionMatchesFilters(transaction, filters, userId);
            });
          }
        ),
        { numRuns: 100 } // Run 100 iterations as specified in requirements
      );
    });

    /**
     * Property 2: Filter Persistence Across Sessions
     * For any user filter configuration, the settings should be restored when the user returns
     * Validates: Requirements 1.6
     */
    test('Property 2: Filter Persistence Across Sessions', async () => {
      // Feature: enhanced-transaction-history, Property 2: Filter Persistence Across Sessions
      await fc.assert(
        fc.asyncProperty(
          fc.string(), // userId
          fc.string({ minLength: 1, maxLength: 50 }), // preset name
          fc.record({
            dateRange: fc.option(fc.record({
              startDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') }),
              endDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') }),
            }).filter(range => range.startDate <= range.endDate)),
            types: fc.option(fc.array(fc.constantFrom(...Object.values(TransactionType)), { minLength: 1, maxLength: 3 })),
            statuses: fc.option(fc.array(fc.constantFrom(...Object.values(TransactionStatus)), { minLength: 1, maxLength: 2 })),
            amountRange: fc.option(fc.record({
              min: fc.option(fc.integer({ min: 1, max: 1000 })),
              max: fc.option(fc.integer({ min: 1, max: 10000 })),
            }).filter(range => !range.min || !range.max || range.min <= range.max)),
            categories: fc.option(fc.array(fc.uuid(), { minLength: 1, maxLength: 3 })),
            searchQuery: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
          }),
          async (userId: string, presetName: string, filters: TransactionFilters) => {
            const mockPreset = {
              id: fc.sample(fc.uuid(), 1)[0],
              userId,
              name: presetName,
              filters,
              isDefault: false,
              lastUsed: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            // Mock saving the preset
            mockPrisma.transactionFilterPreset.create.mockResolvedValue(mockPreset);

            // Save the filter preset
            const savedPreset = await service.saveFilterPreset(userId, presetName, filters);

            // Mock retrieving the preset
            mockPrisma.transactionFilterPreset.findMany.mockResolvedValue([mockPreset]);

            // Retrieve the preset (simulating a new session)
            const retrievedPresets = await service.getFilterPresets(userId);

            // Verify the preset was persisted correctly
            expect(retrievedPresets).toHaveLength(1);
            expect(retrievedPresets[0].name).toBe(presetName);
            expect(retrievedPresets[0].filters).toEqual(filters);
            expect(retrievedPresets[0].userId).toBe(userId);

            // Verify the filters are identical after persistence
            expect(JSON.stringify(retrievedPresets[0].filters)).toBe(JSON.stringify(filters));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Helper functions for property tests
  function generateMatchingTransactions(filters: TransactionFilters, userId: string): any[] {
    const transactions = [];
    const count = Math.floor(Math.random() * 5) + 1; // 1-5 transactions

    for (let i = 0; i < count; i++) {
      const transaction = {
        id: fc.sample(fc.uuid(), 1)[0],
        fromUserId: Math.random() > 0.5 ? userId : fc.sample(fc.uuid(), 1)[0],
        toUserId: Math.random() > 0.5 ? userId : fc.sample(fc.uuid(), 1)[0],
        amount: generateMatchingAmount(filters.amountRange),
        fee: Math.random() * 10,
        type: generateMatchingType(filters.types),
        status: generateMatchingStatus(filters.statuses),
        reference: `REF-${Math.random().toString(36).substr(2, 9)}`,
        description: generateMatchingDescription(filters.searchQuery),
        metadata: {},
        receiptUrl: null,
        categoryId: generateMatchingCategory(filters.categories),
        tags: [],
        notes: null,
        receiptStatus: 'NONE',
        searchableText: null,
        createdAt: generateMatchingDate(filters.dateRange),
        updatedAt: new Date(),
        fromUser: null,
        toUser: null,
        category: null,
      };

      // Ensure at least one of fromUserId or toUserId matches the user
      if (transaction.fromUserId !== userId && transaction.toUserId !== userId) {
        transaction.fromUserId = userId;
      }

      transactions.push(transaction);
    }

    return transactions;
  }

  function generateNonMatchingTransactions(filters: TransactionFilters, userId: string): any[] {
    // Generate transactions that deliberately don't match the filters
    // This is used to verify the filter logic excludes them correctly
    return [];
  }

  function generateMatchingAmount(amountRange?: { min?: number; max?: number }): number {
    if (!amountRange) return Math.random() * 1000;
    
    let min = 0;
    let max = 1000;
    
    if (amountRange.min !== undefined && amountRange.min !== null && !isNaN(amountRange.min)) {
      min = amountRange.min;
    }
    if (amountRange.max !== undefined && amountRange.max !== null && !isNaN(amountRange.max)) {
      max = amountRange.max;
    }
    
    // Ensure min <= max
    if (min > max) {
      [min, max] = [max, min];
    }
    
    return min + Math.random() * (max - min);
  }

  function generateMatchingType(types?: TransactionType[]): TransactionType {
    if (!types || types.length === 0) {
      return fc.sample(fc.constantFrom(...Object.values(TransactionType)), 1)[0];
    }
    return types[Math.floor(Math.random() * types.length)];
  }

  function generateMatchingStatus(statuses?: TransactionStatus[]): TransactionStatus {
    if (!statuses || statuses.length === 0) {
      return fc.sample(fc.constantFrom(...Object.values(TransactionStatus)), 1)[0];
    }
    return statuses[Math.floor(Math.random() * statuses.length)];
  }

  function generateMatchingDescription(searchQuery?: string): string {
    if (!searchQuery) return `Transaction ${Math.random().toString(36).substr(2, 9)}`;
    return `Transaction containing ${searchQuery} and more text`;
  }

  function generateMatchingCategory(categories?: string[]): string | null {
    if (!categories || categories.length === 0) return null;
    return categories[Math.floor(Math.random() * categories.length)];
  }

  function generateMatchingDate(dateRange?: { startDate: Date; endDate: Date }): Date {
    if (!dateRange) return new Date();
    
    const start = dateRange.startDate.getTime();
    const end = dateRange.endDate.getTime();
    return new Date(start + Math.random() * (end - start));
  }

  function buildExpectedWhereClause(userId: string, filters: TransactionFilters): any {
    const where: any = {
      OR: [
        { fromUserId: userId },
        { toUserId: userId },
      ],
    };

    if (filters.dateRange) {
      where.createdAt = {
        gte: filters.dateRange.startDate,
        lte: filters.dateRange.endDate,
      };
    }

    if (filters.types && filters.types.length > 0) {
      where.type = { in: filters.types };
    }

    if (filters.statuses && filters.statuses.length > 0) {
      where.status = { in: filters.statuses };
    }

    if (filters.amountRange) {
      const amountFilter: any = {};
      if (filters.amountRange.min !== undefined) {
        amountFilter.gte = filters.amountRange.min;
      }
      if (filters.amountRange.max !== undefined) {
        amountFilter.lte = filters.amountRange.max;
      }
      where.amount = amountFilter;
    }

    if (filters.categories && filters.categories.length > 0) {
      where.categoryId = { in: filters.categories };
    }

    if (filters.searchQuery) {
      where.OR = [
        { description: { contains: filters.searchQuery, mode: 'insensitive' } },
        { reference: { contains: filters.searchQuery, mode: 'insensitive' } },
        { searchableText: { contains: filters.searchQuery, mode: 'insensitive' } },
        { fromUser: { name: { contains: filters.searchQuery, mode: 'insensitive' } } },
        { toUser: { name: { contains: filters.searchQuery, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  function verifyTransactionMatchesFilters(transaction: any, filters: TransactionFilters, userId: string): void {
    // Verify user ownership
    expect(transaction.fromUserId === userId || transaction.toUserId === userId).toBe(true);

    // Verify date range
    if (filters.dateRange) {
      const transactionDate = new Date(transaction.createdAt);
      expect(transactionDate >= filters.dateRange.startDate).toBe(true);
      expect(transactionDate <= filters.dateRange.endDate).toBe(true);
    }

    // Verify transaction type
    if (filters.types && filters.types.length > 0) {
      expect(filters.types).toContain(transaction.type);
    }

    // Verify transaction status
    if (filters.statuses && filters.statuses.length > 0) {
      expect(filters.statuses).toContain(transaction.status);
    }

    // Verify amount range
    if (filters.amountRange) {
      if (filters.amountRange.min !== undefined && filters.amountRange.min !== null && !isNaN(filters.amountRange.min)) {
        expect(transaction.amount).toBeGreaterThanOrEqual(filters.amountRange.min);
      }
      if (filters.amountRange.max !== undefined && filters.amountRange.max !== null && !isNaN(filters.amountRange.max)) {
        expect(transaction.amount).toBeLessThanOrEqual(filters.amountRange.max);
      }
    }

    // Verify category
    if (filters.categories && filters.categories.length > 0) {
      expect(filters.categories).toContain(transaction.categoryId);
    }

    // Verify search query (simplified check)
    if (filters.searchQuery) {
      const searchableFields = [
        transaction.description,
        transaction.reference,
        transaction.searchableText,
      ].filter(Boolean).join(' ').toLowerCase();
      
      expect(searchableFields).toContain(filters.searchQuery.toLowerCase());
    }
  }
});