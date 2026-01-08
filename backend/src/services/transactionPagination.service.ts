import { prisma } from '../lib/prisma';
import { TransactionFilters, EnhancedTransaction, PaginationOptions, PaginatedResult } from '../types/transaction';
import { transactionFilterService } from './transactionFilter.service';
import { transactionCacheService } from './transactionCache.service';

export interface PaginationConfig {
  page: number;
  pageSize: number;
  sortBy?: 'createdAt' | 'amount' | 'type' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface InfiniteScrollConfig {
  cursor?: string; // Transaction ID for cursor-based pagination
  limit: number;
  direction?: 'forward' | 'backward';
}

export interface PaginationMetadata {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startIndex: number;
  endIndex: number;
}

export interface InfiniteScrollMetadata {
  hasMore: boolean;
  nextCursor?: string;
  previousCursor?: string;
  totalCount: number;
}

export class TransactionPaginationService {
  private readonly defaultPageSize = 20;
  private readonly allowedPageSizes = [10, 20, 50, 100];
  private readonly maxPageSize = 100;

  /**
   * Get paginated transactions with filtering
   */
  async getPaginatedTransactions(
    userId: string,
    filters: TransactionFilters = {},
    pagination: PaginationConfig
  ): Promise<PaginatedResult<EnhancedTransaction>> {
    const startTime = Date.now();

    // Validate and normalize pagination config
    const normalizedPagination = this.normalizePaginationConfig(pagination);
    
    // Generate cache key for this query
    const cacheKey = this.generateCacheKey(userId, filters, normalizedPagination);
    
    // Try to get from cache first
    const cachedResult = await transactionCacheService.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    // Calculate offset for database query
    const offset = (normalizedPagination.page - 1) * normalizedPagination.pageSize;

    // Get filtered transactions with count
    const [transactions, totalCount] = await Promise.all([
      this.getFilteredTransactions(userId, filters, normalizedPagination, offset),
      this.getFilteredTransactionCount(userId, filters)
    ]);

    // Calculate pagination metadata
    const metadata = this.calculatePaginationMetadata(
      normalizedPagination,
      totalCount
    );

    const result: PaginatedResult<EnhancedTransaction> = {
      data: transactions,
      pagination: metadata,
      executionTime: Date.now() - startTime,
      fromCache: false,
    };

    // Cache the result
    await transactionCacheService.set(cacheKey, result, 300); // 5 minutes TTL

    return result;
  }

  /**
   * Get transactions for infinite scroll
   */
  async getInfiniteScrollTransactions(
    userId: string,
    filters: TransactionFilters = {},
    scrollConfig: InfiniteScrollConfig
  ): Promise<{
    data: EnhancedTransaction[];
    metadata: InfiniteScrollMetadata;
    executionTime: number;
    fromCache: boolean;
  }> {
    const startTime = Date.now();

    // Validate scroll config
    const normalizedConfig = this.normalizeScrollConfig(scrollConfig);
    
    // Generate cache key
    const cacheKey = this.generateScrollCacheKey(userId, filters, normalizedConfig);
    
    // Try cache first
    const cachedResult = await transactionCacheService.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    // Get transactions using cursor-based pagination
    const transactions = await this.getCursorBasedTransactions(
      userId,
      filters,
      normalizedConfig
    );

    // Get total count for metadata
    const totalCount = await this.getFilteredTransactionCount(userId, filters);

    // Calculate scroll metadata
    const metadata = this.calculateScrollMetadata(
      transactions,
      normalizedConfig,
      totalCount
    );

    const result = {
      data: transactions,
      metadata,
      executionTime: Date.now() - startTime,
      fromCache: false,
    };

    // Cache the result
    await transactionCacheService.set(cacheKey, result, 180); // 3 minutes TTL for scroll

    return result;
  }

  /**
   * Get page size options
   */
  getPageSizeOptions(): number[] {
    return [...this.allowedPageSizes];
  }

