import { TransactionType, TransactionStatus } from "@prisma/client";

// Enhanced Transaction Interfaces
export interface TransactionFilters {
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
  types?: TransactionType[];
  statuses?: TransactionStatus[];
  amountRange?: {
    min: number;
    max: number;
  };
  categories?: string[];
  searchQuery?: string;
}

export interface FilteredResult {
  transactions: EnhancedTransaction[];
  totalCount: number;
  appliedFilters: TransactionFilters;
  executionTime: number;
}

export interface TransactionCategory {
  id: string;
  userId: string;
  name: string;
  color: string;
  icon?: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCategoryRequest {
  name: string;
  color?: string;
  icon?: string;
}

export interface CategorySuggestion {
  category: TransactionCategory;
  confidence: number;
  reason: string;
}

export interface FilterPreset {
  id: string;
  userId: string;
  name: string;
  filters: TransactionFilters;
  isDefault: boolean;
  lastUsed: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnhancedTransaction {
  id: string;
  fromUserId?: string;
  toUserId?: string;
  amount: number;
  fee: number;
  type: TransactionType;
  status: TransactionStatus;
  reference: string;
  description?: string;
  metadata?: any;
  receiptUrl?: string;
  categoryId?: string;
  tags: string[];
  notes?: string;
  receiptStatus: 'NONE' | 'GENERATING' | 'AVAILABLE' | 'FAILED';
  searchableText?: string;
  createdAt: Date;
  updatedAt: Date;
  // Relations
  fromUser?: {
    id: string;
    name: string;
    phone: string;
  };
  toUser?: {
    id: string;
    name: string;
    phone: string;
  };
  category?: TransactionCategory;
}

export interface SearchResult {
  transactions: EnhancedTransaction[];
  highlights: Record<string, string[]>;
  totalMatches: number;
  searchTime: number;
}

export interface ExportRequest {
  format: 'CSV' | 'PDF';
  filters?: TransactionFilters;
  includeAnalytics?: boolean;
  emailDelivery?: boolean;
}

export interface ExportResult {
  exportId: string;
  downloadUrl?: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  fileSize?: number;
  recordCount: number;
}

export interface SpendingTrends {
  monthlyTrends: MonthlyTrend[];
  averagesByType: Record<TransactionType, number>;
  topRecipients: RecipientStats[];
  unusualPatterns: UnusualPattern[];
}

export interface MonthlyTrend {
  month: string;
  totalSpent: number;
  totalReceived: number;
  transactionCount: number;
  averageAmount: number;
}

export interface RecipientStats {
  userId: string;
  name: string;
  phone: string;
  totalAmount: number;
  transactionCount: number;
  lastTransaction: Date;
}

export interface UnusualPattern {
  type: 'HIGH_AMOUNT' | 'FREQUENT_TRANSACTIONS' | 'NEW_RECIPIENT' | 'TIME_ANOMALY';
  description: string;
  confidence: number;
  transactions: string[]; // Transaction IDs
  detectedAt: Date;
}

export interface CategoryBreakdown {
  categories: CategoryStats[];
  uncategorized: {
    amount: number;
    count: number;
    percentage: number;
  };
  totalAmount: number;
  totalTransactions: number;
}

export interface CategoryStats {
  category: TransactionCategory;
  amount: number;
  count: number;
  percentage: number;
  trend: 'UP' | 'DOWN' | 'STABLE';
}

export interface TransactionInsights {
  totalSpending: number;
  totalReceived: number;
  netFlow: number;
  averageTransaction: number;
  mostActiveDay: string;
  largestTransaction: EnhancedTransaction;
  spendingVelocity: number; // Transactions per day
  topCategory?: CategoryStats;
}

export interface PeriodComparison {
  period1: {
    startDate: Date;
    endDate: Date;
    totalSpent: number;
    totalReceived: number;
    transactionCount: number;
  };
  period2: {
    startDate: Date;
    endDate: Date;
    totalSpent: number;
    totalReceived: number;
    transactionCount: number;
  };
  changes: {
    spentChange: number;
    spentChangePercent: number;
    receivedChange: number;
    receivedChangePercent: number;
    countChange: number;
    countChangePercent: number;
  };
}

export interface BulkResult {
  successCount: number;
  failureCount: number;
  errors: string[];
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface ExportJob {
  id: string;
  userId: string;
  format: 'CSV' | 'PDF';
  filters?: TransactionFilters;
  includeAnalytics: boolean;
  emailDelivery: boolean;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  fileName?: string;
  filePath?: string;
  downloadUrl?: string;
  fileSize?: number;
  recordCount: number;
  errorMessage?: string;
  emailedAt?: Date;
  createdAt: Date;
  completedAt?: Date;
}

// Pagination Interfaces
export interface PaginationOptions {
  page: number;
  pageSize: number;
  sortBy?: 'createdAt' | 'amount' | 'type' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationMetadata {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startIndex: number;
  endIndex: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMetadata;
  executionTime: number;
  fromCache: boolean;
}

export interface InfiniteScrollOptions {
  cursor?: string;
  limit: number;
  direction?: 'forward' | 'backward';
}

export interface InfiniteScrollResult<T> {
  data: T[];
  hasMore: boolean;
  nextCursor?: string;
  previousCursor?: string;
  totalCount: number;
  executionTime: number;
  fromCache: boolean;
}

export interface CacheConfig {
  ttl: number; // Time to live in seconds
  maxSize: number; // Maximum number of entries
  keyPrefix: string;
}

export interface PerformanceMetrics {
  queryTime: number;
  cacheHitRate: number;
  totalRequests: number;
  averageResponseTime: number;
}