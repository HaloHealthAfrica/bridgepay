import { createHash } from 'crypto';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
}

interface CacheStats {
  hitRate: number;
  totalRequests: number;
  cacheSize: number;
  memoryUsage: number;
  averageAccessTime: number;
}

export class TransactionCacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    totalAccessTime: 0,
  };
  private readonly maxCacheSize = 1000; // Maximum number of entries
  private readonly defaultTTL = 300; // 5 minutes in seconds
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Start cleanup interval to remove expired entries
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Run cleanup every minute
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry has expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;
    this.stats.totalAccessTime += Date.now() - startTime;

    return entry.data;
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds || this.defaultTTL;
    const now = Date.now();
    
    // Check if we need to evict entries
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLeastRecentlyUsed();
    }

    const entry: CacheEntry<T> = {
      data: value,
      expiresAt: now + (ttl * 1000),
      createdAt: now,
      accessCount: 0,
      lastAccessed: now,
    };

    this.cache.set(key, entry);
    this.stats.sets++;
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
    }
    return deleted;
  }

  /**
   * Check if key exists in cache
   */
  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.resetStats();
  }

  /**
   * Clear cache entries by pattern
   */
  async clearByPattern(pattern: string): Promise<number> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    let deletedCount = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deletedCount++;
      }
    }

    this.stats.deletes += deletedCount;
    return deletedCount;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    const averageAccessTime = this.stats.hits > 0 ? this.stats.totalAccessTime / this.stats.hits : 0;

    return {
      hitRate,
      totalRequests,
      cacheSize: this.cache.size,
      memoryUsage: this.calculateMemoryUsage(),
      averageAccessTime,
    };
  }

  /**
   * Get cache entry details
   */
  async getCacheInfo(key: string): Promise<{
    exists: boolean;
    expiresAt?: number;
    createdAt?: number;
    accessCount?: number;
    lastAccessed?: number;
    ttlRemaining?: number;
  }> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return { exists: false };
    }

    const now = Date.now();
    const ttlRemaining = Math.max(0, entry.expiresAt - now);

    return {
      exists: true,
      expiresAt: entry.expiresAt,
      createdAt: entry.createdAt,
      accessCount: entry.accessCount,
      lastAccessed: entry.lastAccessed,
      ttlRemaining,
    };
  }

  /**
   * Warm up cache with frequently accessed data
   */
  async warmUp(userId: string): Promise<void> {
    // This could be implemented to pre-load common queries
    // For now, it's a placeholder for future optimization
    console.log(`Warming up cache for user ${userId}`);
  }

  /**
   * Get cache keys by pattern
   */
  async getKeysByPattern(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const matchingKeys: string[] = [];

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        matchingKeys.push(key);
      }
    }

    return matchingKeys;
  }

  /**
   * Set multiple values at once
   */
  async setMultiple<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.ttl);
    }
  }

  /**
   * Get multiple values at once
   */
  async getMultiple<T>(keys: string[]): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();
    
    for (const key of keys) {
      const value = await this.get<T>(key);
      results.set(key, value);
    }

    return results;
  }

  /**
   * Increment a numeric value in cache
   */
  async increment(key: string, delta: number = 1, ttl?: number): Promise<number> {
    const currentValue = await this.get<number>(key) || 0;
    const newValue = currentValue + delta;
    await this.set(key, newValue, ttl);
    return newValue;
  }

  /**
   * Set value only if key doesn't exist
   */
  async setIfNotExists<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    if (await this.has(key)) {
      return false;
    }
    
    await this.set(key, value, ttl);
    return true;
  }

  /**
   * Extend TTL of existing cache entry
   */
  async extendTTL(key: string, additionalSeconds: number): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    entry.expiresAt += additionalSeconds * 1000;
    return true;
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(`Cache cleanup: removed ${expiredCount} expired entries`);
    }
  }

  /**
   * Evict least recently used entries when cache is full
   */
  private evictLeastRecentlyUsed(): void {
    if (this.cache.size === 0) {
      return;
    }

    // Find the entry with the oldest lastAccessed time
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.log(`Cache eviction: removed LRU entry ${oldestKey}`);
    }
  }

  /**
   * Calculate approximate memory usage
   */
  private calculateMemoryUsage(): number {
    let totalSize = 0;

    for (const [key, entry] of this.cache.entries()) {
      // Rough estimation of memory usage
      totalSize += key.length * 2; // String characters are 2 bytes each
      totalSize += JSON.stringify(entry.data).length * 2;
      totalSize += 64; // Overhead for entry metadata
    }

    return totalSize;
  }

  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      totalAccessTime: 0,
    };
  }

  /**
   * Generate cache key hash for consistent key generation
   */
  generateKeyHash(data: any): string {
    const hash = createHash('md5');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }

  /**
   * Shutdown cache service
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }
}

export const transactionCacheService = new TransactionCacheService();