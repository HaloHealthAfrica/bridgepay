import { prisma } from "../lib/prisma";
import { 
  TransactionCategory, 
  CreateCategoryRequest, 
  CategorySuggestion, 
  BulkResult 
} from "../types/transaction";

export class TransactionCategoryService {
  /**
   * Get all categories for a user
   */
  async getCategories(userId: string): Promise<TransactionCategory[]> {
    const categories = await prisma.transactionCategory.findMany({
      where: { userId },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
    });

    return categories.map(this.mapToTransactionCategory);
  }

  /**
   * Create a new category
   */
  async createCategory(
    userId: string, 
    request: CreateCategoryRequest
  ): Promise<TransactionCategory> {
    const category = await prisma.transactionCategory.create({
      data: {
        userId,
        name: request.name,
        color: request.color || '#6B7280',
        icon: request.icon,
        isDefault: false,
      },
    });

    return this.mapToTransactionCategory(category);
  }

  /**
   * Update a category
   */
  async updateCategory(
    categoryId: string, 
    userId: string, 
    updates: Partial<CreateCategoryRequest>
  ): Promise<TransactionCategory> {
    const category = await prisma.transactionCategory.updateMany({
      where: { id: categoryId, userId },
      data: updates,
    });

    const updated = await prisma.transactionCategory.findUnique({
      where: { id: categoryId },
    });

    if (!updated) {
      throw new Error('Category not found');
    }

    return this.mapToTransactionCategory(updated);
  }

  /**
   * Delete a category
   */
  async deleteCategory(categoryId: string, userId: string): Promise<void> {
    // First, unassign the category from all transactions
    await prisma.transaction.updateMany({
      where: { categoryId },
      data: { categoryId: null },
    });

    // Then delete the category
    await prisma.transactionCategory.deleteMany({
      where: { id: categoryId, userId, isDefault: false }, // Can't delete default categories
    });
  }

