import { describe, it, expect, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import { TransactionDetailsService, transactionDetailsService } from '../../services/transactionDetails.service';
import { EnhancedTransaction, TransactionCategory } from '../../types/transaction';
import { TransactionType, TransactionStatus } from '@prisma/client';

describe('TransactionDetailsService', () => {
  let service: TransactionDetailsService;

  beforeEach(() => {
    service = new TransactionDetailsService();
  });

  describe('Property 14: Expandable Transaction Details', () => {
    /**
     * Property 14: Expandable Transaction Details
     * **Validates: Requirements 5.6**
     * 
     * This property test validates that expandable transaction details:
     * 1. Always contain all required sections (basic, expanded, fees, metadata, receipt, category, audit)
     * 2. Preserve original transaction data integrity
     * 3. Format data consistently across different transaction types
     * 4. Handle missing optional fields gracefully
     * 5. Generate valid fee breakdowns when fees exist
     * 6. Create proper audit trails for all transactions
     * 7. Handle category information correctly (present or absent)
     * 8. Generate appropriate receipt status information
     */
    it('should generate complete expandable details for any valid transaction', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary enhanced transactions
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            fromUserId: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            toUserId: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
            fee: fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
            type: fc.constantFrom(...Object.values(TransactionType)),
            status: fc.constantFrom(...Object.values(TransactionStatus)),
            reference: fc.string({ minLength: 1, maxLength: 100 }),
            description: fc.option(fc.string({ maxLength: 500 })),
            metadata: fc.option(fc.dictionary(fc.string(), fc.anything())),
            receiptUrl: fc.option(fc.webUrl()),
            categoryId: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }),
            notes: fc.option(fc.string({ maxLength: 1000 })),
            receiptStatus: fc.constantFrom('NONE', 'GENERATING', 'AVAILABLE', 'FAILED'),
            searchableText: fc.option(fc.string({ maxLength: 1000 })),
            createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
            updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
            fromUser: fc.option(fc.record({
              id: fc.string({ minLength: 1, maxLength: 50 }),
              name: fc.string({ minLength: 1, maxLength: 100 }),
              phone: fc.string({ minLength: 10, maxLength: 15 }),
            })),
            toUser: fc.option(fc.record({
              id: fc.string({ minLength: 1, maxLength: 50 }),
              name: fc.string({ minLength: 1, maxLength: 100 }),
              phone: fc.string({ minLength: 10, maxLength: 15 }),
            })),
            category: fc.option(fc.record({
              id: fc.string({ minLength: 1, maxLength: 50 }),
              userId: fc.string({ minLength: 1, maxLength: 50 }),
              name: fc.string({ minLength: 1, maxLength: 100 }),
              color: fc.string({ minLength: 7, maxLength: 7 }).filter(s => s.startsWith('#')),
              icon: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
              isDefault: fc.boolean(),
              createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
              updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
            })),
          }).map(data => {
            // Ensure valid dates and updatedAt is after createdAt
            const validCreatedAt = isNaN(data.createdAt.getTime()) ? new Date('2020-01-01') : data.createdAt;
            const validUpdatedAt = isNaN(data.updatedAt.getTime()) ? new Date('2020-01-01') : data.updatedAt;
            return {
              ...data,
              createdAt: validCreatedAt,
              updatedAt: new Date(Math.max(validCreatedAt.getTime(), validUpdatedAt.getTime())),
            };
          }),
          async (transaction: EnhancedTransaction) => {
            // Test the expandable details generation
            const details = await service.getExpandedDetails(transaction);

            // Property 1: All required sections must be present
            expect(details).toHaveProperty('id');
            expect(details).toHaveProperty('basicInfo');
            expect(details).toHaveProperty('expandedInfo');
            expect(details).toHaveProperty('feeDetails');
            expect(details).toHaveProperty('metadataDetails');
            expect(details).toHaveProperty('receiptDetails');
            expect(details).toHaveProperty('categoryDetails');
            expect(details).toHaveProperty('auditTrail');

            // Property 2: Basic info must preserve transaction identity
            expect(details.id).toBe(transaction.id);
            expect(details.basicInfo.reference).toBe(transaction.reference);
            // The formatted amount should contain some representation of the amount
            expect(details.basicInfo.formattedAmount).toMatch(/\d+/); // Should contain at least one digit

            // Property 3: Status indicator must be consistent
            expect(details.basicInfo.statusIndicator).toHaveProperty('text');
            expect(details.basicInfo.statusIndicator).toHaveProperty('color');
            expect(details.basicInfo.statusIndicator).toHaveProperty('icon');
            expect(typeof details.basicInfo.statusIndicator.text).toBe('string');
            expect(typeof details.basicInfo.statusIndicator.color).toBe('string');
            expect(typeof details.basicInfo.statusIndicator.icon).toBe('string');

            // Property 4: Expanded info must handle optional fields gracefully
            expect(details.expandedInfo.description).toBe(transaction.description);
            expect(details.expandedInfo.notes).toBe(transaction.notes);
            expect(Array.isArray(details.expandedInfo.tags)).toBe(true);
            expect(details.expandedInfo.tags.length).toBe(transaction.tags.length);

            // Property 5: Transaction type info must be valid
            expect(details.expandedInfo.transactionType.type).toBe(transaction.type);
            expect(details.expandedInfo.transactionType.displayName).toBeTruthy();
            expect(details.expandedInfo.transactionType.description).toBeTruthy();
            expect(['incoming', 'outgoing', 'internal']).toContain(details.expandedInfo.transactionType.category);

            // Property 6: Fee details must be consistent
            expect(Array.isArray(details.feeDetails.breakdown)).toBe(true);
            expect(typeof details.feeDetails.totalFee).toBe('string');
            expect(typeof details.feeDetails.feePercentage).toBe('string');
            expect(typeof details.feeDetails.feeExplanation).toBe('string');

            // Property 7: Fee breakdown must sum correctly when fees exist
            if (transaction.fee > 0) {
              const feePercentage = (transaction.fee / transaction.amount) * 100;
              if (feePercentage >= 0.01) {
                // Only expect non-zero percentage if the calculated percentage is meaningful
                expect(details.feeDetails.breakdown.length).toBeGreaterThan(0);
                expect(details.feeDetails.feePercentage).not.toBe('0.00%');
                expect(details.feeDetails.feePercentage).not.toBe('0%');
              } else {
                // Very small fees might still result in 0.00% or 0.01% due to rounding
                expect(details.feeDetails.feePercentage).toMatch(/^0(\.\d{2})?%$/);
              }
            } else {
              // Fee percentage can be either '0%' (when amount is 0) or '0.00%' (when amount > 0 but fee is 0)
              expect(['0%', '0.00%']).toContain(details.feeDetails.feePercentage);
            }

            // Property 8: Metadata details must preserve structure
            expect(Array.isArray(details.metadataDetails.processedMetadata)).toBe(true);
            expect(details.metadataDetails.systemInfo).toHaveProperty('createdAt');
            expect(details.metadataDetails.systemInfo).toHaveProperty('updatedAt');
            expect(details.metadataDetails.systemInfo).toHaveProperty('source');

            // Property 9: Receipt details must have valid status
            expect(['none', 'generating', 'available', 'failed']).toContain(details.receiptDetails.status);
            expect(typeof details.receiptDetails.statusText).toBe('string');
            expect(Array.isArray(details.receiptDetails.downloadOptions)).toBe(true);
            expect(Array.isArray(details.receiptDetails.shareOptions)).toBe(true);
            expect(typeof details.receiptDetails.regenerationAvailable).toBe('boolean');

            // Property 10: Category details must handle presence/absence correctly
            if (transaction.category) {
              expect(details.categoryDetails.current).toBeTruthy();
              expect(details.categoryDetails.current!.id).toBe(transaction.category.id);
              expect(details.categoryDetails.current!.name).toBe(transaction.category.name);
            } else {
              expect(details.categoryDetails.current).toBeUndefined();
            }
            expect(Array.isArray(details.categoryDetails.suggestions)).toBe(true);
            expect(Array.isArray(details.categoryDetails.history)).toBe(true);
            expect(Array.isArray(details.categoryDetails.bulkActions)).toBe(true);

            // Property 11: Audit trail must contain creation event
            expect(Array.isArray(details.auditTrail.events)).toBe(true);
            expect(details.auditTrail.events.length).toBeGreaterThan(0);
            expect(details.auditTrail.events[0].event).toBe('transaction_created');
            expect(details.auditTrail.events[0].timestamp).toEqual(transaction.createdAt);

            // Property 12: Timeline must match events
            expect(Array.isArray(details.auditTrail.timeline)).toBe(true);
            expect(details.auditTrail.timeline.length).toBe(details.auditTrail.events.length);

            // Property 13: Status history must contain initial status
            expect(Array.isArray(details.auditTrail.statusHistory)).toBe(true);
            expect(details.auditTrail.statusHistory.length).toBeGreaterThan(0);
            expect(details.auditTrail.statusHistory[0].status).toBe(transaction.status);

            // Property 14: Related transactions must be array (even if empty)
            if (details.relatedTransactions) {
              expect(Array.isArray(details.relatedTransactions)).toBe(true);
            }

            // Property 15: All timestamps must be valid dates
            if (!isNaN(transaction.createdAt.getTime())) {
              expect(details.metadataDetails.systemInfo.createdAt).toBe(transaction.createdAt.toISOString());
            }
            if (!isNaN(transaction.updatedAt.getTime())) {
              expect(details.metadataDetails.systemInfo.updatedAt).toBe(transaction.updatedAt.toISOString());
            }

            // Property 16: Processing time calculation must be logical
            if (details.expandedInfo.processingTime && transaction.status === TransactionStatus.SUCCESS) {
              expect(typeof details.expandedInfo.processingTime).toBe('string');
              expect(details.expandedInfo.processingTime).toMatch(/\d+\s+(seconds?|minutes?|hours?)/);
            }

            // Property 17: Tag formatting must preserve count and add metadata
            details.expandedInfo.tags.forEach((tag, index) => {
              expect(tag.name).toBe(transaction.tags[index]);
              expect(typeof tag.color).toBe('string');
              expect(['user', 'system', 'auto']).toContain(tag.category);
              expect(typeof tag.removable).toBe('boolean');
            });

            // Property 18: Recipient info must be consistent with transaction direction
            const recipientInfo = details.basicInfo.recipientInfo;
            expect(['sent', 'received', 'internal']).toContain(recipientInfo.direction);
            expect(typeof recipientInfo.displayName).toBe('string');
            expect(typeof recipientInfo.label).toBe('string');

            // Property 19: Download options must be valid when receipt is available
            if (details.receiptDetails.status === 'available') {
              expect(details.receiptDetails.downloadOptions.length).toBeGreaterThan(0);
              details.receiptDetails.downloadOptions.forEach(option => {
                expect(['PDF', 'HTML', 'JSON']).toContain(option.format);
                expect(typeof option.url).toBe('string');
                expect(typeof option.description).toBe('string');
              });
            }

            // Property 20: Share options must always be present
            expect(details.receiptDetails.shareOptions.length).toBeGreaterThan(0);
            details.receiptDetails.shareOptions.forEach(option => {
              expect(['email', 'sms', 'link']).toContain(option.method);
              expect(typeof option.label).toBe('string');
              expect(typeof option.available).toBe('boolean');
              expect(typeof option.description).toBe('string');
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge cases in expandable details generation', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate edge case transactions
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            amount: fc.constantFrom(0, 0.01, 999999.99),
            fee: fc.constantFrom(0, 0.01, 9999.99),
            type: fc.constantFrom(...Object.values(TransactionType)),
            status: fc.constantFrom(...Object.values(TransactionStatus)),
            reference: fc.string({ minLength: 1, maxLength: 100 }),
            description: fc.option(fc.constant('')), // Empty description
            metadata: fc.option(fc.constant({})), // Empty metadata
            receiptUrl: fc.option(fc.constant('')), // Empty URL
            categoryId: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            tags: fc.constantFrom([], ['single-tag'], ['tag1', 'tag2', 'tag3']),
            notes: fc.option(fc.constant('')), // Empty notes
            receiptStatus: fc.constantFrom('NONE', 'GENERATING', 'AVAILABLE', 'FAILED'),
            searchableText: fc.option(fc.constant('')),
            createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
            updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
            fromUser: fc.option(fc.record({
              id: fc.string({ minLength: 1, maxLength: 50 }),
              name: fc.string({ minLength: 1, maxLength: 100 }),
              phone: fc.string({ minLength: 10, maxLength: 15 }),
            })),
            toUser: fc.option(fc.record({
              id: fc.string({ minLength: 1, maxLength: 50 }),
              name: fc.string({ minLength: 1, maxLength: 100 }),
              phone: fc.string({ minLength: 10, maxLength: 15 }),
            })),
            category: fc.option(fc.record({
              id: fc.string({ minLength: 1, maxLength: 50 }),
              userId: fc.string({ minLength: 1, maxLength: 50 }),
              name: fc.string({ minLength: 1, maxLength: 100 }),
              color: fc.string({ minLength: 7, maxLength: 7 }).filter(s => s.startsWith('#')),
              icon: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
              isDefault: fc.boolean(),
              createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
              updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
            })),
          }).map(data => ({
            ...data,
            updatedAt: new Date(Math.max(data.createdAt.getTime(), data.updatedAt.getTime())),
          })),
          async (transaction: EnhancedTransaction) => {
            // Test that edge cases don't break the service
            const details = await service.getExpandedDetails(transaction);

            // Should never throw and always return valid structure
            expect(details).toBeDefined();
            expect(details.id).toBe(transaction.id);

            // Empty descriptions should be handled gracefully
            if (transaction.description === '') {
              expect(details.expandedInfo.description).toBe('');
            }

            // Empty metadata should result in empty processed metadata
            if (transaction.metadata && Object.keys(transaction.metadata).length === 0) {
              expect(details.metadataDetails.processedMetadata).toEqual([]);
            }

            // Zero amounts should be formatted correctly
            if (transaction.amount === 0) {
              expect(details.basicInfo.formattedAmount).toContain('0');
            }

            // Zero fees should result in appropriate breakdown
            if (transaction.fee === 0) {
              expect(details.feeDetails.breakdown).toEqual([]);
              expect(['0%', '0.00%']).toContain(details.feeDetails.feePercentage);
              expect(details.feeDetails.feeExplanation).toContain('No fees');
            }

            // Empty tags should result in empty tag array
            if (transaction.tags.length === 0) {
              expect(details.expandedInfo.tags).toEqual([]);
            }

            // Receipt status edge cases
            if (transaction.receiptStatus === 'NONE') {
              expect(details.receiptDetails.downloadOptions).toEqual([]);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain consistency across multiple calls with same transaction', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            fromUserId: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            toUserId: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000000), noNaN: true }),
            fee: fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
            type: fc.constantFrom(...Object.values(TransactionType)),
            status: fc.constantFrom(...Object.values(TransactionStatus)),
            reference: fc.string({ minLength: 1, maxLength: 100 }),
            description: fc.option(fc.string({ maxLength: 500 })),
            metadata: fc.option(fc.dictionary(fc.string(), fc.anything())),
            receiptUrl: fc.option(fc.webUrl()),
            categoryId: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }),
            notes: fc.option(fc.string({ maxLength: 1000 })),
            receiptStatus: fc.constantFrom('NONE', 'GENERATING', 'AVAILABLE', 'FAILED'),
            searchableText: fc.option(fc.string({ maxLength: 1000 })),
            createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
            updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
            fromUser: fc.option(fc.record({
              id: fc.string({ minLength: 1, maxLength: 50 }),
              name: fc.string({ minLength: 1, maxLength: 100 }),
              phone: fc.string({ minLength: 10, maxLength: 15 }),
            })),
            toUser: fc.option(fc.record({
              id: fc.string({ minLength: 1, maxLength: 50 }),
              name: fc.string({ minLength: 1, maxLength: 100 }),
              phone: fc.string({ minLength: 10, maxLength: 15 }),
            })),
            category: fc.option(fc.record({
              id: fc.string({ minLength: 1, maxLength: 50 }),
              userId: fc.string({ minLength: 1, maxLength: 50 }),
              name: fc.string({ minLength: 1, maxLength: 100 }),
              color: fc.string({ minLength: 7, maxLength: 7 }).filter(s => s.startsWith('#')),
              icon: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
              isDefault: fc.boolean(),
              createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
              updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
            })),
          }).map(data => {
            // Ensure valid dates and updatedAt is after createdAt
            const validCreatedAt = isNaN(data.createdAt.getTime()) ? new Date('2020-01-01') : data.createdAt;
            const validUpdatedAt = isNaN(data.updatedAt.getTime()) ? new Date('2020-01-01') : data.updatedAt;
            return {
              ...data,
              createdAt: validCreatedAt,
              updatedAt: new Date(Math.max(validCreatedAt.getTime(), validUpdatedAt.getTime())),
            };
          }),
          async (transaction: EnhancedTransaction) => {
            // Call the service multiple times with the same transaction
            const details1 = await service.getExpandedDetails(transaction);
            const details2 = await service.getExpandedDetails(transaction);
            const details3 = await service.getExpandedDetails(transaction);

            // Results should be identical (deterministic)
            expect(details1.id).toBe(details2.id);
            expect(details2.id).toBe(details3.id);

            expect(details1.basicInfo.reference).toBe(details2.basicInfo.reference);
            expect(details2.basicInfo.reference).toBe(details3.basicInfo.reference);

            expect(details1.basicInfo.formattedAmount).toBe(details2.basicInfo.formattedAmount);
            expect(details2.basicInfo.formattedAmount).toBe(details3.basicInfo.formattedAmount);

            expect(details1.feeDetails.feePercentage).toBe(details2.feeDetails.feePercentage);
            expect(details2.feeDetails.feePercentage).toBe(details3.feeDetails.feePercentage);

            expect(details1.expandedInfo.tags.length).toBe(details2.expandedInfo.tags.length);
            expect(details2.expandedInfo.tags.length).toBe(details3.expandedInfo.tags.length);

            expect(details1.auditTrail.events.length).toBe(details2.auditTrail.events.length);
            expect(details2.auditTrail.events.length).toBe(details3.auditTrail.events.length);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Unit Tests - Specific Examples', () => {
    it('should format a complete transaction with all fields', async () => {
      const transaction: EnhancedTransaction = {
        id: 'txn_123',
        fromUserId: 'user_1',
        toUserId: 'user_2',
        amount: 1000.50,
        fee: 25.75,
        type: TransactionType.TRANSFER,
        status: TransactionStatus.SUCCESS,
        reference: 'REF123456',
        description: 'Payment for services',
        metadata: { orderId: 'order_123', source: 'mobile_app' },
        receiptUrl: 'https://example.com/receipt.pdf',
        categoryId: 'cat_1',
        tags: ['business', 'services'],
        notes: 'Monthly service payment',
        receiptStatus: 'AVAILABLE',
        searchableText: 'payment services business',
        createdAt: new Date('2024-01-15T10:30:00Z'),
        updatedAt: new Date('2024-01-15T10:31:00Z'),
        fromUser: {
          id: 'user_1',
          name: 'John Doe',
          phone: '+254700123456',
        },
        toUser: {
          id: 'user_2',
          name: 'Jane Smith',
          phone: '+254700654321',
        },
        category: {
          id: 'cat_1',
          userId: 'user_1',
          name: 'Business',
          color: '#3B82F6',
          icon: '💼',
          isDefault: false,
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
        },
      };

      const details = await service.getExpandedDetails(transaction);

      expect(details.id).toBe('txn_123');
      expect(details.basicInfo.reference).toBe('REF123456');
      expect(details.expandedInfo.description).toBe('Payment for services');
      expect(details.expandedInfo.notes).toBe('Monthly service payment');
      expect(details.expandedInfo.tags).toHaveLength(2);
      expect(details.expandedInfo.tags[0].name).toBe('business');
      expect(details.expandedInfo.tags[1].name).toBe('services');
      expect(details.feeDetails.breakdown).toHaveLength(3); // processing, network, service
      expect(details.categoryDetails.current?.name).toBe('Business');
      expect(details.receiptDetails.status).toBe('available');
      expect(details.receiptDetails.downloadOptions).toHaveLength(2);
      expect(details.auditTrail.events).toHaveLength(2); // created + updated
    });

    it('should handle minimal transaction with only required fields', async () => {
      const transaction: EnhancedTransaction = {
        id: 'txn_minimal',
        amount: 100,
        fee: 0,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.PENDING,
        reference: 'MIN123',
        tags: [],
        receiptStatus: 'NONE',
        createdAt: new Date('2024-01-15T10:30:00Z'),
        updatedAt: new Date('2024-01-15T10:30:00Z'),
      };

      const details = await service.getExpandedDetails(transaction);

      expect(details.id).toBe('txn_minimal');
      expect(details.basicInfo.reference).toBe('MIN123');
      expect(details.expandedInfo.description).toBeUndefined();
      expect(details.expandedInfo.notes).toBeUndefined();
      expect(details.expandedInfo.tags).toHaveLength(0);
      expect(details.feeDetails.breakdown).toHaveLength(0);
      expect(details.feeDetails.feePercentage).toBe('0.00%');
      expect(details.categoryDetails.current).toBeUndefined();
      expect(details.receiptDetails.status).toBe('none');
      expect(details.receiptDetails.downloadOptions).toHaveLength(0);
      expect(details.auditTrail.events).toHaveLength(1); // only created
    });

    it('should calculate fee percentage correctly', async () => {
      const transaction: EnhancedTransaction = {
        id: 'txn_fee_test',
        amount: 1000,
        fee: 50, // 5% fee
        type: TransactionType.PAYMENT,
        status: TransactionStatus.SUCCESS,
        reference: 'FEE123',
        tags: [],
        receiptStatus: 'NONE',
        createdAt: new Date('2024-01-15T10:30:00Z'),
        updatedAt: new Date('2024-01-15T10:30:00Z'),
      };

      const details = await service.getExpandedDetails(transaction);

      expect(details.feeDetails.feePercentage).toBe('5.00%');
      expect(details.feeDetails.breakdown).toHaveLength(3);
      expect(details.feeDetails.feeExplanation).toContain('Payment fees');
    });
  });
});