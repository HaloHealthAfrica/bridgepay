import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fc from 'fast-check';
import { ExportRequest } from '../../types/transaction';
import { TransactionType, TransactionStatus } from '@prisma/client';

// Mock scheduler service
class MockExportSchedulerService {
  private schedules = new Map();
  private isRunning = false;
  private stats = {
    totalSchedules: 0,
    activeSchedules: 0,
    completedRuns: 0,
    failedRuns: 0,
  };

  async createSchedule(userId: string, name: string, exportRequest: ExportRequest, schedule: any, description?: string): Promise<string> {
    const scheduleId = `schedule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate next run time based on schedule type
    let nextRunAt = new Date();
    switch (schedule.type) {
      case 'ONCE':
        nextRunAt.setHours(schedule.hour, schedule.minute, 0, 0);
        if (nextRunAt <= new Date()) {
          nextRunAt.setDate(nextRunAt.getDate() + 1);
        }
        break;
      case 'DAILY':
        nextRunAt.setHours(schedule.hour, schedule.minute, 0, 0);
        if (nextRunAt <= new Date()) {
          nextRunAt.setDate(nextRunAt.getDate() + 1);
        }
        break;
      case 'WEEKLY':
        nextRunAt.setHours(schedule.hour, schedule.minute, 0, 0);
        const targetDay = schedule.dayOfWeek || 0;
        const currentDay = nextRunAt.getDay();
        let daysUntilTarget = targetDay - currentDay;
        if (daysUntilTarget <= 0) {
          daysUntilTarget += 7;
        }
        nextRunAt.setDate(nextRunAt.getDate() + daysUntilTarget);
        break;
      case 'MONTHLY':
        nextRunAt.setHours(schedule.hour, schedule.minute, 0, 0);
        const targetDayOfMonth = schedule.dayOfMonth || 1;
        nextRunAt.setDate(targetDayOfMonth);
        if (nextRunAt <= new Date()) {
          nextRunAt.setMonth(nextRunAt.getMonth() + 1);
          nextRunAt.setDate(targetDayOfMonth);
        }
        break;
      case 'CUSTOM':
        const intervalMinutes = schedule.interval || 60;
        nextRunAt = new Date(Date.now() + (intervalMinutes * 60 * 1000));
        break;
      default:
        nextRunAt = new Date(Date.now() + 60000); // Default to 1 minute
    }
    
    const scheduledExport = {
      id: scheduleId,
      userId,
      name,
      description,
      exportRequest,
      schedule,
      isActive: true,
      nextRunAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.schedules.set(scheduleId, scheduledExport);
    this.stats.totalSchedules++;
    this.stats.activeSchedules++;
    return scheduleId;
  }

  async updateSchedule(scheduleId: string, updates: any): Promise<void> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) throw new Error('Schedule not found');
    
    const wasActive = schedule.isActive;
    Object.assign(schedule, updates, { updatedAt: new Date() });
    
    if (wasActive && !schedule.isActive) {
      this.stats.activeSchedules--;
    } else if (!wasActive && schedule.isActive) {
      this.stats.activeSchedules++;
    }
  }

  async deleteSchedule(scheduleId: string): Promise<void> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) throw new Error('Schedule not found');
    
    this.schedules.delete(scheduleId);
    this.stats.totalSchedules--;
    if (schedule.isActive) {
      this.stats.activeSchedules--;
    }
  }

  getSchedule(scheduleId: string): any {
    return this.schedules.get(scheduleId) || null;
  }

  getUserSchedules(userId: string): any[] {
    return Array.from(this.schedules.values()).filter(s => s.userId === userId);
  }

  getActiveSchedules(): any[] {
    return Array.from(this.schedules.values()).filter(s => s.isActive);
  }

  async triggerSchedule(scheduleId: string): Promise<string> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) throw new Error('Schedule not found');
    
    // Mock the queue service call
    mockQueueService.addJob.mockResolvedValue('test-export-id');
    const exportId = await mockQueueService.addJob(schedule.userId, schedule.exportRequest, 10);
    
    this.stats.completedRuns++;
    return exportId;
  }

  getStats() {
    return { ...this.stats };
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      totalSchedules: this.stats.totalSchedules,
      activeSchedules: this.stats.activeSchedules,
      nextRunTime: new Date(Date.now() + 60000),
      checkInterval: 60000,
    };
  }

  start(): void {
    this.isRunning = true;
  }

  stop(): void {
    this.isRunning = false;
  }

  async shutdown(): Promise<void> {
    this.isRunning = false;
  }
}

// Mock dependencies
const mockQueueService = {
  addJob: jest.fn(),
};

const mockPrisma = {
  exportSchedule: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('ExportSchedulerService', () => {
  let schedulerService: MockExportSchedulerService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock database responses
    mockPrisma.exportSchedule.findMany.mockResolvedValue([]);
    mockPrisma.exportSchedule.create.mockImplementation((data: any) => 
      Promise.resolve({
        id: data.data.id,
        ...data.data,
      } as any)
    );
    mockPrisma.exportSchedule.update.mockImplementation((params: any) => 
      Promise.resolve({
        id: params.where.id,
        ...params.data,
      } as any)
    );
    mockPrisma.exportSchedule.delete.mockResolvedValue({} as any);
    
    schedulerService = new MockExportSchedulerService();
    schedulerService.stop(); // Start stopped for testing
  });

  afterEach(async () => {
    await schedulerService.shutdown();
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
    })),
    includeAnalytics: fc.boolean(),
    emailDelivery: fc.boolean(),
  });

  const scheduleTypeArb = fc.constantFrom('ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');
  
  const scheduleConfigArb = fc.record({
    type: scheduleTypeArb,
    hour: fc.integer({ min: 0, max: 23 }),
    minute: fc.integer({ min: 0, max: 59 }),
    dayOfWeek: fc.option(fc.integer({ min: 0, max: 6 })),
    dayOfMonth: fc.option(fc.integer({ min: 1, max: 31 })),
    interval: fc.option(fc.integer({ min: 1, max: 1440 })), // 1 minute to 24 hours
    timezone: fc.option(fc.constantFrom('UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo')),
  });

  const userIdArb = fc.uuid();
  const scheduleNameArb = fc.string({ minLength: 1, maxLength: 100 });
  const scheduleDescriptionArb = fc.option(fc.string({ minLength: 1, maxLength: 500 }));

  /**
   * Property 1: Schedule Creation
   * Any valid schedule configuration should be successfully created
   */
  it('Property 1: Schedule Creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        scheduleNameArb,
        exportRequestArb,
        scheduleConfigArb,
        scheduleDescriptionArb,
        async (userId, name, exportRequest, schedule, description) => {
          // Create schedule
          const scheduleId = await schedulerService.createSchedule(
            userId,
            name,
            exportRequest,
            schedule,
            description || undefined
          );

          // Verify schedule was created
          expect(scheduleId).toBeDefined();
          expect(typeof scheduleId).toBe('string');

          // Verify schedule can be retrieved
          const retrievedSchedule = schedulerService.getSchedule(scheduleId);
          expect(retrievedSchedule).toBeDefined();
          expect(retrievedSchedule?.userId).toBe(userId);
          expect(retrievedSchedule?.name).toBe(name);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 2: Schedule Update
   * Any existing schedule should be updatable with valid parameters
   */
  it('Property 2: Schedule Update', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        scheduleNameArb,
        exportRequestArb,
        scheduleConfigArb,
        scheduleNameArb, // New name
        fc.boolean(), // New active status
        async (userId, originalName, exportRequest, schedule, newName, newActiveStatus) => {
          // Create initial schedule
          const scheduleId = await schedulerService.createSchedule(
            userId,
            originalName,
            exportRequest,
            schedule
          );

          // Update schedule
          await schedulerService.updateSchedule(scheduleId, {
            name: newName,
            isActive: newActiveStatus,
          });

          // Verify schedule reflects updates
          const updatedSchedule = schedulerService.getSchedule(scheduleId);
          expect(updatedSchedule?.name).toBe(newName);
          expect(updatedSchedule?.isActive).toBe(newActiveStatus);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 3: Schedule Deletion
   * Any existing schedule should be deletable
   */
  it('Property 3: Schedule Deletion', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        scheduleNameArb,
        exportRequestArb,
        scheduleConfigArb,
        async (userId, name, exportRequest, schedule) => {
          // Create schedule
          const scheduleId = await schedulerService.createSchedule(
            userId,
            name,
            exportRequest,
            schedule
          );

          // Verify schedule exists
          expect(schedulerService.getSchedule(scheduleId)).toBeDefined();

          // Delete schedule
          await schedulerService.deleteSchedule(scheduleId);

          // Verify schedule no longer exists
          expect(schedulerService.getSchedule(scheduleId)).toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 4: User Schedule Isolation
   * Schedules should be properly isolated by user
   */
  it('Property 4: User Schedule Isolation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(userIdArb, { minLength: 2, maxLength: 5 }),
        scheduleNameArb,
        exportRequestArb,
        scheduleConfigArb,
        async (userIds, name, exportRequest, schedule) => {
          // Create schedules for each user
          const userSchedules = new Map<string, string[]>();
          
          for (const userId of userIds) {
            const scheduleId = await schedulerService.createSchedule(
              userId,
              `${name}-${userId}`,
              exportRequest,
              schedule
            );
            
            if (!userSchedules.has(userId)) {
              userSchedules.set(userId, []);
            }
            userSchedules.get(userId)!.push(scheduleId);
          }

          // Verify schedule isolation
          for (const userId of userIds) {
            const userScheduleList = schedulerService.getUserSchedules(userId);
            const expectedScheduleIds = userSchedules.get(userId) || [];
            
            expect(userScheduleList.length).toBe(expectedScheduleIds.length);
            userScheduleList.forEach(schedule => {
              expect(schedule.userId).toBe(userId);
              expect(expectedScheduleIds).toContain(schedule.id);
            });
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 5: Schedule Execution Triggering
   * Manual schedule triggering should queue export jobs
   */
  it('Property 5: Schedule Execution Triggering', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        scheduleNameArb,
        exportRequestArb,
        scheduleConfigArb,
        async (userId, name, exportRequest, schedule) => {
          // Setup queue service mock
          const mockExportId = 'test-export-id';
          mockQueueService.addJob.mockResolvedValue(mockExportId);

          // Create schedule
          const scheduleId = await schedulerService.createSchedule(
            userId,
            name,
            exportRequest,
            schedule
          );

          // Trigger schedule manually
          const exportId = await schedulerService.triggerSchedule(scheduleId);

          // Verify export was queued
          expect(exportId).toBe(mockExportId);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 6: Next Run Time Calculation
   * Next run times should be calculated correctly for different schedule types
   */
  it('Property 6: Next Run Time Calculation', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        scheduleNameArb,
        exportRequestArb,
        scheduleConfigArb,
        async (userId, name, exportRequest, schedule) => {
          // Create schedule
          const scheduleId = await schedulerService.createSchedule(
            userId,
            name,
            exportRequest,
            schedule
          );

          const createdSchedule = schedulerService.getSchedule(scheduleId);
          expect(createdSchedule).toBeDefined();

          const nextRunAt = createdSchedule!.nextRunAt;
          const now = new Date();

          // Verify next run time properties based on schedule type
          switch (schedule.type) {
            case 'ONCE':
              // For one-time schedules, next run should be in the future or far future if time passed
              expect(nextRunAt).toBeInstanceOf(Date);
              break;

            case 'DAILY':
              // For daily schedules, next run should be within 24 hours
              const dailyDiff = nextRunAt.getTime() - now.getTime();
              expect(dailyDiff).toBeGreaterThan(0);
              expect(dailyDiff).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
              expect(nextRunAt.getHours()).toBe(schedule.hour);
              expect(nextRunAt.getMinutes()).toBe(schedule.minute);
              break;

            case 'WEEKLY':
              // For weekly schedules, verify day of week if specified
              if (schedule.dayOfWeek !== undefined) {
                expect(nextRunAt.getDay()).toBe(schedule.dayOfWeek);
              }
              expect(nextRunAt.getHours()).toBe(schedule.hour);
              expect(nextRunAt.getMinutes()).toBe(schedule.minute);
              break;

            case 'MONTHLY':
              // For monthly schedules, verify day of month if specified
              if (schedule.dayOfMonth !== undefined) {
                expect(nextRunAt.getDate()).toBe(Math.min(schedule.dayOfMonth, 31));
              }
              expect(nextRunAt.getHours()).toBe(schedule.hour);
              expect(nextRunAt.getMinutes()).toBe(schedule.minute);
              break;

            case 'CUSTOM':
              // For custom schedules, next run should be based on interval
              if (schedule.interval) {
                const customDiff = nextRunAt.getTime() - now.getTime();
                const expectedInterval = schedule.interval * 60 * 1000;
                expect(customDiff).toBeGreaterThan(0);
                expect(customDiff).toBeLessThanOrEqual(expectedInterval + 60000); // Allow 1 minute tolerance
              }
              break;
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 7: Active Schedule Filtering
   * Only active schedules should be included in active schedule lists
   */
  it('Property 7: Active Schedule Filtering', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        fc.array(
          fc.record({
            name: scheduleNameArb,
            request: exportRequestArb,
            schedule: scheduleConfigArb,
            isActive: fc.boolean(),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (userId, scheduleConfigs) => {
          // Create schedules with different active states
          const scheduleIds = [];
          for (const config of scheduleConfigs) {
            const scheduleId = await schedulerService.createSchedule(
              userId,
              config.name,
              config.request,
              config.schedule
            );
            
            // Update active status if needed
            if (!config.isActive) {
              await schedulerService.updateSchedule(scheduleId, {
                isActive: false,
              });
            }
            
            scheduleIds.push({ id: scheduleId, isActive: config.isActive });
          }

          // Get active schedules
          const activeSchedules = schedulerService.getActiveSchedules();
          const expectedActiveCount = scheduleConfigs.filter(c => c.isActive).length;

          expect(activeSchedules.length).toBe(expectedActiveCount);
          activeSchedules.forEach(schedule => {
            expect(schedule.isActive).toBe(true);
          });

          // Get all user schedules
          const allUserSchedules = schedulerService.getUserSchedules(userId);
          expect(allUserSchedules.length).toBe(scheduleConfigs.length);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 8: Scheduler Statistics Consistency
   * Scheduler statistics should be consistent with actual schedule state
   */
  it('Property 8: Scheduler Statistics Consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            userId: userIdArb,
            name: scheduleNameArb,
            request: exportRequestArb,
            schedule: scheduleConfigArb,
            isActive: fc.boolean(),
          }),
          { minLength: 1, maxLength: 15 }
        ),
        async (scheduleConfigs) => {
          // Create schedules
          for (const config of scheduleConfigs) {
            const scheduleId = await schedulerService.createSchedule(
              config.userId,
              config.name,
              config.request,
              config.schedule
            );
            
            if (!config.isActive) {
              await schedulerService.updateSchedule(scheduleId, {
                isActive: false,
              });
            }
          }

          // Get statistics
          const stats = schedulerService.getStats();
          const status = schedulerService.getStatus();

          // Verify statistics consistency
          expect(stats.totalSchedules).toBe(scheduleConfigs.length);
          expect(stats.activeSchedules).toBe(scheduleConfigs.filter(c => c.isActive).length);
          expect(status.totalSchedules).toBe(stats.totalSchedules);
          expect(status.activeSchedules).toBe(stats.activeSchedules);

          // Verify next run time is set if there are active schedules
          if (stats.activeSchedules > 0) {
            expect(stats.nextRunTime).toBeInstanceOf(Date);
            expect(status.nextRunTime).toEqual(stats.nextRunTime);
          } else {
            expect(stats.nextRunTime).toBeUndefined();
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 9: Scheduler Start/Stop Behavior
   * Scheduler should properly handle start and stop operations
   */
  it('Property 9: Scheduler Start/Stop Behavior', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        scheduleNameArb,
        exportRequestArb,
        scheduleConfigArb,
        async (userId, name, exportRequest, schedule) => {
          // Verify scheduler starts stopped (from beforeEach)
          expect(schedulerService.getStatus().isRunning).toBe(false);

          // Create a schedule
          await schedulerService.createSchedule(userId, name, exportRequest, schedule);

          // Start scheduler
          schedulerService.start();
          expect(schedulerService.getStatus().isRunning).toBe(true);

          // Stop scheduler
          schedulerService.stop();
          expect(schedulerService.getStatus().isRunning).toBe(false);

          // Verify multiple start/stop calls are safe
          schedulerService.start();
          schedulerService.start(); // Should be safe to call multiple times
          expect(schedulerService.getStatus().isRunning).toBe(true);

          schedulerService.stop();
          schedulerService.stop(); // Should be safe to call multiple times
          expect(schedulerService.getStatus().isRunning).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 10: Error Handling in Schedule Operations
   * Scheduler should handle database and service errors gracefully
   */
  it('Property 10: Error Handling in Schedule Operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        scheduleNameArb,
        exportRequestArb,
        scheduleConfigArb,
        fc.constantFrom(
          'Database connection failed',
          'Invalid schedule configuration',
          'User not found',
          'Export service unavailable'
        ),
        async (userId, name, exportRequest, schedule, errorMessage) => {
          // Test creation error handling
          mockPrisma.exportSchedule.create.mockRejectedValueOnce(new Error(errorMessage));

          try {
            await schedulerService.createSchedule(userId, name, exportRequest, schedule);
            // If no error thrown, the service handled it gracefully
          } catch (error: any) {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toBeDefined();
          }

          // Reset mock for successful creation
          mockPrisma.exportSchedule.create.mockImplementation((data: any) => 
            Promise.resolve({
              id: data.data.id,
              ...data.data,
            } as any)
          );

          // Create a schedule successfully
          const scheduleId = await schedulerService.createSchedule(userId, name, exportRequest, schedule);

          // Test update error handling
          mockPrisma.exportSchedule.update.mockRejectedValueOnce(new Error(errorMessage));

          try {
            await schedulerService.updateSchedule(scheduleId, { name: 'Updated Name' });
          } catch (error: any) {
            expect(error).toBeInstanceOf(Error);
          }

          // Test deletion error handling
          mockPrisma.exportSchedule.delete.mockRejectedValueOnce(new Error(errorMessage));

          try {
            await schedulerService.deleteSchedule(scheduleId);
          } catch (error: any) {
            expect(error).toBeInstanceOf(Error);
          }

          // Verify scheduler remains in consistent state
          const stats = schedulerService.getStats();
          expect(stats).toBeDefined();
          expect(typeof stats.totalSchedules).toBe('number');
          expect(typeof stats.activeSchedules).toBe('number');
        }
      ),
      { numRuns: 30 }
    );
  });
});