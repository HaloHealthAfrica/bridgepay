import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { 
  TransactionFilters, 
  FilteredResult, 
  FilterPreset, 
  EnhancedTransaction 
} from "../types/transaction";

export class TransactionFilterService {
  /**
   * Apply multiple filters to transactions and return filtered results
   */
  async applyFilters(userId: string, filters: TransactionFilters): Promise<FilteredResult> {
    const startTime = Date.now();
    
    // Build the where clause
    const where = this.buildWhereClause(userId, filters);
    
    // Execute query with pagination
    const [transactions, totalCount] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          fromUser: { select: { id: true, name: true, phone: true } },
          toUser: { select: { id: true, name: true, phone: true } },
          category: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.transaction.count({ where }),
    ]);

    const executionTime = Date.now() - startTime;

    return {
      transactions: transactions.map(this.mapToEnhancedTransaction),
      totalCount,
      appliedFilters: filters,
      executionTime,
    };
  }

  /**
   * Save a filter preset for the user
   */
  async saveFilterPreset(userId: string, name: string, filters: TransactionFilters): Promise<FilterPreset> {
    const preset = await prisma.transactionFilterPreset.create({
      data: {
        userId,
        name,
        filters: filters as any,
        lastUsed: new Date(),
      },
    });

    return this.mapToFilterPreset(preset);
  }

  /**
   * Get all filter presets for a user
   */
  async getFilterPresets(userId: string): Promise<FilterPreset[]> {
    const presets = await prisma.transactionFilterPreset.findMany({
      where: { userId },
      orderBy: [
        { isDefault: 'desc' },
        { lastUsed: 'desc' },
      ],
    });

    return presets.map(this.mapToFilterPreset);
  }

  /**
   * Update the last used timestamp for a filter preset
   */
  async updatePresetLastUsed(presetId: string, userId: string): Promise<void> {
    await prisma.transactionFilterPreset.updateMany({
      where: { id: presetId, userId },
      data: { lastUsed: new Date() },
    });
  }

  /**
   * Delete a filter preset
   */
  async deleteFilterPreset(presetId: string, userId: string): Promise<void> {
    await prisma.transactionFilterPreset.deleteMany({
      where: { id: presetId, userId },
    });
  }

  /**
   * Build Prisma where clause from filters
   */
  buildWhereClause(userId: string, filters: TransactionFilters): Prisma.TransactionWhereInput {
    const where: Prisma.TransactionWhereInput = {
      OR: [
        { fromUserId: userId },
        { toUserId: userId },
      ],
    };

    // Date range filter
    if (filters.dateRange) {
      where.createdAt = {
        gte: filters.dateRange.startDate,
        lte: filters.dateRange.endDate,
      };
    }

    // Transaction type filter
    if (filters.types && filters.types.length > 0) {
      where.type = { in: filters.types };
    }

    // Transaction status filter
    if (filters.statuses && filters.statuses.length > 0) {
      where.status = { in: filters.statuses };
    }

    // Amount range filter
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

    // Category filter
    if (filters.categories && filters.categories.length > 0) {
      where.categoryId = { in: filters.categories };
    }

    // Search query filter
    if (filters.searchQuery) {
      const searchTerm = `%${filters.searchQuery.toLowerCase()}%`;
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

  /**
   * Map Prisma transaction to EnhancedTransaction
   */
  private mapToEnhancedTransaction(transaction: any): EnhancedTransaction {
    return {
      id: transaction.id,
      fromUserId: transaction.fromUserId,
      toUserId: transaction.toUserId,
      amount: Number(transaction.amount),
      fee: Number(transaction.fee),
      type: transaction.type,
      status: transaction.status,
      reference: transaction.reference,
      description: transaction.description,
      metadata: transaction.metadata,
      receiptUrl: transaction.receiptUrl,
      categoryId: transaction.categoryId,
      tags: transaction.tags || [],
      notes: transaction.notes,
      receiptStatus: transaction.receiptStatus || 'NONE',
      searchableText: transaction.searchableText,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      fromUser: transaction.fromUser,
      toUser: transaction.toUser,
      category: transaction.category,
    };
  }

  /**
   * Map Prisma filter preset to FilterPreset
   */
  private mapToFilterPreset(preset: any): FilterPreset {
    return {
      id: preset.id,
      userId: preset.userId,
      name: preset.name,
      filters: preset.filters as TransactionFilters,
      isDefault: preset.isDefault,
      lastUsed: preset.lastUsed,
      createdAt: preset.createdAt,
      updatedAt: preset.updatedAt,
    };
  }

  /**
   * Create default categories for a new user
   */
  async createDefaultCategories(userId: string): Promise<void> {
    const defaultCategories = [
      { name: 'Food & Dining', color: '#EF4444', icon: '🍽️', isDefault: true },
      { name: 'Transportation', color: '#3B82F6', icon: '🚗', isDefault: true },
      { name: 'Bills & Utilities', color: '#F59E0B', icon: '💡', isDefault: true },
      { name: 'Shopping', color: '#10B981', icon: '🛍️', isDefault: true },
      { name: 'Entertainment', color: '#8B5CF6', icon: '🎬', isDefault: true },
      { name: 'Healthcare', color: '#EC4899', icon: '🏥', isDefault: true },
      { name: 'Education', color: '#06B6D4', icon: '📚', isDefault: true },
      { name: 'Business', color: '#6B7280', icon: '💼', isDefault: true },
    ];

    await prisma.transactionCategory.createMany({
      data: defaultCategories.map(category => ({
        ...category,
        userId,
      })),
      skipDuplicates: true,
    });
  }
}

export const transactionFilterService = new TransactionFilterService();