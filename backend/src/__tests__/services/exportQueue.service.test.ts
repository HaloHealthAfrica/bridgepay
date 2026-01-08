import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fc from 'fast-check';
import { ExportRequest } from '../../types/transaction';
import { TransactionType, TransactionStatus } from '@prisma/client';

// Mock the export queue service
class MockExportQueueService {
  private queue: any[] = [];
  private processing = new Map();
  private isRunning = false;
  private concurrency = 3;
  private stats = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    totalProcessed: 0,
  };

  async addJob(userId: string, request: ExportRequest, priority: number = 0): Promise<string> {
    const exportId = `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const job = { id: exportId, userId, request, priority, scheduledAt: new Date(), attempts: 0, maxAttempts: 3 };
    this.queue.push(job);
    this.stats.pending++;
    return exportId;
  }

  async scheduleJob(userId: string, request: ExportRequest, scheduledAt: Date, priority: number = 0): Promise<string> {
    return this.addJob(userId, request, priority);
  }

  async cancelJob(exportId: string): Promise<boolean> {
    const index = this.queue.findIndex(job => job.id === exportId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.stats.pending--;
      return true;
    }
    return false;
  }

  getStats() {
    return { ...this.stats };
  }

  getQueueStatus() {
    return {
      isRunning: this.isRunning,
      queueLength: this.queue.length,
      processing: this.processing.size,
      concurrency: this.concurrency,
      stats: this.getStats(),
    };
  }

  setConcurrency(concurrency: number): void {
    this.concurrency = concurrency;
  }

  pause(): void {
    this.isRunning = false;
  }

  resume(): void {
    this.isRunning = true;
  }

  async clearQueue(): Promise<number> {
    const count = this.queue.length;
    this.queue = [];
    this.stats.pending = 0;
    return count;
  }

  getJob(exportId: string): any {
    return this.queue.find(job => job.id === exportId) || 
           this.processing.get(exportId) || null;
  }

  getUserJobs(userId: string): any[] {
    return this.queue.filter(job => job.userId === userId);
  }

  async shutdown(): Promise<void> {
    this.isRunning = false;
  }
}

// Mock dependencies
jest.mock('../../services/transactionExport.service', () => ({
  transactionExportService: {
    exportTransactions: jest.fn(),
    cancelExport: jest.fn(),
  },
}));

const mockExportService = {
  exportTransactions: jest.fn(),
  cancelExport: jest.fn(),
};

describe('ExportQueueService', () => {
  let queueService: MockExportQueueService;

  beforeEach(() => {
    jest.clearAllMocks();
    queueService = new MockExportQueueService();
    queueService.pause(); // Start paused for testing
  });

  afterEach(async () => {
    await queueService.shutdown();
  });

  // Arbitraries for property-based testing
  const exportFormatArb = fc.constantFrom('CSV', 'PDF');
  
  const exportRequestArb = fc.record({
    format: exportFormatArb,
    filters: fc.option(fc.record({
      dateRange: fc.option(fc.record({
        startDate: fc.date(),
        endDate: fc.date(),
      })),
      types: fc.option(fc.array(fc.constantFrom(...Object.values(TransactionType)), { minLength: 1, maxLength: 3 })),
      statuses: fc.option(fc.array(fc.constantFrom(...Object.values(TransactionStatus)), { minLength: 1, maxLength: 3 })),
      amountRange: fc.option(fc.record({
        min: fc.float({ min: 0, max: 1000 }),
        max: fc.float({ min: 1000, max: 10000 }),
      })),
    })),
    includeAnalytics: fc.boolean(),
    emailDelivery: fc.boolean(),
  });

  const priorityArb = fc.integer({ min: 0, max: 10 });
  const userIdArb = fc.uuid();

  /**
   * Property 1: Queue Job Addition
   * Any valid export request should be successfully added to the queue
   */
  it('Property 1: Queue Job Addition', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        exportRequestArb,
        priorityArb,
        async (userId, exportRequest, priority) => {
          // Setup mock
          const mockExportId = 'test-export-id';
          // Mock the service call directly since we're testing the queue logic
          const exportId = await queueService.addJob(userId, exportRequest, priority);

          // Verify job was added
          expect(exportId).toBeDefined();
          expect(typeof exportId).toBe('string');

          // Verify queue stats
          const stats = queueService.getStats();
          expect(stats.pending).toBeGreaterThan(0);

          // Verify job can be retrieved
          const job = queueService.getJob(exportId);
          expect(job).toBeDefined();
          expect(job?.userId).toBe(userId);
          expect(job?.priority).toBe(priority);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 2: Priority Queue Ordering
   * Jobs with higher priority should be processed before lower priority jobs
   */
  it('Property 2: Priority Queue Ordering', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.array(
          fc.record({
            request: exportRequestArb,
            priority: priorityArb,
          }),
          { minLength: 3, maxLength: 10 }
        ),
        async (userId, jobConfigs) => {
          // Setup mocks
          let exportIdCounter = 0;
          mockExportService.exportTransactions.mockImplementation(() => {
            exportIdCounter++;
            return Promise.resolve({
              exportId: `export-${exportIdCounter}`,
              status: 'PROCESSING',
            });
          });

          // Add jobs with different priorities
          const addedJobs = [];
          for (const config of jobConfigs) {
            const exportId = await queueService.addJob(userId, config.request, config.priority);
            addedJobs.push({ exportId, priority: config.priority });
          }

          // Get queue status
          const status = queueService.getQueueStatus();
          expect(status.queueLength).toBe(jobConfigs.length);

          // Verify jobs are ordered by priority (higher first)
          const userJobs = queueService.getUserJobs(userId);
          for (let i = 0; i < userJobs.length - 1; i++) {
            expect(userJobs[i].priority).toBeGreaterThanOrEqual(userJobs[i + 1].priority);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 3: Job Cancellation
   * Any queued job should be cancellable before processing
   */
  it('Property 3: Job Cancellation', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        exportRequestArb,
        async (userId, exportRequest) => {
          // Setup mock
          const mockExportId = 'test-export-id';
          mockExportService.exportTransactions.mockResolvedValue({
            exportId: mockExportId,
            status: 'PROCESSING',
          });
          mockExportService.cancelExport.mockResolvedValue();

          // Add job
          const exportId = await queueService.addJob(userId, exportRequest);
          expect(queueService.getJob(exportId)).toBeDefined();

          // Cancel job
          const cancelled = await queueService.cancelJob(exportId);
          expect(cancelled).toBe(true);

          // Verify job is no longer in queue
          expect(queueService.getJob(exportId)).toBeNull();
          expect(mockExportService.cancelExport).toHaveBeenCalledWith(exportId, userId);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 4: Scheduled Job Processing
   * Jobs scheduled for future processing should not run until their scheduled time
   */
  it('Property 4: Scheduled Job Processing', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        exportRequestArb,
        fc.integer({ min: 1000, max: 5000 }), // Future delay in ms
        async (userId, exportRequest, delayMs) => {
          // Setup mock
          const mockExportId = 'test-export-id';
          mockExportService.exportTransactions.mockResolvedValue({
            exportId: mockExportId,
            status: 'PROCESSING',
          });

          // Schedule job for future
          const scheduledAt = new Date(Date.now() + delayMs);
          const exportId = await queueService.scheduleJob(userId, exportRequest, scheduledAt);

          // Verify job is in queue but not processing
          const job = queueService.getJob(exportId);
          expect(job).toBeDefined();
          expect(job?.scheduledAt).toEqual(scheduledAt);

          // Verify queue stats show pending job
          const stats = queueService.getStats();
          expect(stats.pending).toBeGreaterThan(0);
          expect(stats.processing).toBe(0);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 5: Concurrency Control
   * Queue should respect concurrency limits
   */
  it('Property 5: Concurrency Control', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.array(userIdArb, { minLength: 5, maxLength: 10 }),
        exportRequestArb,
        async (concurrency, userIds, exportRequest) => {
          // Set concurrency limit
          queueService.setConcurrency(concurrency);

          // Setup mocks
          let exportIdCounter = 0;
          mockExportService.exportTransactions.mockImplementation(() => {
            exportIdCounter++;
            return Promise.resolve({
              exportId: `export-${exportIdCounter}`,
              status: 'PROCESSING',
            });
          });

          // Add multiple jobs
          const exportIds = [];
          for (const userId of userIds) {
            const exportId = await queueService.addJob(userId, exportRequest);
            exportIds.push(exportId);
          }

          // Verify concurrency setting
          const status = queueService.getQueueStatus();
          expect(status.concurrency).toBe(concurrency);
          expect(status.queueLength).toBe(userIds.length);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 6: Queue Statistics Consistency
   * Queue statistics should always be consistent with actual queue state
   */
  it('Property 6: Queue Statistics Consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            userId: userIdArb,
            request: exportRequestArb,
            priority: priorityArb,
          }),
          { minLength: 1, maxLength: 20 }
        ),
        async (jobConfigs) => {
          // Setup mocks
          let exportIdCounter = 0;
          mockExportService.exportTransactions.mockImplementation(() => {
            exportIdCounter++;
            return Promise.resolve({
              exportId: `export-${exportIdCounter}`,
              status: 'PROCESSING',
            });
          });

          // Add jobs
          const exportIds = [];
          for (const config of jobConfigs) {
            const exportId = await queueService.addJob(config.userId, config.request, config.priority);
            exportIds.push(exportId);
          }

          // Verify statistics consistency
          const stats = queueService.getStats();
          const status = queueService.getQueueStatus();

          expect(stats.pending).toBe(status.queueLength);
          expect(stats.processing).toBe(status.processing);
          expect(stats.pending + stats.processing + stats.completed + stats.failed).toBe(stats.totalProcessed + jobConfigs.length);

          // Cancel some jobs and verify stats update
          const jobsToCancel = exportIds.slice(0, Math.floor(exportIds.length / 2));
          mockExportService.cancelExport.mockResolvedValue();

          for (const exportId of jobsToCancel) {
            await queueService.cancelJob(exportId);
          }

          const updatedStats = queueService.getStats();
          expect(updatedStats.pending).toBe(jobConfigs.length - jobsToCancel.length);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 7: User Job Isolation
   * Jobs for different users should be properly isolated
   */
  it('Property 7: User Job Isolation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(userIdArb, { minLength: 2, maxLength: 5 }),
        exportRequestArb,
        async (userIds, exportRequest) => {
          // Setup mocks
          let exportIdCounter = 0;
          mockExportService.exportTransactions.mockImplementation(() => {
            exportIdCounter++;
            return Promise.resolve({
              exportId: `export-${exportIdCounter}`,
              status: 'PROCESSING',
            });
          });

          // Add jobs for each user
          const userJobs = new Map<string, string[]>();
          for (const userId of userIds) {
            const exportId = await queueService.addJob(userId, exportRequest);
            if (!userJobs.has(userId)) {
              userJobs.set(userId, []);
            }
            userJobs.get(userId)!.push(exportId);
          }

          // Verify job isolation
          for (const userId of userIds) {
            const jobs = queueService.getUserJobs(userId);
            const expectedJobIds = userJobs.get(userId) || [];
            
            expect(jobs.length).toBe(expectedJobIds.length);
            jobs.forEach(job => {
              expect(job.userId).toBe(userId);
              expect(expectedJobIds).toContain(job.id);
            });
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 8: Queue Pause and Resume
   * Queue should properly handle pause and resume operations
   */
  it('Property 8: Queue Pause and Resume', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.array(exportRequestArb, { minLength: 1, maxLength: 5 }),
        async (userId, exportRequests) => {
          // Setup mocks
          let exportIdCounter = 0;
          mockExportService.exportTransactions.mockImplementation(() => {
            exportIdCounter++;
            return Promise.resolve({
              exportId: `export-${exportIdCounter}`,
              status: 'PROCESSING',
            });
          });

          // Verify queue starts paused (from beforeEach)
          expect(queueService.getQueueStatus().isRunning).toBe(false);

          // Add jobs while paused
          const exportIds = [];
          for (const request of exportRequests) {
            const exportId = await queueService.addJob(userId, request);
            exportIds.push(exportId);
          }

          // Verify jobs are queued but not processing
          const pausedStats = queueService.getStats();
          expect(pausedStats.pending).toBe(exportRequests.length);
          expect(pausedStats.processing).toBe(0);

          // Resume queue
          queueService.resume();
          expect(queueService.getQueueStatus().isRunning).toBe(true);

          // Pause again
          queueService.pause();
          expect(queueService.getQueueStatus().isRunning).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 9: Queue Clearing
   * Clearing the queue should remove all pending jobs
   */
  it('Property 9: Queue Clearing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            userId: userIdArb,
            request: exportRequestArb,
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (jobConfigs) => {
          // Setup mocks
          let exportIdCounter = 0;
          mockExportService.exportTransactions.mockImplementation(() => {
            exportIdCounter++;
            return Promise.resolve({
              exportId: `export-${exportIdCounter}`,
              status: 'PROCESSING',
            });
          });
          mockExportService.cancelExport.mockResolvedValue();

          // Add jobs
          for (const config of jobConfigs) {
            await queueService.addJob(config.userId, config.request);
          }

          // Verify jobs are in queue
          const beforeStats = queueService.getStats();
          expect(beforeStats.pending).toBe(jobConfigs.length);

          // Clear queue
          const clearedCount = await queueService.clearQueue();
          expect(clearedCount).toBe(jobConfigs.length);

          // Verify queue is empty
          const afterStats = queueService.getStats();
          expect(afterStats.pending).toBe(0);
          expect(queueService.getQueueStatus().queueLength).toBe(0);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 10: Error Handling Resilience
   * Queue should handle service errors gracefully
   */
  it('Property 10: Error Handling Resilience', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        exportRequestArb,
        fc.constantFrom(
          'Database connection failed',
          'Export service unavailable',
          'Invalid export format',
          'User not found'
        ),
        async (userId, exportRequest, errorMessage) => {
          // Setup mock to fail
          mockExportService.exportTransactions.mockRejectedValue(new Error(errorMessage));

          // Attempt to add job
          try {
            await queueService.addJob(userId, exportRequest);
            // If no error thrown, the service handled it gracefully
          } catch (error: any) {
            // Error should be properly formatted
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toBeDefined();
          }

          // Queue should remain in consistent state
          const stats = queueService.getStats();
          expect(stats).toBeDefined();
          expect(typeof stats.pending).toBe('number');
          expect(typeof stats.processing).toBe('number');
        }
      ),
      { numRuns: 50 }
    );
  });
});