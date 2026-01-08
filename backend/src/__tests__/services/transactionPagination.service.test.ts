import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fc from 'fast-check';
import { transactionPaginationService } from '../../services/transactionPagination.service';
import { transactionFilterService } from '../../services/transactionFilter.service';
import { transactionCacheService } from '../../services/transactionCache.service';
import { prisma } from '../../lib/prisma';
import { 
  TransactionFilters, 
  EnhancedTransaction,
  PaginationOptions,
  PaginatedResult 
} from '../../types/transaction';
import { TransactionType, TransactionStatus } from '@prisma/client';

// Mock dependencies
jest.mock('../../lib/prisma', () => ({
  prisma: {
    transaction: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock('../../services/transactionFilter.service');
jest.mock('../../services/transactionCache.service');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockFilterService = transactionFilterService as jest.Mocked<typeof transactionFilterService>;
const mockCacheService = transactionCacheService as jest.Mocked<typeof transactionCacheService>;

describe('TransactionPaginationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    
    // Default mock implementations
    mockCacheService.get.mockResolvedValue(null);
    mockCacheService.set.mockResolvedValue(undefined);
    mockCacheService.clearByPattern.mockResolvedValue(5);
    mockCacheService.getStats.mockResolvedValue({
      hitRate: 0.75,
      totalRequests: 100,
      cacheSize: 50,
      memoryUsage: 1024,
      averageAccessTime: 5,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Arbitraries for property-based testing
  const transactionTypeArb = fc.constantFrom(...Object.values(TransactionType));
  const transactionStatusArb = fc.constantFrom(...Object.values(TransactionStatus));
  const sortFieldArb = fc.constantFrom('createdAt', 'amount', 'type', 'status');
  const sortOrderArb = fc.constantFrom('asc', 'desc');
  const pageSizeArb = fc.constantFrom(10, 20, 50, 100);

  const userArb = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    email: fc.emailAddress(),
  });

  const categoryArb = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    color: fc.integer({ min: 0, max: 16777215 }).map(n => `#${n.toString(16).padStart(6, '0')}`),
    icon: fc.option(fc.string({ minLength: 1, maxLength: 5 })),
  });

  const enhancedTransactionArb = fc.record({
    id: fc.uuid(),
    fromUserId: fc.option(fc.uuid()),
    toUserId: fc.option(fc.uuid()),
    amount: fc.float({ min: Math.fround(0.01), max: Math.fround(100000) }),
    fee: fc.float({ min: Math.fround(0), max: Math.fround(1000) }),
    type: transactionTypeArb,
    status: transactionStatusArb,
    reference: fc.string({ minLength: 5, maxLength: 20 }),
    description: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
    metadata: fc.option(fc.object()),
    receiptUrl: fc.option(fc.webUrl()),
    categoryId: fc.option(fc.uuid()),
    tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
    notes: fc.option(fc.string({ minLength: 1, maxLength: 200 })),
    receiptStatus: fc.constantFrom('NONE', 'GENERATING', 'AVAILABLE', 'FAILED'),
    searchableText: fc.option(fc.string({ minLength: 1, maxLength: 500 })),
    createdAt: fc.date(),
    updatedAt: fc.date(),
    fromUser: fc.option(userArb),
    toUser: fc.option(userArb),
    category: fc.option(categoryArb),
  });

  const transactionFiltersArb = fc.record({
    dateRange: fc.option(fc.record({
      startDate: fc.date(),
      endDate: fc.date(),
    })),
    types: fc.option(fc.array(transactionTypeArb, { minLength: 1, maxLength: 3 })),
    statuses: fc.option(fc.array(transactionStatusArb, { minLength: 1, maxLength: 3 })),
    amountRange: fc.option(fc.record({
      min: fc.float({ min: Math.fround(0), max: Math.fround(1000) }),
      max: fc.float({ min: Math.fround(1000), max: Math.fround(100000) }),
    })),
    categories: fc.option(fc.array(fc.uuid(), { minLength: 1, maxLength: 5 })),
    searchQuery: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
  });

  const paginationConfigArb = fc.record({
    page: fc.integer({ min: 1, max: 100 }),
    pageSize: pageSizeArb,
    sortBy: fc.option(sortFieldArb),
    sortOrder: fc.option(sortOrderArb),
  });

  const infiniteScrollConfigArb = fc.record({
    cursor: fc.option(fc.date().map(d => d.toISOString())),
    limit: fc.integer({ min: 1, max: 100 }),
    direction: fc.option(fc.constantFrom('forward', 'backward')),
  });

  /**
   * Property 18: Pagination Configuration
   * For any valid pagination configuration, the system should return results 
   * that respect the page size, sorting, and page number constraints
   */
  it('Property 18: Pagination Configuration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        transactionFiltersArb,
        paginationConfigArb,
        fc.array(enhancedTransactionArb, { minLength: 0, maxLength: 500 }),
        async (userId, filters, paginationConfig, allTransactions) => {
          // Calculate expected results based on pagination
          const totalCount = allTransactions.length;
          const expectedPageSize = paginationConfig.pageSize;
          const expectedPage = paginationConfig.page;
          const startIndex = (expectedPage - 1) * expectedPageSize;
          const endIndex = Math.min(startIndex + expectedPageSize, totalCount);
          const expectedTransactions = allTransactions.slice(startIndex, endIndex);

          // Setup mocks
          mockFilterService.buildWhereClause.mockResolvedValue({});
          mockPrisma.transaction.findMany.mockResolvedValue(expectedTransactions as any);
          mockPrisma.transaction.count.mockResolvedValue(totalCount);

          // Test pagination
          const result = await transactionPaginationService.getPaginatedTransactions(
            userId,
            filters,
            paginationConfig
          );

          // Verify pagination metadata
          expect(result.pagination.currentPage).toBe(expectedPage);
          expect(result.pagination.pageSize).toBe(expectedPageSize);
          expect(result.pagination.totalCount).toBe(totalCount);
          expect(result.pagination.totalPages).toBe(Math.ceil(totalCount / expectedPageSize));
          
          // Verify page boundaries
          expect(result.pagination.hasNextPage).toBe(expectedPage < Math.ceil(totalCount / expectedPageSize));
          expect(result.pagination.hasPreviousPage).toBe(expectedPage > 1);

          // Verify data constraints
          expect(result.data.length).toBeLessThanOrEqual(expectedPageSize);
          
          // If we have data, verify indices
          if (totalCount > 0) {
            const expectedStartIndex = startIndex + 1;
            const expectedEndIndex = Math.min(expectedPage * expectedPageSize, totalCount);
            expect(result.pagination.startIndex).toBe(expectedStartIndex);
            expect(result.pagination.endIndex).toBe(expectedEndIndex);
          } else {
            expect(result.pagination.startIndex).toBe(0);
            expect(result.pagination.endIndex).toBe(0);
          }

          // Verify database query was called with correct parameters
          expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith({
            where: {},
            include: expect.any(Object),
            orderBy: expect.any(Object),
            skip: startIndex,
            take: expectedPageSize,
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 19: Infinite Scroll Functionality
   * For any cursor-based pagination request, the system should return results 
   * that maintain proper ordering and cursor continuity
   */
  it('Property 19: Infinite Scroll Functionality', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        transactionFiltersArb,
        infiniteScrollConfigArb,
        fc.array(enhancedTransactionArb, { minLength: 0, maxLength: 200 }),
        async (userId, filters, scrollConfig, allTransactions) => {
          // Sort transactions by createdAt desc (default for infinite scroll)
          const sortedTransactions = [...allTransactions].sort((a, b) => 
            b.createdAt.getTime() - a.createdAt.getTime()
          );

          // Calculate expected results based on cursor and limit
          let expectedTransactions = sortedTransactions;
          
          if (scrollConfig.cursor) {
            const cursorDate = new Date(scrollConfig.cursor);
            if (scrollConfig.direction === 'backward') {
              // For backward direction, we want transactions AFTER the cursor (newer)
              expectedTransactions = sortedTransactions.filter(t => t.createdAt > cursorDate);
            } else {
              // For forward direction, we want transactions BEFORE the cursor (older)
              expectedTransactions = sortedTransactions.filter(t => t.createdAt < cursorDate);
            }
          }

          const limitedTransactions = expectedTransactions.slice(0, scrollConfig.limit);
          // The service takes limit + 1 and removes the extra if present
          // hasMore is true if we originally had more than the limit
          const hasMore = expectedTransactions.length > scrollConfig.limit;

          // Setup mocks
          mockFilterService.buildWhereClause.mockResolvedValue({});
          mockPrisma.transaction.findMany.mockResolvedValue(limitedTransactions as any);
          mockPrisma.transaction.count.mockResolvedValue(allTransactions.length);

          // Test infinite scroll
          const result = await transactionPaginationService.getInfiniteScrollTransactions(
            userId,
            filters,
            scrollConfig
          );

          // Verify scroll metadata
          expect(result.metadata.totalCount).toBe(allTransactions.length);
          expect(result.metadata.hasMore).toBe(hasMore);

          // Verify cursor generation
          if (limitedTransactions.length > 0) {
            const lastTransaction = limitedTransactions[limitedTransactions.length - 1];
            const firstTransaction = limitedTransactions[0];
            
            if (hasMore) {
              expect(result.metadata.nextCursor).toBe(lastTransaction.createdAt.toISOString());
            } else {
              expect(result.metadata.nextCursor).toBeUndefined();
            }
            
            expect(result.metadata.previousCursor).toBe(firstTransaction.createdAt.toISOString());
          } else {
            expect(result.metadata.nextCursor).toBeUndefined();
            expect(result.metadata.previousCursor).toBeUndefined();
          }

          // Verify data constraints
          expect(result.data.length).toBeLessThanOrEqual(scrollConfig.limit);

          // Verify database query parameters
          const expectedWhereClause = scrollConfig.cursor ? 
            expect.objectContaining({
              createdAt: expect.any(Object)
            }) : {};

          expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith({
            where: expectedWhereClause,
            include: expect.any(Object),
            orderBy: { createdAt: expect.any(String) },
            take: scrollConfig.limit + 1, // +1 to check for more results
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 20: Pagination Count Accuracy
   * For any dataset and pagination configuration, the total count should 
   * accurately reflect the number of items that match the filters
   */
  it('Property 20: Pagination Count Accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        transactionFiltersArb,
        paginationConfigArb,
        fc.integer({ min: 0, max: 1000 }),
        async (userId, filters, paginationConfig, actualCount) => {
          // Setup mocks
          mockFilterService.buildWhereClause.mockResolvedValue({});
          mockPrisma.transaction.count.mockResolvedValue(actualCount);
          
          // Create mock transactions for the current page
          const pageSize = paginationConfig.pageSize;
          const page = paginationConfig.page;
          const startIndex = (page - 1) * pageSize;
          const itemsOnPage = Math.max(0, Math.min(pageSize, actualCount - startIndex));
          
          const mockTransactions = Array.from({ length: itemsOnPage }, (_, i) => ({
            id: `transaction-${startIndex + i}`,
            createdAt: new Date(),
            amount: 100,
            type: 'TRANSFER',
            status: 'SUCCESS',
          }));

          mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions as any);

          // Test pagination
          const result = await transactionPaginationService.getPaginatedTransactions(
            userId,
            filters,
            paginationConfig
          );

          // Verify count accuracy
          expect(result.pagination.totalCount).toBe(actualCount);
          
          // Verify calculated values based on count
          const expectedTotalPages = Math.ceil(actualCount / pageSize);
          expect(result.pagination.totalPages).toBe(expectedTotalPages);
          
          // Verify page boundaries are calculated correctly
          expect(result.pagination.hasNextPage).toBe(page < expectedTotalPages);
          expect(result.pagination.hasPreviousPage).toBe(page > 1);
          
          // Verify start/end indices - check the actual service implementation logic
          const totalPages = Math.ceil(actualCount / pageSize);
          const hasDataOnPage = page <= totalPages && actualCount > 0;
          
          if (hasDataOnPage) {
            const expectedStartIndex = startIndex + 1;
            const expectedEndIndex = Math.min(page * pageSize, actualCount);
            expect(result.pagination.startIndex).toBe(expectedStartIndex);
            expect(result.pagination.endIndex).toBe(expectedEndIndex);
          } else {
            // When no items on current page or page is beyond data
            expect(result.pagination.startIndex).toBe(0);
            expect(result.pagination.endIndex).toBe(0);
          }

          // Verify actual data length matches expected
          expect(result.data.length).toBe(itemsOnPage);

          // Verify count query was made with same filters as data query
          expect(mockPrisma.transaction.count).toHaveBeenCalledWith({
            where: {},
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 21: Data Caching Efficiency
   * For any repeated pagination request, the system should utilize caching 
   * to improve performance while maintaining data consistency
   */
  it('Property 21: Data Caching Efficiency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        transactionFiltersArb,
        paginationConfigArb,
        fc.array(enhancedTransactionArb, { minLength: 1, maxLength: 50 }),
        async (userId, filters, paginationConfig, transactions) => {
          const totalCount = transactions.length;
          
          // Setup mocks for first request (cache miss)
          mockCacheService.get.mockResolvedValueOnce(null); // Cache miss
          mockFilterService.buildWhereClause.mockResolvedValue({});
          mockPrisma.transaction.findMany.mockResolvedValue(transactions as any);
          mockPrisma.transaction.count.mockResolvedValue(totalCount);

          // First request - should hit database
          const firstResult = await transactionPaginationService.getPaginatedTransactions(
            userId,
            filters,
            paginationConfig
          );

          // Verify first request behavior
          expect(firstResult.fromCache).toBe(false);
          expect(mockCacheService.get).toHaveBeenCalled();
          expect(mockCacheService.set).toHaveBeenCalled();
          expect(mockPrisma.transaction.findMany).toHaveBeenCalled();

          // Reset mocks for second request
          jest.clearAllMocks();
          
          // Setup mocks for second request (cache hit)
          const cachedResult = {
            data: transactions,
            pagination: firstResult.pagination,
            executionTime: Math.max(0, firstResult.executionTime - 1), // Ensure cached is faster
            fromCache: true,
          };
          mockCacheService.get.mockResolvedValueOnce(cachedResult);

          // Second identical request - should hit cache
          const secondResult = await transactionPaginationService.getPaginatedTransactions(
            userId,
            filters,
            paginationConfig
          );

          // Verify second request used cache
          expect(secondResult.fromCache).toBe(true);
          expect(secondResult.data).toEqual(transactions);
          expect(mockCacheService.get).toHaveBeenCalled();
          expect(mockCacheService.set).not.toHaveBeenCalled(); // Should not set again
          expect(mockPrisma.transaction.findMany).not.toHaveBeenCalled(); // Should not hit DB

          // Verify cache efficiency - cached request should be faster or equal
          // (In some edge cases, the mock timing might be equal)
          expect(secondResult.executionTime).toBeLessThanOrEqual(firstResult.executionTime);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test pagination configuration validation
   */
  it('should validate pagination configuration correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          page: fc.option(fc.integer()),
          pageSize: fc.option(fc.integer()),
          sortBy: fc.option(fc.string()),
          sortOrder: fc.option(fc.string()),
        }),
        async (config) => {
          const result = transactionPaginationService.validatePaginationConfig(config);

          // Check page validation
          if (config.page !== undefined) {
            if (!Number.isInteger(config.page) || config.page < 1) {
              expect(result.errors).toContain('Page must be a positive integer');
            }
          }

          // Check pageSize validation
          if (config.pageSize !== undefined) {
            const allowedSizes = [10, 20, 50, 100];
            if (!allowedSizes.includes(config.pageSize)) {
              expect(result.errors).toContain(`Page size must be one of: ${allowedSizes.join(', ')}`);
            }
          }

          // Check sortBy validation
          if (config.sortBy !== undefined) {
            const allowedFields = ['createdAt', 'amount', 'type', 'status'];
            if (!allowedFields.includes(config.sortBy)) {
              expect(result.errors).toContain(`Sort field must be one of: ${allowedFields.join(', ')}`);
            }
          }

          // Check sortOrder validation
          if (config.sortOrder !== undefined) {
            if (!['asc', 'desc'].includes(config.sortOrder)) {
              expect(result.errors).toContain('Sort order must be "asc" or "desc"');
            }
          }

          // Verify isValid flag
          expect(result.isValid).toBe(result.errors.length === 0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test cache key generation consistency
   */
  it('should generate consistent cache keys for identical requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        transactionFiltersArb,
        paginationConfigArb,
        async (userId, filters, paginationConfig) => {
          // Access private method for testing
          const service = transactionPaginationService as any;
          
          // Generate cache key multiple times with same parameters
          const key1 = service.generateCacheKey(userId, filters, paginationConfig);
          const key2 = service.generateCacheKey(userId, filters, paginationConfig);
          const key3 = service.generateCacheKey(userId, filters, paginationConfig);

          // Verify consistency
          expect(key1).toBe(key2);
          expect(key2).toBe(key3);
          expect(key1).toContain('pagination:');
          expect(key1).toContain(userId);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test infinite scroll cache key generation
   */
  it('should generate consistent scroll cache keys for identical requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        transactionFiltersArb,
        infiniteScrollConfigArb,
        async (userId, filters, scrollConfig) => {
          // Access private method for testing
          const service = transactionPaginationService as any;
          
          // Generate cache key multiple times with same parameters
          const key1 = service.generateScrollCacheKey(userId, filters, scrollConfig);
          const key2 = service.generateScrollCacheKey(userId, filters, scrollConfig);

          // Verify consistency
          expect(key1).toBe(key2);
          expect(key1).toContain('scroll:');
          expect(key1).toContain(userId);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test page size options
   */
  it('should return valid page size options', () => {
    const options = transactionPaginationService.getPageSizeOptions();
    
    expect(options).toEqual([10, 20, 50, 100]);
    expect(options.length).toBe(4);
    expect(options.every(size => Number.isInteger(size) && size > 0)).toBe(true);
  });

  /**
   * Test default pagination configuration
   */
  it('should return valid default pagination configuration', () => {
    const defaultConfig = transactionPaginationService.getDefaultPaginationConfig();
    
    expect(defaultConfig.page).toBe(1);
    expect(defaultConfig.pageSize).toBe(20);
    expect(defaultConfig.sortBy).toBe('createdAt');
    expect(defaultConfig.sortOrder).toBe('desc');
    
    // Verify it passes validation
    const validation = transactionPaginationService.validatePaginationConfig(defaultConfig);
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  /**
   * Test cache clearing functionality
   */
  it('should clear user pagination cache correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (userId) => {
          // Reset mocks for this specific test
          jest.clearAllMocks();
          mockCacheService.clearByPattern.mockResolvedValue(5);

          // Test cache clearing
          await transactionPaginationService.clearUserPaginationCache(userId);

          // Verify cache patterns were cleared
          expect(mockCacheService.clearByPattern).toHaveBeenCalledWith(`pagination:${userId}:*`);
          expect(mockCacheService.clearByPattern).toHaveBeenCalledWith(`scroll:${userId}:*`);
          expect(mockCacheService.clearByPattern).toHaveBeenCalledTimes(2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test cache statistics retrieval
   */
  it('should retrieve cache statistics correctly', async () => {
    const mockStats = {
      hitRate: 0.85,
      totalRequests: 200,
      cacheSize: 75,
      memoryUsage: 2048,
      averageAccessTime: 3.5,
    };

    mockCacheService.getStats.mockResolvedValue(mockStats);

    const stats = await transactionPaginationService.getCacheStats();

    expect(stats).toEqual(mockStats);
    expect(mockCacheService.getStats).toHaveBeenCalled();
  });

  /**
   * Test sorting behavior consistency
   */
  it('should apply sorting consistently across pagination requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        sortFieldArb,
        sortOrderArb,
        fc.array(enhancedTransactionArb, { minLength: 10, maxLength: 100 }),
        async (userId, sortBy, sortOrder, transactions) => {
          const paginationConfig = {
            page: 1,
            pageSize: 20,
            sortBy,
            sortOrder,
          };

          // Setup mocks
          mockFilterService.buildWhereClause.mockResolvedValue({});
          mockPrisma.transaction.findMany.mockResolvedValue(transactions.slice(0, 20) as any);
          mockPrisma.transaction.count.mockResolvedValue(transactions.length);

          // Test pagination with sorting
          await transactionPaginationService.getPaginatedTransactions(
            userId,
            {},
            paginationConfig
          );

          // Verify sorting was applied to database query
          const findManyCall = mockPrisma.transaction.findMany.mock.calls[0][0];
          expect(findManyCall.orderBy).toBeDefined();
          
          // The service normalizes the config, so we need to check the normalized values
          // When sortBy or sortOrder are null/undefined, they get default values
          const normalizedSortBy = paginationConfig.sortBy || 'createdAt';
          const normalizedSortOrder = paginationConfig.sortOrder || 'desc';
          
          // Verify primary sort field
          if (normalizedSortBy === 'createdAt') {
            expect(findManyCall.orderBy.createdAt).toBe(normalizedSortOrder);
          } else {
            expect(findManyCall.orderBy[normalizedSortBy]).toBe(normalizedSortOrder);
            // Verify secondary sort by createdAt for consistency (always 'desc')
            expect(findManyCall.orderBy.createdAt).toBe('desc');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});