import { prisma } from "../lib/prisma";
import { 
  SpendingTrends, 
  MonthlyTrend, 
  RecipientStats, 
  UnusualPattern, 
  CategoryBreakdown, 
  CategoryStats, 
  TransactionInsights, 
  PeriodComparison,
  EnhancedTransaction,
  TransactionCategory
} from "../types/transaction";
import { TransactionType, TransactionStatus } from "@prisma/client";

export class TransactionAnalyticsService {
  /**
   * Get comprehensive spending trends for a user
   */
  async getSpendingTrends(
    userId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<SpendingTrends> {
    const [monthlyTrends, averagesByType, topRecipients, unusualPatterns] = await Promise.all([
      this.getMonthlyTrends(userId, startDate, endDate),
      this.getAveragesByType(userId, startDate, endDate),
      this.getTopRecipients(userId, startDate, endDate),
      this.detectUnusualPatterns(userId, startDate, endDate),
    ]);

    return {
      monthlyTrends,
      averagesByType,
      topRecipients,
      unusualPatterns,
    };
  }

  /**
   * Get monthly spending trends
   */
  async getMonthlyTrends(
    userId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<MonthlyTrend[]> {
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
        status: 'SUCCESS',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        amount: true,
        type: true,
        fromUserId: true,
        toUserId: true,
        createdAt: true,
      },
    });

    // Group transactions by month
    const monthlyData = new Map<string, {
      totalSpent: number;
      totalReceived: number;
      transactionCount: number;
    }>();

    transactions.forEach(transaction => {
      const monthKey = transaction.createdAt.toISOString().substring(0, 7); // YYYY-MM
      const amount = Number(transaction.amount);
      const isOutgoing = transaction.fromUserId === userId;

      const existing = monthlyData.get(monthKey) || {
        totalSpent: 0,
        totalReceived: 0,
        transactionCount: 0,
      };

      if (isOutgoing) {
        existing.totalSpent += amount;
      } else {
        existing.totalReceived += amount;
      }
      existing.transactionCount += 1;

      monthlyData.set(monthKey, existing);
    });