  /**
   * Get default pagination config
   */
  getDefaultPaginationConfig(): PaginationConfig {
    return {
      page: 1,
      pageSize: this.defaultPageSize,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    };
  }

  /**
   * Validate pagination parameters
   */
  validatePaginationConfig(config: Partial<PaginationConfig>): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (config.page !== undefined) {
      if (!Number.isInteger(config.page) || config.page < 1) {
        errors.push('Page must be a positive integer');
      }
    }

    if (config.pageSize !== undefined) {
      if (!this.allowedPageSizes.includes(config.pageSize)) {
        errors.push(`Page size must be one of: ${this.allowedPageSizes.join(', ')}`);
      }
    }

    if (config.sortBy !== undefined) {
      const allowedSortFields = ['createdAt', 'amount', 'type', 'status'];
      if (!allowedSortFields.includes(config.sortBy)) {
        errors.push(`Sort field must be one of: ${allowedSortFields.join(', ')}`);
      }
    }

    if (config.sortOrder !== undefined) {
      if (!['asc', 'desc'].includes(config.sortOrder)) {
        errors.push('Sort order must be "asc" or "desc"');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clear pagination cache for user
   */
  async clearUserPaginationCache(userId: string): Promise<void> {
    await transactionCacheService.clearByPattern(`pagination:${userId}:*`);
    await transactionCacheService.clearByPattern(`scroll:${userId}:*`);
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    hitRate: number;
    totalRequests: number;
    cacheSize: number;
  }> {
    return await transactionCacheService.getStats();
  }

  /**
   * Normalize pagination configuration
   */
  private normalizePaginationConfig(config: PaginationConfig): PaginationConfig {
    return {
      page: Math.max(1, config.page || 1),
      pageSize: this.allowedPageSizes.includes(config.pageSize) 
        ? config.pageSize 
        : this.defaultPageSize,
      sortBy: config.sortBy || 'createdAt',
      sortOrder: config.sortOrder || 'desc',
    };
  }

  /**
   * Normalize scroll configuration
   */
  private normalizeScrollConfig(config: InfiniteScrollConfig): InfiniteScrollConfig {
    return {
      cursor: config.cursor,
      limit: Math.min(config.limit || 20, this.maxPageSize),
      direction: config.direction || 'forward',
    };
  }

  /**
   * Get filtered transactions with pagination
   */
  private async getFilteredTransactions(
    userId: string,
    filters: TransactionFilters,
    pagination: PaginationConfig,
    offset: number
  ): Promise<EnhancedTransaction[]> {
    // Build the base query
    const whereClause = await transactionFilterService.buildWhereClause(userId, filters);
    
    // Build order by clause
    const orderBy = this.buildOrderByClause(pagination.sortBy!, pagination.sortOrder!);

    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      include: {
        fromUser: {
          select: { id: true, name: true, email: true }
        },
        toUser: {
          select: { id: true, name: true, email: true }
        },
        category: {
          select: { id: true, name: true, color: true, icon: true }
        }
      },
      orderBy,
      skip: offset,
      take: pagination.pageSize,
    });

    return transactions as EnhancedTransaction[];
  }

  /**
   * Get cursor-based transactions for infinite scroll
   */
  private async getCursorBasedTransactions(
    userId: string,
    filters: TransactionFilters,
    config: InfiniteScrollConfig
  ): Promise<EnhancedTransaction[]> {
    const whereClause = await transactionFilterService.buildWhereClause(userId, filters);
    
    // Add cursor condition if provided
    if (config.cursor) {
      if (config.direction === 'forward') {
        whereClause.createdAt = { lt: new Date(config.cursor) };
      } else {
        whereClause.createdAt = { gt: new Date(config.cursor) };
      }
    }

    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      include: {
        fromUser: {
          select: { id: true, name: true, email: true }
        },
        toUser: {
          select: { id: true, name: true, email: true }
        },
        category: {
          select: { id: true, name: true, color: true, icon: true }
        }
      },
      orderBy: { createdAt: config.direction === 'forward' ? 'desc' : 'asc' },
      take: config.limit + 1, // Take one extra to check if there are more
    });

