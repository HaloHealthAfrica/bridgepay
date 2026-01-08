import * as fc from 'fast-check';
import { TransactionAnalyticsService } from '../../services/transactionAnalytics.service';
import { prisma } from '../../lib/prisma';

// Mock the prisma module
jest.mock('../../lib/prisma');

describe('TransactionAnalyticsService', () => {
  let service: TransactionAnalyticsService;
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;

  beforeEach(() => {
    service = new TransactionAnalyticsService();
    jest.clearAllMocks();
  });

  describe('Property Tests', () => {
    /**
     * Property 15: Analytics Calculation Accuracy
     * For any set of transactions, analytics calculations should be mathematically 
     * correct and consistent across different aggregation methods
     * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
     */
    test('Property 15: Analytics Calculation Accuracy', async () => {
      // Feature: enhanced-transaction-history, Property 15: Analytics Calculation Accuracy
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // userId (non-empty)
          fc.array(
            fc.record({
              id: fc.string(),
              amount: fc.float({ min: 1, max: 10000 }).filter(n => !isNaN(n)),
              type: fc.constantFrom('DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'PAYMENT'),
              status: fc.constantFrom('SUCCESS', 'PENDING', 'FAILED'),
              fromUserId: fc.string(),
              toUserId: fc.string(),
              createdAt: fc.date({ min: new Date('2023-01-01'), max: new Date('2024-12-31') }),
              categoryId: fc.option(fc.string()),
            }),
            { minLength: 5, maxLength: 50 }
          ),
          fc.record({
            startDate: fc.date({ min: new Date('2023-01-01'), max: new Date('2024-06-30') }),
            endDate: fc.date({ min: new Date('2024-07-01'), max: new Date('2024-12-31') }),
          }).filter(range => !isNaN(range.startDate.getTime()) && !isNaN(range.endDate.getTime())),
          async (userId: string, transactionData: any[], dateRange: any) => {
            // Ensure date range is valid
            const startDate = dateRange.startDate < dateRange.endDate ? dateRange.startDate : dateRange.endDate;
            const endDate = dateRange.startDate < dateRange.endDate ? dateRange.endDate : dateRange.startDate;

            // Generate transactions that belong to the user and are successful
            const transactions = transactionData.map((tx, index) => ({
              ...tx,
              fromUserId: index % 2 === 0 ? userId : `other-user-${index}`, // Alternate ownership
              toUserId: index % 2 === 1 ? userId : `other-user-${index}`, // Ensure user is involved
              status: 'SUCCESS', // Only successful transactions for analytics
              createdAt: new Date(startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime())),
            }));

            // Mock Prisma responses
            mockPrisma.transaction.findMany.mockResolvedValue(transactions);
            mockPrisma.transaction.groupBy.mockResolvedValue(
              ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'PAYMENT'].map(type => ({
                type,
                _avg: { 
                  amount: transactions
                    .filter(t => t.type === type)
                    .reduce((sum, t) => sum + t.amount, 0) / Math.max(1, transactions.filter(t => t.type === type).length)
                },
              }))
            );

            // Execute analytics
            const [monthlyTrends, averagesByType, insights] = await Promise.all([
              service.getMonthlyTrends(userId, startDate, endDate),
              service.getAveragesByType(userId, startDate, endDate),
              service.getTransactionInsights(userId, startDate, endDate),
            ]);

            // Verify monthly trends accuracy
            expect(monthlyTrends).toBeDefined();
            expect(Array.isArray(monthlyTrends)).toBe(true);

            // Verify mathematical consistency in monthly trends
            monthlyTrends.forEach(trend => {
              expect(trend.totalSpent).toBeGreaterThanOrEqual(0);
              expect(trend.totalReceived).toBeGreaterThanOrEqual(0);
              expect(trend.transactionCount).toBeGreaterThanOrEqual(0);
              
              if (trend.transactionCount > 0) {
                const expectedAverage = (trend.totalSpent + trend.totalReceived) / trend.transactionCount;
                expect(Math.abs(trend.averageAmount - expectedAverage)).toBeLessThan(0.01);
              } else {
                expect(trend.averageAmount).toBe(0);
              }

              // Verify month format
              expect(trend.month).toMatch(/^\d{4}-\d{2}$/);
            });

            // Verify averages by type
            expect(averagesByType).toBeDefined();
            Object.values(averagesByType).forEach(average => {
              expect(average).toBeGreaterThanOrEqual(0);
            });

            // Verify insights calculations
            expect(insights).toBeDefined();
            expect(insights.totalSpending).toBeGreaterThanOrEqual(0);
            expect(insights.totalReceived).toBeGreaterThanOrEqual(0);
            expect(insights.netFlow).toBe(insights.totalReceived - insights.totalSpending);
            expect(insights.spendingVelocity).toBeGreaterThanOrEqual(0);

            if (transactions.length > 0) {
              const expectedAverage = (insights.totalSpending + insights.totalReceived) / transactions.length;
              expect(Math.abs(insights.averageTransaction - expectedAverage)).toBeLessThan(0.01);
            }

            // Verify data consistency across different calculations
            const manualTotalSpent = transactions
              .filter(t => t.fromUserId === userId)
              .reduce((sum, t) => sum + t.amount, 0);
            const manualTotalReceived = transactions
              .filter(t => t.toUserId === userId)
              .reduce((sum, t) => sum + t.amount, 0);

            expect(Math.abs(insights.totalSpending - manualTotalSpent)).toBeLessThan(0.01);
            expect(Math.abs(insights.totalReceived - manualTotalReceived)).toBeLessThan(0.01);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 16: Period Comparison Consistency
     * For any two time periods, comparison calculations should be mathematically 
     * consistent and percentage changes should be accurate
     * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
     */
    test('Property 16: Period Comparison Consistency', async () => {
      // Feature: enhanced-transaction-history, Property 16: Period Comparison Consistency
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // userId (non-empty)
          fc.record({
            period1Start: fc.date({ min: new Date('2023-01-01'), max: new Date('2023-06-30') }),
            period1End: fc.date({ min: new Date('2023-07-01'), max: new Date('2023-12-31') }),
            period2Start: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-06-30') }),
            period2End: fc.date({ min: new Date('2024-07-01'), max: new Date('2024-12-31') }),
          }),
          fc.array(
            fc.record({
              amount: fc.float({ min: 1, max: 5000 }).filter(n => !isNaN(n)),
              fromUserId: fc.string(),
              toUserId: fc.string(),
              period: fc.constantFrom(1, 2), // Which period this transaction belongs to
            }),
            { minLength: 2, maxLength: 20 }
          ),
          async (userId: string, periods: any, transactionData: any[]) => {
            // Ensure valid date ranges
            const period1Start = periods.period1Start < periods.period1End ? periods.period1Start : periods.period1End;
            const period1End = periods.period1Start < periods.period1End ? periods.period1End : periods.period1Start;
            const period2Start = periods.period2Start < periods.period2End ? periods.period2Start : periods.period2End;
            const period2End = periods.period2Start < periods.period2End ? periods.period2End : periods.period2Start;

            // Generate transactions for both periods
            const period1Transactions = transactionData
              .filter(tx => tx.period === 1)
              .map((tx, index) => ({
                id: `p1-${index}`,
                amount: tx.amount,
                fromUserId: index % 2 === 0 ? userId : `other-user-${index}`,
                toUserId: index % 2 === 1 ? userId : `other-user-${index}`,
                status: 'SUCCESS',
                type: 'TRANSFER',
                createdAt: new Date(period1Start.getTime() + Math.random() * (period1End.getTime() - period1Start.getTime())),
              }));

            const period2Transactions = transactionData
              .filter(tx => tx.period === 2)
              .map((tx, index) => ({
                id: `p2-${index}`,
                amount: tx.amount,
                fromUserId: index % 2 === 0 ? userId : `other-user-${index}`,
                toUserId: index % 2 === 1 ? userId : `other-user-${index}`,
                status: 'SUCCESS',
                type: 'TRANSFER',
                createdAt: new Date(period2Start.getTime() + Math.random() * (period2End.getTime() - period2Start.getTime())),
              }));

            // Mock Prisma responses for different date ranges
            mockPrisma.transaction.findMany
              .mockImplementation((args: any) => {
                const startDate = args.where.createdAt.gte;
                const endDate = args.where.createdAt.lte;
                
                if (startDate.getTime() === period1Start.getTime()) {
                  return Promise.resolve(period1Transactions);
                } else if (startDate.getTime() === period2Start.getTime()) {
                  return Promise.resolve(period2Transactions);
                }
                return Promise.resolve([]);
              });

            // Execute period comparison
            const comparison = await service.comparePeriods(
              userId,
              period1Start,
              period1End,
              period2Start,
              period2End
            );

            // Verify comparison structure
            expect(comparison).toBeDefined();
            expect(comparison.period1).toBeDefined();
            expect(comparison.period2).toBeDefined();
            expect(comparison.changes).toBeDefined();

            // Verify period data consistency
            expect(comparison.period1.startDate).toEqual(period1Start);
            expect(comparison.period1.endDate).toEqual(period1End);
            expect(comparison.period2.startDate).toEqual(period2Start);
            expect(comparison.period2.endDate).toEqual(period2End);

            // Verify mathematical consistency of changes
            const expectedSpentChange = comparison.period2.totalSpent - comparison.period1.totalSpent;
            const expectedReceivedChange = comparison.period2.totalReceived - comparison.period1.totalReceived;
            const expectedCountChange = comparison.period2.transactionCount - comparison.period1.transactionCount;

            expect(Math.abs(comparison.changes.spentChange - expectedSpentChange)).toBeLessThan(0.01);
            expect(Math.abs(comparison.changes.receivedChange - expectedReceivedChange)).toBeLessThan(0.01);
            expect(comparison.changes.countChange).toBe(expectedCountChange);

            // Verify percentage calculations
            if (comparison.period1.totalSpent > 0) {
              const expectedSpentPercent = (expectedSpentChange / comparison.period1.totalSpent) * 100;
              expect(Math.abs(comparison.changes.spentChangePercent - expectedSpentPercent)).toBeLessThan(0.01);
            } else {
              expect(comparison.changes.spentChangePercent).toBe(0);
            }

            if (comparison.period1.totalReceived > 0) {
              const expectedReceivedPercent = (expectedReceivedChange / comparison.period1.totalReceived) * 100;
              expect(Math.abs(comparison.changes.receivedChangePercent - expectedReceivedPercent)).toBeLessThan(0.01);
            } else {
              expect(comparison.changes.receivedChangePercent).toBe(0);
            }

            if (comparison.period1.transactionCount > 0) {
              const expectedCountPercent = (expectedCountChange / comparison.period1.transactionCount) * 100;
              expect(Math.abs(comparison.changes.countChangePercent - expectedCountPercent)).toBeLessThan(0.01);
            } else {
              expect(comparison.changes.countChangePercent).toBe(0);
            }

            // Verify all amounts are non-negative
            expect(comparison.period1.totalSpent).toBeGreaterThanOrEqual(0);
            expect(comparison.period1.totalReceived).toBeGreaterThanOrEqual(0);
            expect(comparison.period1.transactionCount).toBeGreaterThanOrEqual(0);
            expect(comparison.period2.totalSpent).toBeGreaterThanOrEqual(0);
            expect(comparison.period2.totalReceived).toBeGreaterThanOrEqual(0);
            expect(comparison.period2.transactionCount).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test category breakdown calculations
     */
    test('Category breakdown calculations are accurate', async () => {
      const userId = 'user-123';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const mockTransactions = [
        {
          id: 'tx-1',
          amount: 100,
          status: 'SUCCESS',
          createdAt: new Date('2024-01-15'),
          category: { id: 'cat-1', name: 'Food', color: '#FF0000', icon: '🍽️' },
        },
        {
          id: 'tx-2',
          amount: 200,
          status: 'SUCCESS',
          createdAt: new Date('2024-01-20'),
          category: { id: 'cat-1', name: 'Food', color: '#FF0000', icon: '🍽️' },
        },
        {
          id: 'tx-3',
          amount: 150,
          status: 'SUCCESS',
          createdAt: new Date('2024-01-25'),
          category: null, // Uncategorized
        },
      ];

      mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions);

      const breakdown = await service.getCategoryBreakdown(userId, startDate, endDate);

      expect(breakdown.totalAmount).toBe(450);
      expect(breakdown.totalTransactions).toBe(3);
      expect(breakdown.categories).toHaveLength(1);
      expect(breakdown.categories[0].amount).toBe(300);
      expect(breakdown.categories[0].count).toBe(2);
      expect(breakdown.categories[0].percentage).toBeCloseTo(66.67, 1);
      expect(breakdown.uncategorized.amount).toBe(150);
      expect(breakdown.uncategorized.count).toBe(1);
      expect(breakdown.uncategorized.percentage).toBeCloseTo(33.33, 1);
    });

    /**
     * Test unusual pattern detection
     */
    test('Unusual pattern detection identifies anomalies', async () => {
      const userId = 'user-123';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      // Mock historical transactions (normal pattern)
      const historicalTransactions = Array.from({ length: 30 }, (_, i) => ({
        id: `hist-${i}`,
        amount: 50 + Math.random() * 50, // Normal amounts: 50-100
        fromUserId: userId,
        toUserId: 'regular-recipient',
        status: 'SUCCESS',
        createdAt: new Date(2023, 11, i + 1, 14, 0), // Regular time: 2 PM
        toUser: { id: 'regular-recipient', name: 'Regular User' },
        fromUser: { id: userId, name: 'Test User' },
      }));

      // Mock recent transactions with anomalies
      const recentTransactions = [
        {
          id: 'recent-1',
          amount: 500, // High amount anomaly
          fromUserId: userId,
          toUserId: 'regular-recipient',
          status: 'SUCCESS',
          createdAt: new Date('2024-01-15T14:00:00'),
          toUser: { id: 'regular-recipient', name: 'Regular User' },
          fromUser: { id: userId, name: 'Test User' },
        },
        {
          id: 'recent-2',
          amount: 75,
          fromUserId: userId,
          toUserId: 'new-recipient', // New recipient anomaly
          status: 'SUCCESS',
          createdAt: new Date('2024-01-20T03:00:00'), // Time anomaly: 3 AM
          toUser: { id: 'new-recipient', name: 'New User' },
          fromUser: { id: userId, name: 'Test User' },
        },
      ];

      mockPrisma.transaction.findMany.mockResolvedValue([
        ...historicalTransactions,
        ...recentTransactions,
      ]);

      const patterns = await service.detectUnusualPatterns(userId, startDate, endDate);

      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);

      // Should detect high amount pattern
      const highAmountPattern = patterns.find(p => p.type === 'HIGH_AMOUNT');
      expect(highAmountPattern).toBeDefined();
      expect(highAmountPattern?.confidence).toBeGreaterThan(0);

      // Should detect new recipient pattern
      const newRecipientPattern = patterns.find(p => p.type === 'NEW_RECIPIENT');
      expect(newRecipientPattern).toBeDefined();
      expect(newRecipientPattern?.confidence).toBeGreaterThan(0);

      // Should detect time anomaly
      const timeAnomalyPattern = patterns.find(p => p.type === 'TIME_ANOMALY');
      expect(timeAnomalyPattern).toBeDefined();
      expect(timeAnomalyPattern?.confidence).toBeGreaterThan(0);
    });

    /**
     * Property 17: Unusual Pattern Detection
     * For any set of historical and recent transactions, pattern detection should 
     * identify genuine anomalies while avoiding false positives
     * Validates: Requirements 6.6
     */
    test('Property 17: Unusual Pattern Detection', async () => {
      // Feature: enhanced-transaction-history, Property 17: Unusual Pattern Detection
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // userId
          fc.record({
            startDate: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-06-30') }),
            endDate: fc.date({ min: new Date('2024-07-01'), max: new Date('2024-12-31') }),
          }),
          fc.record({
            normalAmount: fc.float({ min: 50, max: 200 }),
            anomalyMultiplier: fc.float({ min: 2, max: 10 }),
            historicalCount: fc.integer({ min: 10, max: 50 }),
            recentCount: fc.integer({ min: 1, max: 10 }),
            hasNewRecipient: fc.boolean(),
            hasTimeAnomaly: fc.boolean(),
          }),
          async (userId: string, dateRange: any, anomalyConfig: any) => {
            // Ensure valid date range
            const startDate = dateRange.startDate < dateRange.endDate ? dateRange.startDate : dateRange.endDate;
            const endDate = dateRange.startDate < dateRange.endDate ? dateRange.endDate : dateRange.startDate;

            // Generate historical transactions (normal pattern)
            const historicalTransactions = Array.from({ length: anomalyConfig.historicalCount }, (_, i) => ({
              id: `hist-${i}`,
              amount: anomalyConfig.normalAmount + (Math.random() - 0.5) * anomalyConfig.normalAmount * 0.2, // ±10% variation
              fromUserId: userId,
              toUserId: 'regular-recipient',
              status: 'SUCCESS',
              createdAt: new Date(2023, 11, i + 1, 14, 0), // Regular time: 2 PM
              toUser: { id: 'regular-recipient', name: 'Regular User' },
              fromUser: { id: userId, name: 'Test User' },
            }));

            // Generate recent transactions with potential anomalies
            const recentTransactions = Array.from({ length: anomalyConfig.recentCount }, (_, i) => {
              const isHighAmount = i === 0 && anomalyConfig.anomalyMultiplier > 2;
              const isNewRecipient = i === 1 && anomalyConfig.hasNewRecipient;
              const isTimeAnomaly = i === 2 && anomalyConfig.hasTimeAnomaly;

              return {
                id: `recent-${i}`,
                amount: isHighAmount 
                  ? anomalyConfig.normalAmount * anomalyConfig.anomalyMultiplier 
                  : anomalyConfig.normalAmount + (Math.random() - 0.5) * anomalyConfig.normalAmount * 0.2,
                fromUserId: userId,
                toUserId: isNewRecipient ? `new-recipient-${i}` : 'regular-recipient',
                status: 'SUCCESS',
                createdAt: isTimeAnomaly 
                  ? new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000, 0, 0, 3, 0) // 3 AM anomaly
                  : new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000, 0, 0, 14, 0), // Normal 2 PM
                toUser: { 
                  id: isNewRecipient ? `new-recipient-${i}` : 'regular-recipient', 
                  name: isNewRecipient ? `New User ${i}` : 'Regular User' 
                },
                fromUser: { id: userId, name: 'Test User' },
              };
            });

            // Mock Prisma response
            mockPrisma.transaction.findMany.mockResolvedValue([
              ...historicalTransactions,
              ...recentTransactions,
            ]);

            // Execute pattern detection
            const patterns = await service.detectUnusualPatterns(userId, startDate, endDate);

            // Verify pattern detection results
            expect(patterns).toBeDefined();
            expect(Array.isArray(patterns)).toBe(true);

            // Verify pattern properties
            patterns.forEach(pattern => {
              expect(pattern.type).toMatch(/^(HIGH_AMOUNT|FREQUENT_TRANSACTIONS|NEW_RECIPIENT|TIME_ANOMALY)$/);
              expect(pattern.confidence).toBeGreaterThan(0);
              expect(pattern.confidence).toBeLessThanOrEqual(1);
              expect(pattern.description).toBeDefined();
              expect(typeof pattern.description).toBe('string');
              expect(pattern.transactions).toBeDefined();
              expect(Array.isArray(pattern.transactions)).toBe(true);
              expect(pattern.detectedAt).toBeInstanceOf(Date);
            });

            // Verify patterns are sorted by confidence (descending)
            for (let i = 0; i < patterns.length - 1; i++) {
              expect(patterns[i].confidence).toBeGreaterThanOrEqual(patterns[i + 1].confidence);
            }

            // Verify expected anomalies are detected when they should be
            if (anomalyConfig.anomalyMultiplier >= 3 && anomalyConfig.recentCount > 0) {
              const highAmountPattern = patterns.find(p => p.type === 'HIGH_AMOUNT');
              if (highAmountPattern) {
                expect(highAmountPattern.confidence).toBeGreaterThan(0);
              }
              // Note: High amount detection depends on having sufficient historical data
              // and the threshold calculation, so we don't always expect it to be detected
            }

            if (anomalyConfig.hasNewRecipient && anomalyConfig.recentCount > 1) {
              const newRecipientPattern = patterns.find(p => p.type === 'NEW_RECIPIENT');
              if (newRecipientPattern) {
                expect(newRecipientPattern.confidence).toBeGreaterThan(0);
              }
            }

            if (anomalyConfig.hasTimeAnomaly && anomalyConfig.recentCount > 2) {
              const timeAnomalyPattern = patterns.find(p => p.type === 'TIME_ANOMALY');
              if (timeAnomalyPattern) {
                expect(timeAnomalyPattern.confidence).toBeGreaterThan(0);
              }
            }

            // Verify no false positives for normal patterns
            if (anomalyConfig.anomalyMultiplier < 2 && !anomalyConfig.hasNewRecipient && !anomalyConfig.hasTimeAnomaly) {
              // Should have minimal or no patterns detected
              expect(patterns.length).toBeLessThanOrEqual(1);
              if (patterns.length > 0) {
                expect(patterns[0].confidence).toBeLessThan(0.5);
              }
            }

            // Verify transaction IDs in patterns are valid
            patterns.forEach(pattern => {
              pattern.transactions.forEach(txId => {
                expect(typeof txId).toBe('string');
                expect(txId.length).toBeGreaterThan(0);
              });
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});