    // Convert to array and calculate averages
    return Array.from(monthlyData.entries())
      .map(([month, data]) => ({
        month,
        totalSpent: data.totalSpent,
        totalReceived: data.totalReceived,
        transactionCount: data.transactionCount,
        averageAmount: data.transactionCount > 0 
          ? (data.totalSpent + data.totalReceived) / data.transactionCount 
          : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Get average transaction amounts by type
   */
  async getAveragesByType(
    userId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<Record<TransactionType, number>> {
    const result = await prisma.transaction.groupBy({
      by: ['type'],
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
        status: 'SUCCESS',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _avg: { amount: true },
    });

    const averages: Record<TransactionType, number> = {
      DEPOSIT: 0,
      WITHDRAWAL: 0,
      TRANSFER: 0,
      ESCROW_LOCK: 0,
      ESCROW_RELEASE: 0,
      REFUND: 0,
      PAYMENT: 0,
    };

    result.forEach(item => {
      averages[item.type] = Number(item._avg.amount || 0);
    });

    return averages;
  }

  /**
   * Get top recipients by transaction volume
   */
  async getTopRecipients(
    userId: string, 
    startDate: Date, 
    endDate: Date,
    limit: number = 10
  ): Promise<RecipientStats[]> {
    const transactions = await prisma.transaction.findMany({
      where: {
        fromUserId: userId, // Only outgoing transactions
        status: 'SUCCESS',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        toUser: {
          select: { id: true, name: true, phone: true },
        },
      },
    });

    // Group by recipient
    const recipientData = new Map<string, {
      user: { id: string; name: string; phone: string };
      totalAmount: number;
      transactionCount: number;
      lastTransaction: Date;
    }>();

    transactions.forEach(transaction => {
      if (!transaction.toUser) return;

      const existing = recipientData.get(transaction.toUser.id) || {
        user: transaction.toUser,
        totalAmount: 0,
        transactionCount: 0,
        lastTransaction: transaction.createdAt,
      };

      existing.totalAmount += Number(transaction.amount);
      existing.transactionCount += 1;
      if (transaction.createdAt > existing.lastTransaction) {
        existing.lastTransaction = transaction.createdAt;
      }

      recipientData.set(transaction.toUser.id, existing);
    });

    return Array.from(recipientData.values())
      .map(data => ({
        userId: data.user.id,
        name: data.user.name,
        phone: data.user.phone,
        totalAmount: data.totalAmount,
        transactionCount: data.transactionCount,
        lastTransaction: data.lastTransaction,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, limit);
  }

  /**
   * Detect unusual transaction patterns
   */
  async detectUnusualPatterns(
    userId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<UnusualPattern[]> {
    const patterns: UnusualPattern[] = [];

    // Get user's transaction history for baseline
    const allTransactions = await prisma.transaction.findMany({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
        status: 'SUCCESS',
        createdAt: {
          gte: new Date(startDate.getTime() - 90 * 24 * 60 * 60 * 1000), // 90 days before
          lte: endDate,
        },
      },
      include: {
        toUser: { select: { id: true, name: true } },
        fromUser: { select: { id: true, name: true } },
      },
    });

    const recentTransactions = allTransactions.filter(
      t => t.createdAt >= startDate && t.createdAt <= endDate
    );

    const historicalTransactions = allTransactions.filter(
      t => t.createdAt < startDate
    );

    // Detect high amount transactions
    const highAmountPatterns = this.detectHighAmountPatterns(
      recentTransactions, 
      historicalTransactions
    );
    patterns.push(...highAmountPatterns);

    // Detect frequent transactions
    const frequentPatterns = this.detectFrequentTransactionPatterns(
      recentTransactions, 
      historicalTransactions
    );
    patterns.push(...frequentPatterns);

    // Detect new recipients
    const newRecipientPatterns = this.detectNewRecipientPatterns(
      recentTransactions, 
      historicalTransactions
    );
    patterns.push(...newRecipientPatterns);

    // Detect time anomalies
    const timeAnomalyPatterns = this.detectTimeAnomalies(
      recentTransactions, 
      historicalTransactions
    );
    patterns.push(...timeAnomalyPatterns);

    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get category breakdown for spending analysis
   */
  async getCategoryBreakdown(
    userId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<CategoryBreakdown> {
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
        status: 'SUCCESS',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        category: true,
      },
    });

    const categoryData = new Map<string, {
      category: TransactionCategory;
      amount: number;
      count: number;
    }>();

    let uncategorizedAmount = 0;
    let uncategorizedCount = 0;
    let totalAmount = 0;
    let totalTransactions = 0;

    transactions.forEach(transaction => {
      const amount = Number(transaction.amount);
      totalAmount += amount;
      totalTransactions += 1;

      if (transaction.category) {
        const existing = categoryData.get(transaction.category.id) || {
          category: transaction.category,
          amount: 0,
          count: 0,
        };

        existing.amount += amount;
        existing.count += 1;
        categoryData.set(transaction.category.id, existing);
      } else {
        uncategorizedAmount += amount;
        uncategorizedCount += 1;
      }
    });

    // Calculate trends (simplified - would need historical data for real trends)
    const categories: CategoryStats[] = Array.from(categoryData.values()).map(data => ({
      category: data.category,
      amount: data.amount,
      count: data.count,
      percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
      trend: 'STABLE' as const, // Would need historical comparison
    }));

    return {
      categories: categories.sort((a, b) => b.amount - a.amount),
      uncategorized: {
        amount: uncategorizedAmount,
        count: uncategorizedCount,
        percentage: totalAmount > 0 ? (uncategorizedAmount / totalAmount) * 100 : 0,
      },
      totalAmount,
      totalTransactions,
    };
  }

  /**
   * Get transaction insights summary
   */
  async getTransactionInsights(
    userId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<TransactionInsights> {
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
        status: 'SUCCESS',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        category: true,
        fromUser: { select: { name: true } },
        toUser: { select: { name: true } },
      },
    });

    let totalSpending = 0;
    let totalReceived = 0;
    let largestTransaction = transactions[0];
    const dayActivity = new Map<string, number>();

    transactions.forEach(transaction => {
      const amount = Number(transaction.amount);
      const isOutgoing = transaction.fromUserId === userId;

      if (isOutgoing) {
        totalSpending += amount;
      } else {
        totalReceived += amount;
      }

      // Track largest transaction
      if (!largestTransaction || amount > Number(largestTransaction.amount)) {
        largestTransaction = transaction;
      }

      // Track daily activity
      const dayKey = transaction.createdAt.toISOString().substring(0, 10);
      const dayCount = dayActivity.get(dayKey) || 0;
      dayActivity.set(dayKey, dayCount + 1);
    });

    // Find most active day
    let mostActiveDay = '';
    let maxActivity = 0;
    dayActivity.forEach((count, day) => {
      if (count > maxActivity) {
        maxActivity = count;
        mostActiveDay = day;
      }
    });

    // Calculate spending velocity
    const daysDiff = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const spendingVelocity = transactions.length / daysDiff;

    // Get category breakdown for top category
    const categoryBreakdown = await this.getCategoryBreakdown(userId, startDate, endDate);
    const topCategory = categoryBreakdown.categories[0];

    return {
      totalSpending,
      totalReceived,
      netFlow: totalReceived - totalSpending,
      averageTransaction: transactions.length > 0 ? (totalSpending + totalReceived) / transactions.length : 0,
      mostActiveDay,
      largestTransaction: this.mapToEnhancedTransaction(largestTransaction),
      spendingVelocity,
      topCategory,
    };
  }

  /**
   * Compare two time periods
   */
  async comparePeriods(
    userId: string,
    period1Start: Date,
    period1End: Date,
    period2Start: Date,
    period2End: Date
  ): Promise<PeriodComparison> {
    const [period1Data, period2Data] = await Promise.all([
      this.getPeriodData(userId, period1Start, period1End),
      this.getPeriodData(userId, period2Start, period2End),
    ]);

    const spentChange = period2Data.totalSpent - period1Data.totalSpent;
    const receivedChange = period2Data.totalReceived - period1Data.totalReceived;
    const countChange = period2Data.transactionCount - period1Data.transactionCount;

    return {
      period1: {
        startDate: period1Start,
        endDate: period1End,
        ...period1Data,
      },
      period2: {
        startDate: period2Start,
        endDate: period2End,
        ...period2Data,
      },
      changes: {
        spentChange,
        spentChangePercent: period1Data.totalSpent > 0 ? (spentChange / period1Data.totalSpent) * 100 : 0,
        receivedChange,
        receivedChangePercent: period1Data.totalReceived > 0 ? (receivedChange / period1Data.totalReceived) * 100 : 0,
        countChange,
        countChangePercent: period1Data.transactionCount > 0 ? (countChange / period1Data.transactionCount) * 100 : 0,
      },
    };
  }

  /**
   * Get period data for comparison
   */
  private async getPeriodData(userId: string, startDate: Date, endDate: Date) {
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
        status: 'SUCCESS',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    let totalSpent = 0;
    let totalReceived = 0;

    transactions.forEach(transaction => {
      const amount = Number(transaction.amount);
      if (transaction.fromUserId === userId) {
        totalSpent += amount;
      } else {
        totalReceived += amount;
      }
    });

    return {
      totalSpent,
      totalReceived,
      transactionCount: transactions.length,
    };
  }

  /**
   * Detect high amount transaction patterns
   */
  private detectHighAmountPatterns(
    recentTransactions: any[], 
    historicalTransactions: any[]
  ): UnusualPattern[] {
    const patterns: UnusualPattern[] = [];

    if (historicalTransactions.length === 0) return patterns;

    // Calculate historical average
    const historicalAmounts = historicalTransactions.map(t => Number(t.amount));
    const avgAmount = historicalAmounts.reduce((sum, amount) => sum + amount, 0) / historicalAmounts.length;
    const threshold = avgAmount * 3; // 3x average

    const highAmountTransactions = recentTransactions.filter(t => Number(t.amount) > threshold);

    if (highAmountTransactions.length > 0) {
      patterns.push({
        type: 'HIGH_AMOUNT',
        description: `${highAmountTransactions.length} transaction(s) significantly higher than usual (>${threshold.toFixed(2)})`,
        confidence: Math.min(0.9, highAmountTransactions.length / 5),
        transactions: highAmountTransactions.map(t => t.id),
        detectedAt: new Date(),
      });
    }

    return patterns;
  }

  /**
   * Detect frequent transaction patterns
   */
  private detectFrequentTransactionPatterns(
    recentTransactions: any[], 
    historicalTransactions: any[]
  ): UnusualPattern[] {
    const patterns: UnusualPattern[] = [];

    if (historicalTransactions.length === 0) return patterns;

    // Calculate historical daily average
    const historicalDays = Math.max(1, historicalTransactions.length / 30); // Assume 30-day periods
    const avgDailyTransactions = historicalTransactions.length / historicalDays;

    // Calculate recent daily transactions
    const recentDays = Math.max(1, recentTransactions.length / 7); // Assume 7-day period
    const recentDailyTransactions = recentTransactions.length / recentDays;

    if (recentDailyTransactions > avgDailyTransactions * 2) {
      patterns.push({
        type: 'FREQUENT_TRANSACTIONS',
        description: `Unusually high transaction frequency: ${recentDailyTransactions.toFixed(1)} vs ${avgDailyTransactions.toFixed(1)} daily average`,
        confidence: Math.min(0.8, (recentDailyTransactions - avgDailyTransactions) / avgDailyTransactions),
        transactions: recentTransactions.map(t => t.id),
        detectedAt: new Date(),
      });
    }

    return patterns;
  }

  /**
   * Detect new recipient patterns
   */
  private detectNewRecipientPatterns(
    recentTransactions: any[], 
    historicalTransactions: any[]
  ): UnusualPattern[] {
    const patterns: UnusualPattern[] = [];

    const historicalRecipients = new Set(
      historicalTransactions
        .filter(t => t.toUser)
        .map(t => t.toUser.id)
    );

    const newRecipientTransactions = recentTransactions.filter(
      t => t.toUser && !historicalRecipients.has(t.toUser.id)
    );

    if (newRecipientTransactions.length > 0) {
      patterns.push({
        type: 'NEW_RECIPIENT',
        description: `${newRecipientTransactions.length} transaction(s) to new recipients`,
        confidence: Math.min(0.7, newRecipientTransactions.length / 3),
        transactions: newRecipientTransactions.map(t => t.id),
        detectedAt: new Date(),
      });
    }

    return patterns;
  }

  /**
   * Detect time-based anomalies
   */
  private detectTimeAnomalies(
    recentTransactions: any[], 
    historicalTransactions: any[]
  ): UnusualPattern[] {
    const patterns: UnusualPattern[] = [];

    if (historicalTransactions.length === 0) return patterns;

    // Analyze historical time patterns
    const historicalHours = historicalTransactions.map(t => new Date(t.createdAt).getHours());
    const hourFrequency = new Map<number, number>();

    historicalHours.forEach(hour => {
      hourFrequency.set(hour, (hourFrequency.get(hour) || 0) + 1);
    });

    // Find unusual times in recent transactions
    const unusualTimeTransactions = recentTransactions.filter(t => {
      const hour = new Date(t.createdAt).getHours();
      const frequency = hourFrequency.get(hour) || 0;
      const threshold = historicalTransactions.length * 0.05; // 5% threshold
      return frequency < threshold;
    });

    if (unusualTimeTransactions.length > 0) {
      patterns.push({
        type: 'TIME_ANOMALY',
        description: `${unusualTimeTransactions.length} transaction(s) at unusual times`,
        confidence: Math.min(0.6, unusualTimeTransactions.length / 5),
        transactions: unusualTimeTransactions.map(t => t.id),
        detectedAt: new Date(),
      });
    }

    return patterns;
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

export const transactionAnalyticsService = new TransactionAnalyticsService();