  /**
   * Assign category to a transaction
   */
  async assignCategory(transactionId: string, categoryId: string, userId: string): Promise<void> {
    // Verify the transaction belongs to the user
    const transaction = await prisma.transaction.findFirst({
      where: {
        id: transactionId,
        OR: [{ fromUserId: userId }, { toUserId: userId }],
      },
    });

    if (!transaction) {
      throw new Error('Transaction not found or access denied');
    }

    // Verify the category belongs to the user
    const category = await prisma.transactionCategory.findFirst({
      where: { id: categoryId, userId },
    });

    if (!category) {
      throw new Error('Category not found or access denied');
    }

    // Assign the category
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { categoryId },
    });
  }

  /**
   * Bulk categorize multiple transactions
   */
  async bulkCategorize(
    transactionIds: string[], 
    categoryId: string, 
    userId: string
  ): Promise<BulkResult> {
    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    // Verify the category belongs to the user
    const category = await prisma.transactionCategory.findFirst({
      where: { id: categoryId, userId },
    });

    if (!category) {
      return {
        successCount: 0,
        failureCount: transactionIds.length,
        errors: ['Category not found or access denied'],
      };
    }

    // Process each transaction
    for (const transactionId of transactionIds) {
      try {
        // Verify the transaction belongs to the user
        const transaction = await prisma.transaction.findFirst({
          where: {
            id: transactionId,
            OR: [{ fromUserId: userId }, { toUserId: userId }],
          },
        });

        if (!transaction) {
          failureCount++;
          errors.push(`Transaction ${transactionId}: not found or access denied`);
          continue;
        }

        // Assign the category
        await prisma.transaction.update({
          where: { id: transactionId },
          data: { categoryId },
        });

        successCount++;
      } catch (error: any) {
        failureCount++;
        errors.push(`Transaction ${transactionId}: ${error.message}`);
      }
    }

    return {
      successCount,
      failureCount,
      errors,
    };
  }

  /**
   * Suggest categories based on transaction description
   */
  async suggestCategory(
    userId: string, 
    description: string, 
    amount?: number
  ): Promise<CategorySuggestion[]> {
    const categories = await this.getCategories(userId);
    const suggestions: CategorySuggestion[] = [];

    if (!description) {
      return suggestions;
    }

    const descriptionLower = description.toLowerCase();

    // Rule-based category suggestions
    const rules = this.getCategoryRules();

    for (const rule of rules) {
      const matchingCategory = categories.find(c => 
        c.name.toLowerCase().includes(rule.categoryName.toLowerCase())
      );

      if (matchingCategory) {
        let confidence = 0;
        let reason = '';

        // Check keyword matches
        const keywordMatches = rule.keywords.filter(keyword => 
          descriptionLower.includes(keyword.toLowerCase())
        );

        if (keywordMatches.length > 0) {
          confidence = Math.min(0.9, keywordMatches.length * 0.3);
          reason = `Matched keywords: ${keywordMatches.join(', ')}`;

          suggestions.push({
            category: matchingCategory,
            confidence,
            reason,
          });
        }
      }
    }

    // Historical pattern matching
    const historicalSuggestions = await this.getHistoricalSuggestions(
      userId, 
      description, 
      categories
    );
    suggestions.push(...historicalSuggestions);

    // Sort by confidence and return top 3
    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
  }

  /**
   * Advanced ML-based category suggestion using pattern recognition
   */
  async getAdvancedCategorySuggestions(
    userId: string, 
    description: string, 
    amount?: number,
    recipientName?: string,
    timeOfDay?: number
  ): Promise<CategorySuggestion[]> {
    const categories = await this.getCategories(userId);
    const suggestions: CategorySuggestion[] = [];

    if (!description) {
      return suggestions;
    }

    // Get basic rule-based suggestions
    const basicSuggestions = await this.suggestCategory(userId, description, amount);
    suggestions.push(...basicSuggestions);

    // Advanced pattern recognition
    const patternSuggestions = await this.getPatternBasedSuggestions(
      userId, 
      description, 
      amount, 
      recipientName, 
      timeOfDay, 
      categories
    );
    suggestions.push(...patternSuggestions);

    // Amount-based suggestions
    if (amount) {
      const amountSuggestions = await this.getAmountBasedSuggestions(
        userId, 
        amount, 
        categories
      );
      suggestions.push(...amountSuggestions);
    }

    // Time-based suggestions
    if (timeOfDay !== undefined) {
      const timeSuggestions = await this.getTimeBasedSuggestions(
        userId, 
        timeOfDay, 
        categories
      );
      suggestions.push(...timeSuggestions);
    }

    // Merge and deduplicate suggestions
    const mergedSuggestions = this.mergeSuggestions(suggestions);

    // Sort by confidence and return top 5
    return mergedSuggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
  }

  /**
   * Get pattern-based suggestions using transaction history analysis
   */
  private async getPatternBasedSuggestions(
    userId: string,
    description: string,
    amount?: number,
    recipientName?: string,
    timeOfDay?: number,
    categories: TransactionCategory[]
  ): Promise<CategorySuggestion[]> {
    const suggestions: CategorySuggestion[] = [];

    // Analyze description patterns
    const descriptionWords = this.extractKeywords(description);
    
    // Find transactions with similar description patterns
    const similarTransactions = await prisma.transaction.findMany({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
        categoryId: { not: null },
        OR: descriptionWords.map(word => ({
          description: {
            contains: word,
            mode: 'insensitive',
          },
        })),
      },
      include: { category: true },
      take: 50,
    });

    // Analyze patterns
    const patternAnalysis = this.analyzeTransactionPatterns(similarTransactions, {
      description,
      amount,
      recipientName,
      timeOfDay,
    });

    // Generate suggestions based on patterns
    patternAnalysis.forEach(pattern => {
      const category = categories.find(c => c.id === pattern.categoryId);
      if (category) {
        suggestions.push({
          category,
          confidence: pattern.confidence,
          reason: `Pattern match: ${pattern.reason}`,
        });
      }
    });

    return suggestions;
  }

  /**
   * Get amount-based category suggestions
   */
  private async getAmountBasedSuggestions(
    userId: string,
    amount: number,
    categories: TransactionCategory[]
  ): Promise<CategorySuggestion[]> {
    const suggestions: CategorySuggestion[] = [];

    // Find transactions with similar amounts
    const amountRange = amount * 0.2; // 20% tolerance
    const similarAmountTransactions = await prisma.transaction.findMany({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
        categoryId: { not: null },
        amount: {
          gte: amount - amountRange,
          lte: amount + amountRange,
        },
      },
      include: { category: true },
      take: 20,
    });

    // Analyze amount patterns
    const categoryFrequency = new Map<string, { count: number; totalAmount: number }>();

    similarAmountTransactions.forEach(transaction => {
      if (transaction.categoryId) {
        const existing = categoryFrequency.get(transaction.categoryId) || { count: 0, totalAmount: 0 };
        categoryFrequency.set(transaction.categoryId, {
          count: existing.count + 1,
          totalAmount: existing.totalAmount + Number(transaction.amount),
        });
      }
    });

    categoryFrequency.forEach((data, categoryId) => {
      const category = categories.find(c => c.id === categoryId);
      if (category && data.count >= 2) {
        const avgAmount = data.totalAmount / data.count;
        const similarity = 1 - Math.abs(amount - avgAmount) / Math.max(amount, avgAmount);
        const confidence = Math.min(0.7, similarity * (data.count / 10));

        suggestions.push({
          category,
          confidence,
          reason: `Similar amount pattern (${data.count} transactions, avg: ${avgAmount.toFixed(2)})`,
        });
      }
    });

    return suggestions;
  }

  /**
   * Get time-based category suggestions
   */
  private async getTimeBasedSuggestions(
    userId: string,
    timeOfDay: number, // Hour of day (0-23)
    categories: TransactionCategory[]
  ): Promise<CategorySuggestion[]> {
    const suggestions: CategorySuggestion[] = [];

    // Define time ranges
    const timeRange = 2; // 2-hour window
    const startHour = Math.max(0, timeOfDay - timeRange);
    const endHour = Math.min(23, timeOfDay + timeRange);

    // Find transactions in similar time range
    const timeBasedTransactions = await prisma.transaction.findMany({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
        categoryId: { not: null },
        createdAt: {
          gte: new Date(new Date().setHours(startHour, 0, 0, 0)),
          lte: new Date(new Date().setHours(endHour, 59, 59, 999)),
        },
      },
      include: { category: true },
      take: 30,
    });

    // Analyze time patterns
    const timePatterns = new Map<string, number>();

    timeBasedTransactions.forEach(transaction => {
      if (transaction.categoryId) {
        const count = timePatterns.get(transaction.categoryId) || 0;
        timePatterns.set(transaction.categoryId, count + 1);
      }
    });

    timePatterns.forEach((count, categoryId) => {
      const category = categories.find(c => c.id === categoryId);
      if (category && count >= 2) {
        const confidence = Math.min(0.6, count / 10);
        const timeRangeStr = `${startHour}:00-${endHour}:00`;

        suggestions.push({
          category,
          confidence,
          reason: `Time pattern (${count} transactions during ${timeRangeStr})`,
        });
      }
    });

    return suggestions;
  }

  /**
   * Extract meaningful keywords from description
   */
  private extractKeywords(description: string): string[] {
    const words = description
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !this.isStopWord(word));

    // Return unique words
    return [...new Set(words)];
  }

  /**
   * Check if a word is a stop word
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
   * Analyze transaction patterns for suggestions
   */
  private analyzeTransactionPatterns(
    transactions: any[],
    currentTransaction: {
      description: string;
      amount?: number;
      recipientName?: string;
      timeOfDay?: number;
    }
  ): Array<{ categoryId: string; confidence: number; reason: string }> {
    const patterns: Array<{ categoryId: string; confidence: number; reason: string }> = [];
    const categoryScores = new Map<string, { score: number; reasons: string[] }>();

    transactions.forEach(transaction => {
      if (!transaction.categoryId) return;

      let score = 0;
      const reasons: string[] = [];

      // Description similarity
      if (transaction.description) {
        const similarity = this.calculateTextSimilarity(
          currentTransaction.description,
          transaction.description
        );
        if (similarity > 0.3) {
          score += similarity * 0.4;
          reasons.push(`description similarity (${(similarity * 100).toFixed(0)}%)`);
        }
      }

      // Amount similarity
      if (currentTransaction.amount && transaction.amount) {
        const amountSimilarity = 1 - Math.abs(
          Number(currentTransaction.amount) - Number(transaction.amount)
        ) / Math.max(Number(currentTransaction.amount), Number(transaction.amount));
        
        if (amountSimilarity > 0.7) {
          score += amountSimilarity * 0.3;
          reasons.push(`amount similarity (${(amountSimilarity * 100).toFixed(0)}%)`);
        }
      }

      // Time similarity
      if (currentTransaction.timeOfDay !== undefined) {
        const transactionHour = new Date(transaction.createdAt).getHours();
        const timeDiff = Math.abs(currentTransaction.timeOfDay - transactionHour);
        const timeSimilarity = Math.max(0, 1 - timeDiff / 12); // 12-hour window
        
        if (timeSimilarity > 0.5) {
          score += timeSimilarity * 0.2;
          reasons.push(`time similarity (${(timeSimilarity * 100).toFixed(0)}%)`);
        }
      }

      // Recipient similarity (if available)
      if (currentTransaction.recipientName && transaction.toUser?.name) {
        const recipientSimilarity = this.calculateTextSimilarity(
          currentTransaction.recipientName,
          transaction.toUser.name
        );
        
        if (recipientSimilarity > 0.8) {
          score += recipientSimilarity * 0.1;
          reasons.push(`recipient match (${(recipientSimilarity * 100).toFixed(0)}%)`);
        }
      }

      if (score > 0.2 && reasons.length > 0) {
        const existing = categoryScores.get(transaction.categoryId) || { score: 0, reasons: [] };
        categoryScores.set(transaction.categoryId, {
          score: Math.max(existing.score, score),
          reasons: [...existing.reasons, ...reasons],
        });
      }
    });

    categoryScores.forEach((data, categoryId) => {
      patterns.push({
        categoryId,
        confidence: Math.min(0.9, data.score),
        reason: data.reasons.slice(0, 3).join(', '),
      });
    });

    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calculate text similarity using simple word overlap
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(this.extractKeywords(text1));
    const words2 = new Set(this.extractKeywords(text2));

    if (words1.size === 0 && words2.size === 0) return 1;
    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Merge and deduplicate suggestions
   */
  private mergeSuggestions(suggestions: CategorySuggestion[]): CategorySuggestion[] {
    const merged = new Map<string, CategorySuggestion>();

    suggestions.forEach(suggestion => {
      const existing = merged.get(suggestion.category.id);
      if (existing) {
        // Combine confidence scores and reasons
        const combinedConfidence = Math.min(0.95, existing.confidence + suggestion.confidence * 0.3);
        const combinedReason = existing.reason.includes(suggestion.reason) 
          ? existing.reason 
          : `${existing.reason}; ${suggestion.reason}`;

        merged.set(suggestion.category.id, {
          category: suggestion.category,
          confidence: combinedConfidence,
          reason: combinedReason,
        });
      } else {
        merged.set(suggestion.category.id, suggestion);
      }
    });

    return Array.from(merged.values());
  }
  async getCategoryStats(userId: string, startDate?: Date, endDate?: Date) {
    const where: any = {
      OR: [{ fromUserId: userId }, { toUserId: userId }],
    };

    if (startDate && endDate) {
      where.createdAt = {
        gte: startDate,
        lte: endDate,
      };
    }

    const stats = await prisma.transaction.groupBy({
      by: ['categoryId'],
      where,
      _sum: { amount: true },
      _count: { id: true },
    });

    const categories = await this.getCategories(userId);
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    return stats.map(stat => ({
      category: stat.categoryId ? categoryMap.get(stat.categoryId) : null,
      totalAmount: Number(stat._sum.amount || 0),
      transactionCount: stat._count.id,
    }));
  }

  /**
   * Create default categories for a new user
   */
  async createDefaultCategories(userId: string): Promise<void> {
    const defaultCategories = [
      { name: 'Food & Dining', color: '#EF4444', icon: '🍽️' },
      { name: 'Transportation', color: '#3B82F6', icon: '🚗' },
      { name: 'Bills & Utilities', color: '#F59E0B', icon: '💡' },
      { name: 'Shopping', color: '#10B981', icon: '🛍️' },
      { name: 'Entertainment', color: '#8B5CF6', icon: '🎬' },
      { name: 'Healthcare', color: '#EC4899', icon: '🏥' },
      { name: 'Education', color: '#06B6D4', icon: '📚' },
      { name: 'Business', color: '#6B7280', icon: '💼' },
    ];

    await prisma.transactionCategory.createMany({
      data: defaultCategories.map(category => ({
        ...category,
        userId,
        isDefault: true,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Map Prisma category to TransactionCategory
   */
  private mapToTransactionCategory(category: any): TransactionCategory {
    return {
      id: category.id,
      userId: category.userId,
      name: category.name,
      color: category.color,
      icon: category.icon,
      isDefault: category.isDefault,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    };
  }

  /**
   * Get category suggestion rules
   */
  private getCategoryRules() {
    return [
      {
        categoryName: 'Food & Dining',
        keywords: ['restaurant', 'food', 'dining', 'meal', 'lunch', 'dinner', 'breakfast', 'cafe', 'pizza', 'burger'],
      },
      {
        categoryName: 'Transportation',
        keywords: ['uber', 'taxi', 'bus', 'train', 'fuel', 'gas', 'parking', 'transport', 'matatu', 'boda'],
      },
      {
        categoryName: 'Bills & Utilities',
        keywords: ['electricity', 'water', 'internet', 'phone', 'bill', 'utility', 'kplc', 'safaricom', 'airtel'],
      },
      {
        categoryName: 'Shopping',
        keywords: ['shop', 'store', 'market', 'buy', 'purchase', 'clothes', 'supermarket', 'mall'],
      },
      {
        categoryName: 'Entertainment',
        keywords: ['movie', 'cinema', 'game', 'music', 'concert', 'entertainment', 'netflix', 'spotify'],
      },
      {
        categoryName: 'Healthcare',
        keywords: ['hospital', 'doctor', 'medicine', 'pharmacy', 'health', 'medical', 'clinic'],
      },
      {
        categoryName: 'Education',
        keywords: ['school', 'university', 'course', 'book', 'education', 'tuition', 'fees'],
      },
      {
        categoryName: 'Business',
        keywords: ['business', 'office', 'work', 'salary', 'payment', 'invoice', 'contract'],
      },
    ];
  }

  /**
   * Get historical category suggestions based on similar transactions
   */
  private async getHistoricalSuggestions(
    userId: string, 
    description: string, 
    categories: TransactionCategory[]
  ): Promise<CategorySuggestion[]> {
    // Find similar transactions by description
    const similarTransactions = await prisma.transaction.findMany({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
        categoryId: { not: null },
        description: {
          contains: description.split(' ')[0], // Use first word for similarity
          mode: 'insensitive',
        },
      },
      include: { category: true },
      take: 10,
    });

    const categoryFrequency = new Map<string, number>();

    similarTransactions.forEach(transaction => {
      if (transaction.categoryId) {
        const count = categoryFrequency.get(transaction.categoryId) || 0;
        categoryFrequency.set(transaction.categoryId, count + 1);
      }
    });

    const suggestions: CategorySuggestion[] = [];

    categoryFrequency.forEach((count, categoryId) => {
      const category = categories.find(c => c.id === categoryId);
      if (category) {
        const confidence = Math.min(0.8, count / similarTransactions.length);
        suggestions.push({
          category,
          confidence,
          reason: `Based on ${count} similar transactions`,
        });
      }
    });

    return suggestions;
  }
}

export const transactionCategoryService = new TransactionCategoryService();