    // Remove the extra transaction if we got it
    if (transactions.length > config.limit) {
      transactions.pop();
    }

    return transactions as EnhancedTransaction[];
  }

  /**
   * Get filtered transaction count
   */
  private async getFilteredTransactionCount(
    userId: string,
    filters: TransactionFilters
  ): Promise<number> {
    const cacheKey = `count:${userId}:${JSON.stringify(filters)}`;
    
    const cachedCount = await transactionCacheService.get(cacheKey);
    if (cachedCount !== null) {
      return cachedCount;
    }

    const whereClause = await transactionFilterService.buildWhereClause(userId, filters);
    
    const count = await prisma.transaction.count({
      where: whereClause,
    });

    // Cache count for 10 minutes
    await transactionCacheService.set(cacheKey, count, 600);

    return count;
  }

  /**
   * Calculate pagination metadata
   */
  private calculatePaginationMetadata(
    config: PaginationConfig,
    totalCount: number
  ): PaginationMetadata {
    const totalPages = Math.ceil(totalCount / config.pageSize);
    const startIndex = (config.page - 1) * config.pageSize + 1;
    const endIndex = Math.min(config.page * config.pageSize, totalCount);

    return {
      currentPage: config.page,
      pageSize: config.pageSize,
      totalCount,
      totalPages,
      hasNextPage: config.page < totalPages,
      hasPreviousPage: config.page > 1,
      startIndex: totalCount > 0 ? startIndex : 0,
      endIndex: totalCount > 0 ? endIndex : 0,
    };
  }

  /**
   * Calculate scroll metadata
   */
  private calculateScrollMetadata(
    transactions: EnhancedTransaction[],
    config: InfiniteScrollConfig,
    totalCount: number
  ): InfiniteScrollMetadata {
    const hasMore = transactions.length === config.limit;
    
    let nextCursor: string | undefined;
    let previousCursor: string | undefined;

    if (transactions.length > 0) {
      const lastTransaction = transactions[transactions.length - 1];
      const firstTransaction = transactions[0];
      
      nextCursor = hasMore ? lastTransaction.createdAt.toISOString() : undefined;
      previousCursor = firstTransaction.createdAt.toISOString();
    }

    return {
      hasMore,
      nextCursor,
      previousCursor,
      totalCount,
    };
  }

  /**
   * Build order by clause
   */
  private buildOrderByClause(sortBy: string, sortOrder: string) {
    const orderBy: any = {};
    
    switch (sortBy) {
      case 'createdAt':
        orderBy.createdAt = sortOrder;
        break;
      case 'amount':
        orderBy.amount = sortOrder;
        // Add secondary sort by createdAt for consistency
        orderBy.createdAt = 'desc';
        break;
      case 'type':
        orderBy.type = sortOrder;
        orderBy.createdAt = 'desc';
        break;
      case 'status':
        orderBy.status = sortOrder;
        orderBy.createdAt = 'desc';
        break;
      default:
        orderBy.createdAt = 'desc';
    }

    return orderBy;
  }

  /**
   * Generate cache key for pagination
   */
  private generateCacheKey(
    userId: string,
    filters: TransactionFilters,
    pagination: PaginationConfig
  ): string {
    const filterHash = JSON.stringify(filters);
    const paginationHash = JSON.stringify(pagination);
    return `pagination:${userId}:${Buffer.from(filterHash + paginationHash).toString('base64')}`;
  }

  /**
   * Generate cache key for infinite scroll
   */
  private generateScrollCacheKey(
    userId: string,
    filters: TransactionFilters,
    config: InfiniteScrollConfig
  ): string {
    const filterHash = JSON.stringify(filters);
    const configHash = JSON.stringify(config);
    return `scroll:${userId}:${Buffer.from(filterHash + configHash).toString('base64')}`;
  }
}

export const transactionPaginationService = new TransactionPaginationService();