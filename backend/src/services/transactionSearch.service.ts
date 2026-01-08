import { prisma } from "../lib/prisma";
import { 
  SearchResult, 
  TransactionFilters, 
  EnhancedTransaction 
} from "../types/transaction";

export class TransactionSearchService {
  /**
   * Search transactions with full-text search and optional filters
   */
  async searchTransactions(
    userId: string, 
    query: string, 
    filters?: TransactionFilters
  ): Promise<SearchResult> {
    const startTime = Date.now();
    
    if (!query.trim()) {
      return {
        transactions: [],
        highlights: {},
        totalMatches: 0,
        searchTime: 0,
      };
    }

    // Build search where clause
    const where = this.buildSearchWhereClause(userId, query, filters);
    
    // Execute search
    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        fromUser: { select: { id: true, name: true, phone: true } },
        toUser: { select: { id: true, name: true, phone: true } },
        category: true,
      },
      orderBy: [
        // Prioritize exact matches in reference
        { reference: { contains: query, mode: 'insensitive' } ? 'asc' : 'desc' },
        // Then by creation date
        { createdAt: 'desc' },
      ],
      take: 100, // Limit search results
    });

    const searchTime = Date.now() - startTime;
    const highlights = this.generateHighlights(transactions, query);

    return {
      transactions: transactions.map(this.mapToEnhancedTransaction),
      highlights,
      totalMatches: transactions.length,
      searchTime,
    };
  }

  /**
   * Get search suggestions based on user's transaction history
   */
  async getSearchSuggestions(userId: string, partial: string): Promise<string[]> {
    if (!partial.trim() || partial.length < 2) {
      return [];
    }

    const suggestions = new Set<string>();

    // Search in descriptions
    const descriptions = await prisma.transaction.findMany({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
        description: {
          contains: partial,
          mode: 'insensitive',
        },
      },
      select: { description: true },
      distinct: ['description'],
      take: 10,
    });

    descriptions.forEach(t => {
      if (t.description) {
        // Extract meaningful words from description
        const words = this.extractSearchableWords(t.description);
        words.forEach(word => {
          if (word.toLowerCase().includes(partial.toLowerCase())) {
            suggestions.add(word);
          }
        });
      }
    });

    // Search in recipient/sender names
    const users = await prisma.user.findMany({
      where: {
        name: {
          contains: partial,
          mode: 'insensitive',
        },
      },
      select: { name: true },
      take: 5,
    });

    users.forEach(u => suggestions.add(u.name));

    // Search in categories
    const categories = await prisma.transactionCategory.findMany({
      where: {
        userId,
        name: {
          contains: partial,
          mode: 'insensitive',
        },
      },
      select: { name: true },
      take: 5,
    });

    categories.forEach(c => suggestions.add(c.name));

    // Add common transaction terms if they match
    const commonTerms = [
      'deposit', 'withdrawal', 'transfer', 'payment', 'refund',
      'food', 'transport', 'bills', 'shopping', 'entertainment',
      'mpesa', 'card', 'bank', 'wallet'
    ];

    commonTerms.forEach(term => {
      if (term.toLowerCase().includes(partial.toLowerCase())) {
        suggestions.add(term);
      }
    });

    return Array.from(suggestions)
      .filter(s => s.length >= partial.length)
      .sort((a, b) => {
        // Prioritize exact prefix matches
        const aStartsWith = a.toLowerCase().startsWith(partial.toLowerCase());
        const bStartsWith = b.toLowerCase().startsWith(partial.toLowerCase());
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        return a.localeCompare(b);
      })
      .slice(0, 10);
  }

  /**
   * Highlight search terms in text
   */
  highlightSearchTerms(text: string, query: string): string {
    if (!text || !query) return text;

    const terms = query.toLowerCase().split(/\s+/);
    let highlightedText = text;

    terms.forEach(term => {
      if (term.length > 1) {
        const regex = new RegExp(`(${this.escapeRegex(term)})`, 'gi');
        highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
      }
    });

    return highlightedText;
  }

  /**
   * Update searchable text for a transaction
   */
  async updateSearchableText(transactionId: string): Promise<void> {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        fromUser: { select: { name: true, phone: true } },
        toUser: { select: { name: true, phone: true } },
        category: { select: { name: true } },
      },
    });

    if (!transaction) return;

    // Build searchable text from all relevant fields
    const searchableFields = [
      transaction.description,
      transaction.reference,
      transaction.notes,
      transaction.fromUser?.name,
      transaction.toUser?.name,
      transaction.category?.name,
      ...(transaction.tags || []),
    ].filter(Boolean);

    const searchableText = searchableFields.join(' ').toLowerCase();

    await prisma.transaction.update({
      where: { id: transactionId },
      data: { searchableText },
    });
  }

  /**
   * Bulk update searchable text for all transactions
   */
  async rebuildSearchIndex(userId?: string): Promise<number> {
    const where = userId ? {
      OR: [{ fromUserId: userId }, { toUserId: userId }],
    } : {};

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        fromUser: { select: { name: true, phone: true } },
        toUser: { select: { name: true, phone: true } },
        category: { select: { name: true } },
      },
    });

    let updatedCount = 0;

    for (const transaction of transactions) {
      const searchableFields = [
        transaction.description,
        transaction.reference,
        transaction.notes,
        transaction.fromUser?.name,
        transaction.toUser?.name,
        transaction.category?.name,
        ...(transaction.tags || []),
      ].filter(Boolean);

      const searchableText = searchableFields.join(' ').toLowerCase();

      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { searchableText },
      });

      updatedCount++;
    }

    return updatedCount;
  }

  /**
   * Get popular search terms for a user
   */
  async getPopularSearchTerms(userId: string, limit: number = 10): Promise<string[]> {
    // This would typically be stored in a search analytics table
    // For now, return common terms based on transaction data
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
      },
      select: { description: true, type: true },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });

    const termFrequency = new Map<string, number>();

    transactions.forEach(t => {
      if (t.description) {
        const words = this.extractSearchableWords(t.description);
        words.forEach(word => {
          const count = termFrequency.get(word) || 0;
          termFrequency.set(word, count + 1);
        });
      }
      
      // Add transaction type as a searchable term
      const typeCount = termFrequency.get(t.type.toLowerCase()) || 0;
      termFrequency.set(t.type.toLowerCase(), typeCount + 1);
    });

    return Array.from(termFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([term]) => term);
  }

  /**
   * Build search where clause
   */
  private buildSearchWhereClause(
    userId: string, 
    query: string, 
    filters?: TransactionFilters
  ): any {
    const baseWhere = {
      OR: [{ fromUserId: userId }, { toUserId: userId }],
    };

    // Add search conditions with weighted relevance
    const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    const searchConditions = {
      OR: [
        // Exact reference match (highest priority)
        { reference: { equals: query, mode: 'insensitive' } },
        // Reference contains (high priority)
        { reference: { contains: query, mode: 'insensitive' } },
        // Description contains full query (medium priority)
        { description: { contains: query, mode: 'insensitive' } },
        // Notes contains full query
        { notes: { contains: query, mode: 'insensitive' } },
        // Searchable text contains full query
        { searchableText: { contains: query, mode: 'insensitive' } },
        // User names contain query
        { fromUser: { name: { contains: query, mode: 'insensitive' } } },
        { toUser: { name: { contains: query, mode: 'insensitive' } } },
        // Category name contains query
        { category: { name: { contains: query, mode: 'insensitive' } } },
        // Individual search terms
        ...searchTerms.map(term => ({
          OR: [
            { description: { contains: term, mode: 'insensitive' } },
            { reference: { contains: term, mode: 'insensitive' } },
            { notes: { contains: term, mode: 'insensitive' } },
            { searchableText: { contains: term, mode: 'insensitive' } },
          ]
        })),
      ],
    };

    let where = {
      AND: [baseWhere, searchConditions],
    };

    // Apply additional filters if provided
    if (filters) {
      const additionalFilters: any = {};

      if (filters.dateRange) {
        additionalFilters.createdAt = {
          gte: filters.dateRange.startDate,
          lte: filters.dateRange.endDate,
        };
      }

      if (filters.types && filters.types.length > 0) {
        additionalFilters.type = { in: filters.types };
      }

      if (filters.statuses && filters.statuses.length > 0) {
        additionalFilters.status = { in: filters.statuses };
      }

      if (filters.amountRange) {
        const amountFilter: any = {};
        if (filters.amountRange.min !== undefined) {
          amountFilter.gte = filters.amountRange.min;
        }
        if (filters.amountRange.max !== undefined) {
          amountFilter.lte = filters.amountRange.max;
        }
        additionalFilters.amount = amountFilter;
      }

      if (filters.categories && filters.categories.length > 0) {
        additionalFilters.categoryId = { in: filters.categories };
      }

      if (Object.keys(additionalFilters).length > 0) {
        where = {
          AND: [baseWhere, searchConditions, additionalFilters],
        };
      }
    }

    return where;
  }

  /**
   * Generate highlights for search results
   */
  private generateHighlights(transactions: any[], query: string): Record<string, string[]> {
    const highlights: Record<string, string[]> = {};

    transactions.forEach(transaction => {
      const transactionHighlights: string[] = [];

      // Highlight in description
      if (transaction.description) {
        const highlighted = this.highlightSearchTerms(transaction.description, query);
        if (highlighted !== transaction.description) {
          transactionHighlights.push(`Description: ${highlighted}`);
        }
      }

      // Highlight in reference
      if (transaction.reference) {
        const highlighted = this.highlightSearchTerms(transaction.reference, query);
        if (highlighted !== transaction.reference) {
          transactionHighlights.push(`Reference: ${highlighted}`);
        }
      }

      // Highlight in notes
      if (transaction.notes) {
        const highlighted = this.highlightSearchTerms(transaction.notes, query);
        if (highlighted !== transaction.notes) {
          transactionHighlights.push(`Notes: ${highlighted}`);
        }
      }

      // Highlight in user names
      if (transaction.fromUser?.name) {
        const highlighted = this.highlightSearchTerms(transaction.fromUser.name, query);
        if (highlighted !== transaction.fromUser.name) {
          transactionHighlights.push(`From: ${highlighted}`);
        }
      }

      if (transaction.toUser?.name) {
        const highlighted = this.highlightSearchTerms(transaction.toUser.name, query);
        if (highlighted !== transaction.toUser.name) {
          transactionHighlights.push(`To: ${highlighted}`);
        }
      }

      // Highlight in category
      if (transaction.category?.name) {
        const highlighted = this.highlightSearchTerms(transaction.category.name, query);
        if (highlighted !== transaction.category.name) {
          transactionHighlights.push(`Category: ${highlighted}`);
        }
      }

      if (transactionHighlights.length > 0) {
        highlights[transaction.id] = transactionHighlights;
      }
    });

    return highlights;
  }

  /**
   * Extract searchable words from text
   */
  private extractSearchableWords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !this.isStopWord(word));
  }

  /**
   * Check if a word is a stop word (common words to ignore)
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'between', 'among', 'is', 'are', 'was',
      'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
      'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
      'can', 'shall', 'this', 'that', 'these', 'those', 'a', 'an'
    ]);
    return stopWords.has(word.toLowerCase());
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
}

export const transactionSearchService = new TransactionSearchService();