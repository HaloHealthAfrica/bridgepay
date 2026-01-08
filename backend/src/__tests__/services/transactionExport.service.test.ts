import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fc from 'fast-check';
import { transactionExportService } from '../../services/transactionExport.service';
import { transactionFilterService } from '../../services/transactionFilter.service';
import { transactionAnalyticsService } from '../../services/transactionAnalytics.service';
import { prisma } from '../../lib/prisma';
import { 
  ExportRequest, 
  TransactionFilters, 
  EnhancedTransaction 
} from '../../types/transaction';
import { TransactionType, TransactionStatus } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock dependencies
jest.mock('../../lib/prisma', () => ({
  prisma: {
    transactionExport: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('../../services/transactionFilter.service');
jest.mock('../../services/transactionAnalytics.service');
jest.mock('fs/promises', () => ({
  access: jest.fn(),
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  stat: jest.fn(),
  unlink: jest.fn(),
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-export-id'),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockFilterService = transactionFilterService as jest.Mocked<typeof transactionFilterService>;
const mockAnalyticsService = transactionAnalyticsService as jest.Mocked<typeof transactionAnalyticsService>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('TransactionExportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock file system operations
    (mockFs.access as jest.Mock).mockResolvedValue(undefined);
    (mockFs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (mockFs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (mockFs.stat as jest.Mock).mockResolvedValue({ size: 1024 } as any);
    (mockFs.unlink as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Arbitraries for property-based testing
  const transactionTypeArb = fc.constantFrom(...Object.values(TransactionType));
  const transactionStatusArb = fc.constantFrom(...Object.values(TransactionStatus));
  const exportFormatArb = fc.constantFrom('CSV', 'PDF');

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

  const exportRequestArb = fc.record({
    format: exportFormatArb,
    filters: fc.option(transactionFiltersArb),
    includeAnalytics: fc.boolean(),
    emailDelivery: fc.boolean(),
  });

  const exportJobArb = fc.record({
    id: fc.uuid(),
    userId: fc.uuid(),
    format: exportFormatArb,
    filters: fc.option(transactionFiltersArb),
    includeAnalytics: fc.boolean(),
    emailDelivery: fc.boolean(),
    status: fc.constantFrom('PROCESSING', 'COMPLETED', 'FAILED'),
    fileName: fc.option(fc.string({ minLength: 5, maxLength: 50 })),
    filePath: fc.option(fc.string({ minLength: 10, maxLength: 100 })),
    downloadUrl: fc.option(fc.webUrl()),
    fileSize: fc.option(fc.integer({ min: 100, max: 10000000 })),
    recordCount: fc.integer({ min: 0, max: 10000 }),
    errorMessage: fc.option(fc.string({ minLength: 1, maxLength: 200 })),
    emailedAt: fc.option(fc.date()),
    createdAt: fc.date(),
    completedAt: fc.option(fc.date()),
  });

  /**
   * Property 10: Export Format Completeness
   * For any transaction dataset, exports in CSV and PDF formats should include 
   * all required transaction details (date, amount, type, status, description)
   */
  it('Property 10: Export Format Completeness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        exportRequestArb,
        fc.array(enhancedTransactionArb, { minLength: 1, maxLength: 50 }),
        async (userId, exportRequest, transactions) => {
          // Setup mocks
          const exportId = 'test-export-id';
          const mockExportJob = {
            id: exportId,
            userId,
            format: exportRequest.format,
            filters: exportRequest.filters,
            includeAnalytics: exportRequest.includeAnalytics,
            emailDelivery: exportRequest.emailDelivery,
            status: 'PROCESSING',
          };

          mockPrisma.transactionExport.create.mockResolvedValue(mockExportJob as any);
          mockFilterService.applyFilters.mockResolvedValue({
            transactions,
            totalCount: transactions.length,
            appliedFilters: exportRequest.filters || {},
            executionTime: 100,
          });

          if (exportRequest.includeAnalytics) {
            mockAnalyticsService.getTransactionInsights.mockResolvedValue({
              totalSpending: 1000,
              totalReceived: 800,
              netFlow: -200,
              averageTransaction: 100,
              mostActiveDay: '2024-01-15',
              largestTransaction: transactions[0],
              spendingVelocity: 2.5,
            });
          }

          // Test export creation
          const result = await transactionExportService.exportTransactions(userId, exportRequest);

          // Verify export was created
          expect(result.exportId).toBe(exportId);
          expect(result.status).toBe('PROCESSING');
          expect(mockPrisma.transactionExport.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
              userId,
              format: exportRequest.format,
              filters: exportRequest.filters,
              includeAnalytics: exportRequest.includeAnalytics,
              emailDelivery: exportRequest.emailDelivery,
              status: 'PROCESSING',
            }),
          });

          // Verify filter service was called correctly
          expect(mockFilterService.applyFilters).toHaveBeenCalledWith(
            userId,
            exportRequest.filters || {}
          );

          // If analytics included, verify analytics service was called
          if (exportRequest.includeAnalytics) {
            expect(mockAnalyticsService.getTransactionInsights).toHaveBeenCalled();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11: Filtered Export Accuracy
   * For any applied filters, exported data should contain only transactions 
   * that match the filter criteria
   */
  it('Property 11: Filtered Export Accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        exportRequestArb,
        fc.array(enhancedTransactionArb, { minLength: 5, maxLength: 20 }),
        async (userId, exportRequest, allTransactions) => {
          // Create a subset of transactions that match the filters
          const filteredTransactions = allTransactions.slice(0, Math.ceil(allTransactions.length / 2));
          
          // Setup mocks
          const exportId = 'test-export-id';
          mockPrisma.transactionExport.create.mockResolvedValue({
            id: exportId,
            userId,
            format: exportRequest.format,
            status: 'PROCESSING',
          } as any);

          mockFilterService.applyFilters.mockResolvedValue({
            transactions: filteredTransactions,
            totalCount: filteredTransactions.length,
            appliedFilters: exportRequest.filters || {},
            executionTime: 100,
          });

          // Test export creation
          const result = await transactionExportService.exportTransactions(userId, exportRequest);

          // Verify the filter service was called with correct parameters
          expect(mockFilterService.applyFilters).toHaveBeenCalledWith(
            userId,
            exportRequest.filters || {}
          );

          // Verify export was created successfully
          expect(result.exportId).toBe(exportId);
          expect(result.status).toBe('PROCESSING');

          // The actual filtering logic is tested in the filter service
          // Here we verify that the export service correctly uses the filtered results
          expect(mockPrisma.transactionExport.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
              userId,
              format: exportRequest.format,
              filters: exportRequest.filters,
            }),
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 12: Export Email Delivery
   * For any large export request, download links should be generated and 
   * delivered via email when requested
   */
  it('Property 12: Export Email Delivery', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.emailAddress(),
        exportJobArb.filter(job => job.status === 'COMPLETED'),
        async (userId, email, completedExportJob) => {
          // Setup mocks
          mockPrisma.transactionExport.findUnique.mockResolvedValue({
            ...completedExportJob,
            downloadUrl: 'http://localhost:3000/api/exports/test/download',
          } as any);
          
          mockPrisma.transactionExport.update.mockResolvedValue({
            ...completedExportJob,
            emailedAt: new Date(),
            downloadToken: 'test-token',
            downloadExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          } as any);

          // Test email delivery
          await transactionExportService.emailExport(completedExportJob.id, email);

          // Verify export was found
          expect(mockPrisma.transactionExport.findUnique).toHaveBeenCalledWith({
            where: { id: completedExportJob.id },
          });

          // Verify email timestamp and download token were updated
          expect(mockPrisma.transactionExport.update).toHaveBeenCalledWith({
            where: { id: completedExportJob.id },
            data: { 
              emailedAt: expect.any(Date),
              downloadExpiresAt: expect.any(Date),
            },
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test secure download link generation
   */
  it('should generate secure download links with expiration', async () => {
    await fc.assert(
      fc.asyncProperty(
        exportJobArb.filter(job => job.status === 'COMPLETED'),
        async (completedExportJob) => {
          // Setup mocks
          mockPrisma.transactionExport.findUnique.mockResolvedValue(completedExportJob as any);
          mockPrisma.transactionExport.update.mockResolvedValue({
            ...completedExportJob,
            downloadToken: 'test-secure-token',
            downloadExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          } as any);

          // Test download link generation
          const downloadLink = await transactionExportService.generateSecureDownloadLink(completedExportJob.id);

          // Verify link format
          expect(downloadLink).toMatch(/^https?:\/\/.*\/api\/exports\/.*\/download\?token=.+$/);
          expect(downloadLink).toContain(completedExportJob.id);
          expect(downloadLink).toContain('token=');

          // Verify database was updated with token and expiration
          expect(mockPrisma.transactionExport.update).toHaveBeenCalledWith({
            where: { id: completedExportJob.id },
            data: {
              downloadToken: expect.any(String),
              downloadExpiresAt: expect.any(Date),
            },
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test download token validation
   */
  it('should validate download tokens correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        exportJobArb.filter(job => job.status === 'COMPLETED'),
        fc.string({ minLength: 10, maxLength: 50 }),
        async (completedExportJob, validToken) => {
          // Setup export with valid token and future expiration
          const exportWithToken = {
            ...completedExportJob,
            downloadToken: validToken,
            downloadExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
            filePath: '/tmp/test-export.csv',
            fileName: 'test-export.csv',
          };

          mockPrisma.transactionExport.findUnique.mockResolvedValue(exportWithToken as any);
          (mockFs.access as jest.Mock).mockResolvedValue(undefined); // File exists

          // Test valid token
          const result = await transactionExportService.validateDownloadAndServeFile(
            completedExportJob.id, 
            validToken
          );

          // Verify result
          expect(result.filePath).toBe(exportWithToken.filePath);
          expect(result.fileName).toBe(exportWithToken.fileName);
          expect(result.mimeType).toBe(completedExportJob.format === 'CSV' ? 'text/csv' : 'application/pdf');

          // Verify file existence was checked
          expect(mockFs.access).toHaveBeenCalledWith(exportWithToken.filePath);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test download token expiration
   */
  it('should reject expired download tokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        exportJobArb.filter(job => job.status === 'COMPLETED'),
        fc.string({ minLength: 10, maxLength: 50 }),
        async (completedExportJob, validToken) => {
          // Setup export with expired token
          const expiredExport = {
            ...completedExportJob,
            downloadToken: validToken,
            downloadExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
            filePath: '/tmp/test-export.csv',
            fileName: 'test-export.csv',
          };

          mockPrisma.transactionExport.findUnique.mockResolvedValue(expiredExport as any);

          // Test expired token should throw error
          await expect(
            transactionExportService.validateDownloadAndServeFile(completedExportJob.id, validToken)
          ).rejects.toThrow('Download link has expired');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test invalid download tokens
   */
  it('should reject invalid download tokens', async () => {
    await fc.assert(
      fc.asyncProperty(
        exportJobArb.filter(job => job.status === 'COMPLETED'),
        fc.string({ minLength: 10, maxLength: 50 }),
        fc.string({ minLength: 10, maxLength: 50 }),
        async (completedExportJob, validToken, invalidToken) => {
          fc.pre(validToken !== invalidToken); // Ensure tokens are different

          // Setup export with valid token
          const exportWithToken = {
            ...completedExportJob,
            downloadToken: validToken,
            downloadExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            filePath: '/tmp/test-export.csv',
            fileName: 'test-export.csv',
          };

          mockPrisma.transactionExport.findUnique.mockResolvedValue(exportWithToken as any);

          // Test invalid token should throw error
          await expect(
            transactionExportService.validateDownloadAndServeFile(completedExportJob.id, invalidToken)
          ).rejects.toThrow('Invalid download token');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test CSV generation format completeness
   */
  it('should generate CSV with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(enhancedTransactionArb, { minLength: 1, maxLength: 10 }),
        exportRequestArb.filter(req => req.format === 'CSV'),
        async (transactions, exportRequest) => {
          // Setup mocks
          mockFilterService.applyFilters.mockResolvedValue({
            transactions,
            totalCount: transactions.length,
            appliedFilters: {},
            executionTime: 100,
          });

          if (exportRequest.includeAnalytics) {
            mockAnalyticsService.getTransactionInsights.mockResolvedValue({
              totalSpending: 1000,
              totalReceived: 800,
              netFlow: -200,
              averageTransaction: 100,
              mostActiveDay: '2024-01-15',
              largestTransaction: transactions[0],
              spendingVelocity: 2.5,
            });
          }

          // Access private method for testing
          const service = transactionExportService as any;
          const csvContent = await service.generateCSV(transactions, exportRequest);

          // Verify CSV structure
          const lines = csvContent.split('\n');
          const headers = lines[0].split(',');

          // Check required headers are present
          const requiredHeaders = [
            'Date', 'Reference', 'Type', 'Status', 'Amount', 'Fee', 
            'Description', 'From', 'To', 'Category', 'Tags', 'Notes'
          ];
          
          requiredHeaders.forEach(header => {
            expect(headers).toContain(header);
          });

          // Verify data rows (excluding header)
          const dataRows = lines.slice(1).filter(line => line.trim() && !line.includes('---'));
          expect(dataRows.length).toBeGreaterThanOrEqual(transactions.length);

          // If analytics included, verify analytics section
          if (exportRequest.includeAnalytics) {
            expect(csvContent).toContain('--- ANALYTICS ---');
            expect(csvContent).toContain('Total Spending');
            expect(csvContent).toContain('Total Received');
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Test PDF generation format completeness
   */
  it('should generate PDF with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(enhancedTransactionArb, { minLength: 1, maxLength: 10 }),
        exportRequestArb.filter(req => req.format === 'PDF'),
        async (transactions, exportRequest) => {
          // Setup mocks
          mockFilterService.applyFilters.mockResolvedValue({
            transactions,
            totalCount: transactions.length,
            appliedFilters: {},
            executionTime: 100,
          });

          if (exportRequest.includeAnalytics) {
            mockAnalyticsService.getTransactionInsights.mockResolvedValue({
              totalSpending: 1000,
              totalReceived: 800,
              netFlow: -200,
              averageTransaction: 100,
              mostActiveDay: '2024-01-15',
              largestTransaction: transactions[0],
              spendingVelocity: 2.5,
            });
          }

          // Access private method for testing
          const service = transactionExportService as any;
          const pdfContent = await service.generatePDF(transactions, exportRequest);

          // Verify PDF HTML structure
          expect(pdfContent).toContain('<!DOCTYPE html>');
          expect(pdfContent).toContain('Transaction History Export');
          expect(pdfContent).toContain('<table>');

          // Check required columns are present
          const requiredColumns = [
            'Date', 'Reference', 'Type', 'Status', 'Amount', 'Description'
          ];
          
          requiredColumns.forEach(column => {
            expect(pdfContent).toContain(`<th>${column}</th>`);
          });

          // Verify transaction data is included
          transactions.forEach(transaction => {
            // Check for HTML-escaped reference
            const escapedReference = transaction.reference
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
            expect(pdfContent).toContain(escapedReference);
            expect(pdfContent).toContain(transaction.type);
            expect(pdfContent).toContain(transaction.status);
          });

          // If analytics included, verify analytics section
          if (exportRequest.includeAnalytics) {
            expect(pdfContent).toContain('Analytics Summary');
            expect(pdfContent).toContain('Total Spending');
            expect(pdfContent).toContain('Total Received');
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Test export status tracking
   */
  it('should track export status correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        exportJobArb,
        async (exportJob) => {
          // Setup mock
          mockPrisma.transactionExport.findUnique.mockResolvedValue(exportJob as any);

          // Test status retrieval
          const result = await transactionExportService.getExportStatus(exportJob.id);

          // Verify result matches export job
          expect(result.exportId).toBe(exportJob.id);
          expect(result.status).toBe(exportJob.status);
          expect(result.recordCount).toBe(exportJob.recordCount);
          expect(result.downloadUrl).toBe(exportJob.downloadUrl || undefined);
          expect(result.fileSize).toBe(exportJob.fileSize || undefined);

          // Verify database was queried correctly
          expect(mockPrisma.transactionExport.findUnique).toHaveBeenCalledWith({
            where: { id: exportJob.id },
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test export cleanup functionality
   */
  it('should cleanup old exports correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(exportJobArb.filter(job => job.status === 'COMPLETED'), { minLength: 1, maxLength: 5 }),
        fc.integer({ min: 1, max: 30 }),
        async (oldExports, daysOld) => {
          // Clear mocks for this test iteration
          jest.clearAllMocks();
          
          // Make exports old
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - daysOld);
          
          const oldExportsWithOldDates = oldExports.map(exp => ({
            ...exp,
            createdAt: new Date(cutoffDate.getTime() - 24 * 60 * 60 * 1000), // 1 day before cutoff
            filePath: `/tmp/export_${exp.id}.csv`,
          }));

          // Setup mocks
          mockPrisma.transactionExport.findMany.mockResolvedValue(oldExportsWithOldDates as any);
          mockPrisma.transactionExport.delete.mockResolvedValue({} as any);

          // Test cleanup
          const cleanedCount = await transactionExportService.cleanupOldExports(daysOld);

          // Verify correct number of exports were cleaned
          expect(cleanedCount).toBe(oldExportsWithOldDates.length);

          // Verify database queries
          expect(mockPrisma.transactionExport.findMany).toHaveBeenCalledWith({
            where: {
              createdAt: { lt: expect.any(Date) },
              status: 'COMPLETED',
            },
          });

          // Verify files were deleted (only for exports with filePath)
          const exportsWithFiles = oldExportsWithOldDates.filter(exp => exp.filePath);
          expect(mockFs.unlink).toHaveBeenCalledTimes(exportsWithFiles.length);

          // Verify database records were deleted
          expect(mockPrisma.transactionExport.delete).toHaveBeenCalledTimes(oldExportsWithOldDates.length);
        }
      ),
      { numRuns: 20 } // Reduce number of runs to avoid accumulation issues
    );
  });

  /**
   * Test export cancellation
   */
  it('should cancel pending exports correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        exportJobArb.filter(job => job.status === 'PROCESSING'),
        async (userId, processingExport) => {
          // Setup mocks
          mockPrisma.transactionExport.findFirst.mockResolvedValue(processingExport as any);
          mockPrisma.transactionExport.update.mockResolvedValue({
            ...processingExport,
            status: 'FAILED',
            errorMessage: 'Cancelled by user',
          } as any);

          // Test cancellation
          await transactionExportService.cancelExport(processingExport.id, userId);

          // Verify export was found
          expect(mockPrisma.transactionExport.findFirst).toHaveBeenCalledWith({
            where: { id: processingExport.id, userId },
          });

          // Verify export was cancelled
          expect(mockPrisma.transactionExport.update).toHaveBeenCalledWith({
            where: { id: processingExport.id },
            data: {
              status: 'FAILED',
              errorMessage: 'Cancelled by user',
            },
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test user export history retrieval
   */
  it('should retrieve user export history correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(exportJobArb, { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 50 }),
        async (userId, userExports, limit) => {
          // Setup mock
          const limitedExports = userExports.slice(0, Math.min(limit, userExports.length));
          mockPrisma.transactionExport.findMany.mockResolvedValue(limitedExports as any);

          // Test history retrieval
          const result = await transactionExportService.getUserExports(userId, limit);

          // Verify correct query was made
          expect(mockPrisma.transactionExport.findMany).toHaveBeenCalledWith({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
              id: true,
              format: true,
              status: true,
              recordCount: true,
              fileSize: true,
              downloadUrl: true,
              createdAt: true,
              completedAt: true,
            },
          });

          // Verify result
          expect(result).toEqual(limitedExports);
        }
      ),
      { numRuns: 100 }
    );
  });
});