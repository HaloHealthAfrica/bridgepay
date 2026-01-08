import { PerformanceMetrics } from '../types/transaction';

interface PerformanceEntry {
  operation: string;
  duration: number;
  timestamp: number;
  userId?: string;
  metadata?: Record<string, any>;
}

interface OperationStats {
  count: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  p95Duration: number;
  p99Duration: number;
}

export class PerformanceMonitorService {
  private entries: PerformanceEntry[] = [];
  private readonly maxEntries = 10000; // Keep last 10k entries
  private readonly alertThresholds = {
    pagination: 2000, // 2 seconds
    search: 1000, // 1 second
    export: 30000, // 30 seconds
    analytics: 5000, // 5 seconds
  };

  /**
   * Record a performance measurement
   */
  recordOperation(
    operation: string,
    duration: number,
    userId?: string,
    metadata?: Record<string, any>
  ): void {
    const entry: PerformanceEntry = {
      operation,
      duration,
      timestamp: Date.now(),
      userId,
      metadata,
    };

    this.entries.push(entry);

    // Keep only the most recent entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Check for performance alerts
    this.checkPerformanceAlert(operation, duration);
  }

  /**
   * Measure and record an async operation
   */
  async measureAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    userId?: string,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      this.recordOperation(operation, duration, userId, metadata);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordOperation(operation, duration, userId, { 
        ...metadata, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Measure and record a sync operation
   */
  measureSync<T>(
    operation: string,
    fn: () => T,
    userId?: string,
    metadata?: Record<string, any>
  ): T {
    const startTime = Date.now();
    
    try {
      const result = fn();
      const duration = Date.now() - startTime;
      this.recordOperation(operation, duration, userId, metadata);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordOperation(operation, duration, userId, { 
        ...metadata, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  /**
   * Get performance statistics for an operation
   */
  getOperationStats(operation: string, timeWindowMs?: number): OperationStats {
    const cutoffTime = timeWindowMs ? Date.now() - timeWindowMs : 0;
    
    const relevantEntries = this.entries.filter(entry => 
      entry.operation === operation && entry.timestamp >= cutoffTime
    );

    if (relevantEntries.length === 0) {
      return {
        count: 0,
        totalDuration: 0,
        averageDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        p95Duration: 0,
        p99Duration: 0,
      };
    }

    const durations = relevantEntries.map(entry => entry.duration).sort((a, b) => a - b);
    const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);

    return {
      count: relevantEntries.length,
      totalDuration,
      averageDuration: totalDuration / relevantEntries.length,
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      p95Duration: this.calculatePercentile(durations, 95),
      p99Duration: this.calculatePercentile(durations, 99),
    };
  }

  /**
   * Get overall performance metrics
   */
  getOverallMetrics(timeWindowMs?: number): PerformanceMetrics {
    const cutoffTime = timeWindowMs ? Date.now() - timeWindowMs : 0;
    
    const relevantEntries = this.entries.filter(entry => 
      entry.timestamp >= cutoffTime
    );

    if (relevantEntries.length === 0) {
      return {
        queryTime: 0,
        cacheHitRate: 0,
        totalRequests: 0,
        averageResponseTime: 0,
      };
    }

    const totalDuration = relevantEntries.reduce((sum, entry) => sum + entry.duration, 0);
    const averageResponseTime = totalDuration / relevantEntries.length;

    // Calculate cache hit rate from cache-related operations
    const cacheOperations = relevantEntries.filter(entry => 
      entry.metadata?.fromCache !== undefined
    );
    const cacheHits = cacheOperations.filter(entry => entry.metadata?.fromCache === true);
    const cacheHitRate = cacheOperations.length > 0 ? cacheHits.length / cacheOperations.length : 0;

    return {
      queryTime: averageResponseTime,
      cacheHitRate,
      totalRequests: relevantEntries.length,
      averageResponseTime,
    };
  }

  /**
   * Get slow operations above threshold
   */
  getSlowOperations(thresholdMs: number, timeWindowMs?: number): PerformanceEntry[] {
    const cutoffTime = timeWindowMs ? Date.now() - timeWindowMs : 0;
    
    return this.entries.filter(entry => 
      entry.duration > thresholdMs && entry.timestamp >= cutoffTime
    ).sort((a, b) => b.duration - a.duration);
  }

  /**
   * Get operations by user
   */
  getUserOperations(userId: string, timeWindowMs?: number): PerformanceEntry[] {
    const cutoffTime = timeWindowMs ? Date.now() - timeWindowMs : 0;
    
    return this.entries.filter(entry => 
      entry.userId === userId && entry.timestamp >= cutoffTime
    ).sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get operation trends over time
   */
  getOperationTrends(operation: string, intervalMs: number = 3600000): Array<{
    timestamp: number;
    count: number;
    averageDuration: number;
  }> {
    const operationEntries = this.entries.filter(entry => entry.operation === operation);
    
    if (operationEntries.length === 0) {
      return [];
    }

    // Group entries by time intervals
    const intervals = new Map<number, PerformanceEntry[]>();
    
    operationEntries.forEach(entry => {
      const intervalStart = Math.floor(entry.timestamp / intervalMs) * intervalMs;
      if (!intervals.has(intervalStart)) {
        intervals.set(intervalStart, []);
      }
      intervals.get(intervalStart)!.push(entry);
    });

    // Calculate statistics for each interval
    return Array.from(intervals.entries())
      .map(([timestamp, entries]) => ({
        timestamp,
        count: entries.length,
        averageDuration: entries.reduce((sum, entry) => sum + entry.duration, 0) / entries.length,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Clear old performance data
   */
  clearOldData(olderThanMs: number): number {
    const cutoffTime = Date.now() - olderThanMs;
    const initialLength = this.entries.length;
    
    this.entries = this.entries.filter(entry => entry.timestamp >= cutoffTime);
    
    return initialLength - this.entries.length;
  }

  /**
   * Export performance data for analysis
   */
  exportData(timeWindowMs?: number): PerformanceEntry[] {
    const cutoffTime = timeWindowMs ? Date.now() - timeWindowMs : 0;
    
    return this.entries
      .filter(entry => entry.timestamp >= cutoffTime)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get performance summary report
   */
  getPerformanceReport(timeWindowMs: number = 3600000): {
    summary: PerformanceMetrics;
    operationStats: Record<string, OperationStats>;
    slowOperations: PerformanceEntry[];
    alerts: string[];
  } {
    const summary = this.getOverallMetrics(timeWindowMs);
    
    // Get stats for each operation type
    const operations = [...new Set(this.entries.map(entry => entry.operation))];
    const operationStats: Record<string, OperationStats> = {};
    
    operations.forEach(operation => {
      operationStats[operation] = this.getOperationStats(operation, timeWindowMs);
    });

    // Get slow operations
    const slowOperations = this.getSlowOperations(1000, timeWindowMs); // Operations > 1 second

    // Generate alerts
    const alerts: string[] = [];
    Object.entries(operationStats).forEach(([operation, stats]) => {
      const threshold = this.alertThresholds[operation as keyof typeof this.alertThresholds] || 2000;
      if (stats.averageDuration > threshold) {
        alerts.push(`${operation} average duration (${stats.averageDuration}ms) exceeds threshold (${threshold}ms)`);
      }
      if (stats.p95Duration > threshold * 2) {
        alerts.push(`${operation} P95 duration (${stats.p95Duration}ms) is concerning`);
      }
    });

    return {
      summary,
      operationStats,
      slowOperations: slowOperations.slice(0, 10), // Top 10 slowest
      alerts,
    };
  }

  /**
   * Calculate percentile from sorted array
   */
  private calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  /**
   * Check if operation duration exceeds alert threshold
   */
  private checkPerformanceAlert(operation: string, duration: number): void {
    const threshold = this.alertThresholds[operation as keyof typeof this.alertThresholds];
    
    if (threshold && duration > threshold) {
      console.warn(`Performance Alert: ${operation} took ${duration}ms (threshold: ${threshold}ms)`);
    }
  }
}

export const performanceMonitorService = new PerformanceMonitorService();