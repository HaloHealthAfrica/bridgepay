import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fc from 'fast-check';
import { transactionDisplayService, DisplayConfig } from '../../services/transactionDisplay.service';
import { EnhancedTransaction, TransactionCategory } from '../../types/transaction';
import { TransactionType, TransactionStatus } from '@prisma/client';

describe('TransactionDisplayService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Arbitraries for property-based testing
  const transactionTypeArb = fc.constantFrom(...Object.values(TransactionType));
  const transactionStatusArb = fc.constantFrom(...Object.values(TransactionStatus));
  
  const userArb = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    phone: fc.string({ minLength: 10, maxLength: 15 }),
  });

  const categoryArb = fc.record({
    id: fc.uuid(),
    userId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    color: fc.integer({ min: 0, max: 16777215 }).map(n => `#${n.toString(16).padStart(6, '0')}`),
    icon: fc.option(fc.string({ minLength: 1, maxLength: 5 })),
    isDefault: fc.boolean(),
    createdAt: fc.date(),
    updatedAt: fc.date(),
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

  const displayConfigArb = fc.record({
    currency: fc.constantFrom('KES', 'USD', 'EUR', 'GBP'),
    timezone: fc.constantFrom('Africa/Nairobi', 'UTC', 'America/New_York', 'Europe/London'),
    locale: fc.constantFrom('en-KE', 'en-US', 'en-GB', 'fr-FR'),
    dateFormat: fc.constantFrom('short', 'medium', 'long', 'full'),
    timeFormat: fc.constantFrom('12h', '24h'),
  });

  /**
   * Property 13: Transaction Display Formatting
   * For any transaction, the display formatting should include all required elements
   * with proper currency, date/time, status indicators, and recipient information
   */
  it('Property 13: Transaction Display Formatting', async () => {
    await fc.assert(
      fc.property(
        enhancedTransactionArb,
        displayConfigArb,
        (transaction, config) => {
          // Test transaction formatting
          const formatted = transactionDisplayService.formatTransaction(transaction, config);

          // Verify all required fields are present
          expect(formatted.id).toBe(transaction.id);
          expect(formatted.formattedAmount).toBeDefined();
          expect(formatted.formattedFee).toBeDefined();
          expect(formatted.formattedDate).toBeDefined();
          expect(formatted.formattedTime).toBeDefined();
          expect(formatted.formattedDateTime).toBeDefined();

          // Verify currency formatting contains currency code or symbol
          expect(formatted.formattedAmount).toMatch(/KES|USD|EUR|GBP|Ksh|\$|€|£/);
          expect(formatted.formattedFee).toMatch(/KES|USD|EUR|GBP|Ksh|\$|€|£/);

          // Verify status indicator has all required properties
          expect(formatted.statusIndicator.text).toBeDefined();
          expect(formatted.statusIndicator.color).toMatch(/^#[0-9A-F]{6}$/i);
          expect(formatted.statusIndicator.icon).toBeDefined();
          expect(formatted.statusIndicator.backgroundColor).toMatch(/^#[0-9A-F]{6}$/i);
          expect(formatted.statusIndicator.borderColor).toMatch(/^#[0-9A-F]{6}$/i);

          // Verify recipient info
          expect(formatted.recipientInfo.displayName).toBeDefined();
          expect(formatted.recipientInfo.direction).toMatch(/^(sent|received|internal)$/);
          expect(formatted.recipientInfo.label).toMatch(/^(From|To)$/);

          // Verify expandable details
          expect(formatted.expandableDetails.reference).toBe(transaction.reference);
          expect(formatted.expandableDetails.tags).toEqual(transaction.tags);
          expect(formatted.expandableDetails.feeBreakdown.totalFee).toBeDefined();

          // Verify visual elements
          expect(formatted.visualElements.typeIcon).toBeDefined();
          expect(formatted.visualElements.typeColor).toMatch(/^#[0-9A-F]{6}$/i);
          expect(formatted.visualElements.amountColor).toMatch(/^#[0-9A-F]{6}$/i);
          expect(formatted.visualElements.backgroundClass).toContain('bg-');
          expect(formatted.visualElements.borderClass).toContain('border-');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test currency formatting consistency
   */
  it('should format currency consistently across different amounts', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(1000000) }),
        displayConfigArb,
        (amount, config) => {
          const transaction: EnhancedTransaction = {
            id: 'test-id',
            amount,
            fee: 0,
            type: TransactionType.TRANSFER,
            status: TransactionStatus.SUCCESS,
            reference: 'TEST-REF',
            tags: [],
            receiptStatus: 'NONE',
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const formatted = transactionDisplayService.formatTransaction(transaction, config);

          // Currency formatting should always include the currency
          expect(formatted.formattedAmount).toMatch(/KES|USD|EUR|GBP|Ksh|\$|€|£/);
          
          // Should have proper decimal places (allowing for different locale formats)
          const amountMatch = formatted.formattedAmount.match(/\d+[.,]\d{2}|\d+/);
          expect(amountMatch).toBeTruthy();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test date/time formatting with timezone awareness
   */
  it('should format dates with timezone awareness', () => {
    fc.assert(
      fc.property(
        fc.date(),
        displayConfigArb,
        (date, config) => {
          const transaction: EnhancedTransaction = {
            id: 'test-id',
            amount: 100,
            fee: 0,
            type: TransactionType.TRANSFER,
            status: TransactionStatus.SUCCESS,
            reference: 'TEST-REF',
            tags: [],
            receiptStatus: 'NONE',
            createdAt: date,
            updatedAt: date,
          };

          const formatted = transactionDisplayService.formatTransaction(transaction, config);

          // Date and time should be formatted strings
          expect(typeof formatted.formattedDate).toBe('string');
          expect(typeof formatted.formattedTime).toBe('string');
          expect(typeof formatted.formattedDateTime).toBe('string');
          
          // Should not be empty
          expect(formatted.formattedDate.length).toBeGreaterThan(0);
          expect(formatted.formattedTime.length).toBeGreaterThan(0);
          expect(formatted.formattedDateTime.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test status indicators for all transaction statuses
   */
  it('should provide appropriate status indicators for all statuses', () => {
    fc.assert(
      fc.property(
        transactionStatusArb,
        (status) => {
          const transaction: EnhancedTransaction = {
            id: 'test-id',
            amount: 100,
            fee: 0,
            type: TransactionType.TRANSFER,
            status,
            reference: 'TEST-REF',
            tags: [],
            receiptStatus: 'NONE',
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const formatted = transactionDisplayService.formatTransaction(transaction);
          const indicator = formatted.statusIndicator;

          // Each status should have appropriate indicator
          expect(indicator.text).toBeDefined();
          expect(indicator.icon).toBeDefined();
          
          // Colors should be valid hex codes
          expect(indicator.color).toMatch(/^#[0-9A-F]{6}$/i);
          expect(indicator.backgroundColor).toMatch(/^#[0-9A-F]{6}$/i);
          expect(indicator.borderColor).toMatch(/^#[0-9A-F]{6}$/i);

          // Status-specific validations
          switch (status) {
            case TransactionStatus.SUCCESS:
              expect(indicator.text).toBe('Completed');
              expect(indicator.icon).toBe('✓');
              break;
            case TransactionStatus.PENDING:
              expect(indicator.text).toBe('Pending');
              expect(indicator.icon).toBe('⏳');
              break;
            case TransactionStatus.FAILED:
              expect(indicator.text).toBe('Failed');
              expect(indicator.icon).toBe('✗');
              break;
            case TransactionStatus.CANCELLED:
              expect(indicator.text).toBe('Cancelled');
              expect(indicator.icon).toBe('⊘');
              break;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test recipient information extraction
   */
  it('should extract recipient information correctly', () => {
    fc.assert(
      fc.property(
        transactionTypeArb,
        fc.option(userArb),
        fc.option(userArb),
        (type, fromUser, toUser) => {
          const transaction: EnhancedTransaction = {
            id: 'test-id',
            amount: 100,
            fee: 0,
            type,
            status: TransactionStatus.SUCCESS,
            reference: 'TEST-REF',
            tags: [],
            receiptStatus: 'NONE',
            createdAt: new Date(),
            updatedAt: new Date(),
            fromUser,
            toUser,
          };

          const formatted = transactionDisplayService.formatTransaction(transaction);
          const recipientInfo = formatted.recipientInfo;

          // Should have valid direction
          expect(['sent', 'received', 'internal']).toContain(recipientInfo.direction);
          
          // Should have valid label
          expect(['From', 'To']).toContain(recipientInfo.label);
          
          // Display name should be present
          expect(recipientInfo.displayName).toBeDefined();
          expect(recipientInfo.displayName.length).toBeGreaterThan(0);

          // Type-specific validations
          if (type === TransactionType.DEPOSIT) {
            expect(recipientInfo.direction).toBe('received');
            expect(recipientInfo.label).toBe('From');
          } else if (type === TransactionType.WITHDRAWAL) {
            expect(recipientInfo.direction).toBe('sent');
            expect(recipientInfo.label).toBe('To');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test fee breakdown calculation
   */
  it('should calculate fee breakdown correctly', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(10000) }),
        fc.float({ min: Math.fround(0), max: Math.fround(100) }).filter(fee => !isNaN(fee)),
        displayConfigArb,
        (amount, fee, config) => {
          fc.pre(!isNaN(amount) && !isNaN(fee)); // Exclude NaN values
          
          const transaction: EnhancedTransaction = {
            id: 'test-id',
            amount,
            fee,
            type: TransactionType.TRANSFER,
            status: TransactionStatus.SUCCESS,
            reference: 'TEST-REF',
            tags: [],
            receiptStatus: 'NONE',
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const formatted = transactionDisplayService.formatTransaction(transaction, config);
          const feeBreakdown = formatted.expandableDetails.feeBreakdown;

          // Fee breakdown should be present
          expect(feeBreakdown.baseFee).toBeDefined();
          expect(feeBreakdown.totalFee).toBeDefined();
          expect(feeBreakdown.feePercentage).toBeDefined();

          // Should contain currency
          expect(feeBreakdown.baseFee).toMatch(/KES|USD|EUR|GBP|Ksh|\$|€|£/);
          expect(feeBreakdown.totalFee).toMatch(/KES|USD|EUR|GBP|Ksh|\$|€|£/);

          // Percentage should be valid
          expect(feeBreakdown.feePercentage).toMatch(/^\d+(\.\d+)?%$/);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test visual elements for transaction types
   */
  it('should provide appropriate visual elements for all transaction types', () => {
    fc.assert(
      fc.property(
        transactionTypeArb,
        (type) => {
          const transaction: EnhancedTransaction = {
            id: 'test-id',
            amount: 100,
            fee: 0,
            type,
            status: TransactionStatus.SUCCESS,
            reference: 'TEST-REF',
            tags: [],
            receiptStatus: 'NONE',
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const formatted = transactionDisplayService.formatTransaction(transaction);
          const visual = formatted.visualElements;

          // Should have all visual elements
          expect(visual.typeIcon).toBeDefined();
          expect(visual.typeColor).toMatch(/^#[0-9A-F]{6}$/i);
          expect(visual.amountColor).toMatch(/^#[0-9A-F]{6}$/i);
          expect(visual.backgroundClass).toContain('bg-');
          expect(visual.borderClass).toContain('border-');

          // Type-specific validations
          switch (type) {
            case TransactionType.DEPOSIT:
              expect(visual.typeIcon).toBe('↓');
              expect(visual.amountColor).toBe('#10B981'); // Green for incoming
              break;
            case TransactionType.WITHDRAWAL:
              expect(visual.typeIcon).toBe('↑');
              expect(visual.amountColor).toBe('#EF4444'); // Red for outgoing
              break;
            case TransactionType.TRANSFER:
              expect(visual.typeIcon).toBe('↔');
              break;
            case TransactionType.PAYMENT:
              expect(visual.typeIcon).toBe('💳');
              expect(visual.amountColor).toBe('#EF4444'); // Red for outgoing
              break;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test multiple transaction formatting consistency
   */
  it('should format multiple transactions consistently', () => {
    fc.assert(
      fc.property(
        fc.array(enhancedTransactionArb, { minLength: 1, maxLength: 10 }),
        displayConfigArb,
        (transactions, config) => {
          const formatted = transactionDisplayService.formatTransactions(transactions, config);

          // Should have same length
          expect(formatted.length).toBe(transactions.length);

          // Each formatted transaction should have all required fields
          formatted.forEach((formattedTx, index) => {
            const originalTx = transactions[index];
            
            expect(formattedTx.id).toBe(originalTx.id);
            expect(formattedTx.formattedAmount).toBeDefined();
            expect(formattedTx.statusIndicator).toBeDefined();
            expect(formattedTx.recipientInfo).toBeDefined();
            expect(formattedTx.expandableDetails).toBeDefined();
            expect(formattedTx.visualElements).toBeDefined();
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Test relative time formatting
   */
  it('should format relative time correctly', () => {
    const now = new Date();
    
    // Test recent times
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    expect(transactionDisplayService.getRelativeTime(now)).toBe('Just now');
    expect(transactionDisplayService.getRelativeTime(oneMinuteAgo)).toContain('minute');
    expect(transactionDisplayService.getRelativeTime(oneHourAgo)).toContain('hour');
    expect(transactionDisplayService.getRelativeTime(oneDayAgo)).toContain('day');
    
    // For older dates, should return formatted date
    const relativeTime = transactionDisplayService.getRelativeTime(oneWeekAgo);
    expect(relativeTime).toBeDefined();
    expect(relativeTime.length).toBeGreaterThan(0);
  });

  /**
   * Test transaction summary generation
   */
  it('should generate meaningful transaction summaries', () => {
    fc.assert(
      fc.property(
        enhancedTransactionArb,
        (transaction) => {
          const summary = transactionDisplayService.getTransactionSummary(transaction);

          // Summary should contain key information
          expect(summary).toBeDefined();
          expect(summary.length).toBeGreaterThan(0);
          
          // Should contain amount and direction
          expect(summary).toMatch(/KES|sent|received|from|to/i);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test display configuration validation
   */
  it('should validate display configurations correctly', () => {
    // Valid configurations
    expect(transactionDisplayService.validateDisplayConfig({
      currency: 'USD',
      timezone: 'UTC',
      locale: 'en-US',
    })).toBe(true);

    expect(transactionDisplayService.validateDisplayConfig({
      currency: 'KES',
      timezone: 'Africa/Nairobi',
      locale: 'en-KE',
    })).toBe(true);

    // Invalid configurations should be handled gracefully
    // The service should not throw errors even with invalid configs
    expect(() => {
      transactionDisplayService.validateDisplayConfig({
        currency: 'INVALID',
        timezone: 'Invalid/Timezone',
        locale: 'invalid-locale',
      });
    }).not.toThrow();
  });

  /**
   * Test expandable details completeness
   */
  it('should provide complete expandable details', () => {
    fc.assert(
      fc.property(
        enhancedTransactionArb,
        (transaction) => {
          const formatted = transactionDisplayService.formatTransaction(transaction);
          const details = formatted.expandableDetails;

          // Should have reference
          expect(details.reference).toBe(transaction.reference);
          
          // Should have tags
          expect(details.tags).toEqual(transaction.tags);
          
          // Should have receipt status
          expect(details.receiptStatus).toBeDefined();
          
          // Should have fee breakdown
          expect(details.feeBreakdown).toBeDefined();
          expect(details.feeBreakdown.totalFee).toBeDefined();
          expect(details.feeBreakdown.feePercentage).toBeDefined();

          // If category exists, should be formatted
          if (transaction.category) {
            expect(details.category).toBeDefined();
            expect(details.category!.name).toBe(transaction.category.name);
            expect(details.category!.color).toBe(transaction.category.color);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});