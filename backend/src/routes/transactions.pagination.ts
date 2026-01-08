import { Router } from 'express';
import { z } from 'zod';
import { transactionPaginationService } from '../services/transactionPagination.service';
import { performanceMonitorService } from '../services/performanceMonitor.service';
import { TransactionFilters } from '../types/transaction';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Validation schemas
const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
  sortBy: z.enum(['createdAt', 'amount', 'type', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const infiniteScrollQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  direction: z.enum(['forward', 'backward']).default('forward'),
});

const filtersSchema = z.object({
  dateRange: z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  }).optional(),
  types: z.array(z.enum(['SEND', 'RECEIVE', 'DEPOSIT', 'WITHDRAWAL'])).optional(),
  statuses: z.array(z.enum(['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'])).optional(),
  amountRange: z.object({
    min: z.coerce.number().min(0),
    max: z.coerce.number().min(0),
  }).optional(),
  categories: z.array(z.string()).optional(),
  searchQuery: z.string().optional(),
}).optional();

/**
 * GET /api/transactions/paginated
 * Get paginated transactions with filtering
 */
router.get('/paginated', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    // Validate query parameters
    const paginationResult = paginationQuerySchema.safeParse(req.query);
    if (!paginationResult.success) {
      return res.status(400).json({
        error: 'Invalid pagination parameters',
        details: paginationResult.error.errors,
      });
    }

    const filtersResult = filtersSchema.safeParse(req.body);
    if (!filtersResult.success) {
      return res.status(400).json({
        error: 'Invalid filter parameters',
        details: filtersResult.error.errors,
      });
    }

    const pagination = paginationResult.data;
    const filters = filtersResult.data || {};

    // Validate pagination config
    const validation = transactionPaginationService.validatePaginationConfig(pagination);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Invalid pagination configuration',
        details: validation.errors,
      });
    }

    // Get paginated transactions with performance monitoring
    const result = await performanceMonitorService.measureAsync(
      'pagination',
      () => transactionPaginationService.getPaginatedTransactions(userId, filters, pagination),
      userId,
      { 
        page: pagination.page, 
        pageSize: pagination.pageSize,
        hasFilters: Object.keys(filters).length > 0,
      }
    );

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      performance: {
        executionTime: result.executionTime,
        fromCache: result.fromCache,
      },
    });

  } catch (error: any) {
    console.error('Pagination error:', error);
    res.status(500).json({
      error: 'Failed to get paginated transactions',
      message: error.message,
    });
  }
});

/**
 * GET /api/transactions/infinite-scroll
 * Get transactions for infinite scroll
 */
router.get('/infinite-scroll', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    // Validate query parameters
    const scrollResult = infiniteScrollQuerySchema.safeParse(req.query);
    if (!scrollResult.success) {
      return res.status(400).json({
        error: 'Invalid scroll parameters',
        details: scrollResult.error.errors,
      });
    }

    const filtersResult = filtersSchema.safeParse(req.body);
    if (!filtersResult.success) {
      return res.status(400).json({
        error: 'Invalid filter parameters',
        details: filtersResult.error.errors,
      });
    }

    const scrollConfig = scrollResult.data;
    const filters = filtersResult.data || {};

    // Get infinite scroll transactions with performance monitoring
    const result = await performanceMonitorService.measureAsync(
      'infinite-scroll',
      () => transactionPaginationService.getInfiniteScrollTransactions(userId, filters, scrollConfig),
      userId,
      { 
        cursor: scrollConfig.cursor,
        limit: scrollConfig.limit,
        direction: scrollConfig.direction,
        hasFilters: Object.keys(filters).length > 0,
      }
    );

    res.json({
      success: true,
      data: result.data,
      metadata: result.metadata,
      performance: {
        executionTime: result.executionTime,
        fromCache: result.fromCache,
      },
    });

  } catch (error: any) {
    console.error('Infinite scroll error:', error);
    res.status(500).json({
      error: 'Failed to get infinite scroll transactions',
      message: error.message,
    });
  }
});

/**
 * GET /api/transactions/page-size-options
 * Get available page size options
 */
router.get('/page-size-options', authenticateToken, async (req, res) => {
  try {
    const options = transactionPaginationService.getPageSizeOptions();
    const defaultConfig = transactionPaginationService.getDefaultPaginationConfig();

    res.json({
      success: true,
      data: {
        options,
        default: defaultConfig,
      },
    });

  } catch (error: any) {
    console.error('Page size options error:', error);
    res.status(500).json({
      error: 'Failed to get page size options',
      message: error.message,
    });
  }
});

/**
 * POST /api/transactions/clear-cache
 * Clear pagination cache for the user
 */
router.post('/clear-cache', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    await transactionPaginationService.clearUserPaginationCache(userId);

    res.json({
      success: true,
      message: 'Pagination cache cleared successfully',
    });

  } catch (error: any) {
    console.error('Clear cache error:', error);
    res.status(500).json({
      error: 'Failed to clear pagination cache',
      message: error.message,
    });
  }
});

/**
 * GET /api/transactions/cache-stats
 * Get cache performance statistics
 */
router.get('/cache-stats', authenticateToken, async (req, res) => {
  try {
    const stats = await transactionPaginationService.getCacheStats();

    res.json({
      success: true,
      data: stats,
    });

  } catch (error: any) {
    console.error('Cache stats error:', error);
    res.status(500).json({
      error: 'Failed to get cache statistics',
      message: error.message,
    });
  }
});

/**
 * GET /api/transactions/performance-report
 * Get performance monitoring report
 */
router.get('/performance-report', authenticateToken, async (req, res) => {
  try {
    const timeWindow = req.query.timeWindow ? 
      parseInt(req.query.timeWindow as string) : 
      3600000; // Default 1 hour

    const report = performanceMonitorService.getPerformanceReport(timeWindow);

    res.json({
      success: true,
      data: report,
    });

  } catch (error: any) {
    console.error('Performance report error:', error);
    res.status(500).json({
      error: 'Failed to get performance report',
      message: error.message,
    });
  }
});

/**
 * POST /api/transactions/validate-pagination
 * Validate pagination configuration
 */
router.post('/validate-pagination', authenticateToken, async (req, res) => {
  try {
    const configResult = z.object({
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      sortBy: z.enum(['createdAt', 'amount', 'type', 'status']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    }).safeParse(req.body);

    if (!configResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: configResult.error.errors,
      });
    }

    const validation = transactionPaginationService.validatePaginationConfig(configResult.data);

    res.json({
      success: true,
      data: {
        isValid: validation.isValid,
        errors: validation.errors,
      },
    });

  } catch (error: any) {
    console.error('Validate pagination error:', error);
    res.status(500).json({
      error: 'Failed to validate pagination configuration',
      message: error.message,
    });
  }
});

export default router;