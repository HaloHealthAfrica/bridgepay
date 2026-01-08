import { Request, Response } from 'express';
import { z } from 'zod';
import { transactionFilterService } from '../services/transactionFilter.service';
import { transactionSearchService } from '../services/transactionSearch.service';
import { transactionCategoryService } from '../services/transactionCategory.service';
import { transactionAnalyticsService } from '../services/transactionAnalytics.service';
import { transactionExportService } from '../services/transactionExport.service';
import { transactionReceiptService } from '../services/transactionReceipt.service';
import { AppError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';

// Extend Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
        sessionId?: string;
      };
    }
  }
}

// Validation schemas
const transactionFiltersSchema = z.object({
  dateRange: z.object({
    startDate: z.date().optional(),
    endDate: z.date().optional(),
  }).optional(),
  types: z.array(z.enum(['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'PAYMENT'])).optional(),
  statuses: z.array(z.enum(['SUCCESS', 'PENDING', 'FAILED'])).optional(),
  amountRange: z.object({
    min: z.number().min(0).optional(),
    max: z.number().min(0).optional(),
  }).optional(),
  categories: z.array(z.string()).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

const searchQuerySchema = z.object({
  query: z.string().min(1).max(255),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  highlight: z.boolean().default(true),
});

const categoryAssignmentSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1).max(100),
  categoryId: z.string().uuid(),
});

const bulkCategoryAssignmentSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1).max(1000),
  categoryId: z.string().uuid(),
});

// Analytics validation schemas
const analyticsDateRangeSchema = z.object({
  startDate: z.string().datetime().transform(str => new Date(str)),
  endDate: z.string().datetime().transform(str => new Date(str)),
}).refine(data => data.startDate < data.endDate, {
  message: "Start date must be before end date",
});

const comparePeriodSchema = z.object({
  period1Start: z.string().datetime().transform(str => new Date(str)),
  period1End: z.string().datetime().transform(str => new Date(str)),
  period2Start: z.string().datetime().transform(str => new Date(str)),
  period2End: z.string().datetime().transform(str => new Date(str)),
}).refine(data => 
  data.period1Start < data.period1End && 
  data.period2Start < data.period2End, {
  message: "Start dates must be before end dates for both periods",
});

// Export validation schemas
const exportRequestSchema = z.object({
  format: z.enum(['CSV', 'PDF']),
  filters: transactionFiltersSchema.optional(),
  includeAnalytics: z.boolean().default(false),
  emailDelivery: z.boolean().default(false),
});

const emailExportSchema = z.object({
  email: z.string().email(),
});

const exportHistorySchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
});

// Receipt validation schemas
const receiptGenerationSchema = z.object({
  format: z.enum(['PDF', 'HTML']).default('PDF'),
  includeQRCode: z.boolean().default(true),
  includeLogo: z.boolean().default(true),
  customMessage: z.string().max(500).optional(),
});

const bulkReceiptSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1).max(100),
  format: z.enum(['PDF', 'HTML']).default('PDF'),
  includeQRCode: z.boolean().default(true),
  includeLogo: z.boolean().default(true),
  emailDelivery: z.boolean().default(false),
});

const receiptSharingSchema = z.object({
  method: z.enum(['EMAIL', 'LINK', 'SMS']),
  recipient: z.string().min(1),
  message: z.string().max(500).optional(),
  expiresIn: z.number().int().min(1).max(168).default(24), // 1-168 hours (7 days)
});

const emailExportSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const exportHistorySchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
});

// Receipt validation schemas
const receiptGenerationSchema = z.object({
  format: z.enum(['PDF', 'HTML']).default('PDF'),
  includeQRCode: z.boolean().default(true),
  includeLogo: z.boolean().default(true),
  customMessage: z.string().max(500).optional(),
});

const bulkReceiptSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1).max(100),
  format: z.enum(['PDF', 'HTML']).default('PDF'),
  includeQRCode: z.boolean().default(true),
  includeLogo: z.boolean().default(true),
  emailDelivery: z.boolean().default(false),
});

const receiptSharingSchema = z.object({
  method: z.enum(['EMAIL', 'LINK', 'SMS']),
  recipient: z.string().min(1).max(255),
  message: z.string().max(500).optional(),
  expiresIn: z.number().int().min(1).max(168).default(24), // hours
});

/**
 * GET /api/transactions
 * Enhanced transaction listing with advanced filtering
 */
export const getTransactions = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    
    // Parse query parameters manually to handle nested objects
    const query = req.query;
    
    // Build filters object from query parameters
    const filters: any = {};
    
    // Handle date range
    if (query['dateRange[startDate]'] || query['dateRange[endDate]']) {
      filters.dateRange = {};
      if (query['dateRange[startDate]']) {
        filters.dateRange.startDate = new Date(query['dateRange[startDate]'] as string);
      }
      if (query['dateRange[endDate]']) {
        filters.dateRange.endDate = new Date(query['dateRange[endDate]'] as string);
      }
    }
    
    // Handle amount range
    if (query['amountRange[min]'] || query['amountRange[max]']) {
      filters.amountRange = {};
      if (query['amountRange[min]']) {
        filters.amountRange.min = parseFloat(query['amountRange[min]'] as string);
      }
      if (query['amountRange[max]']) {
        filters.amountRange.max = parseFloat(query['amountRange[max]'] as string);
      }
    }
    
    // Handle arrays
    if (query.types) {
      filters.types = Array.isArray(query.types) ? query.types : [query.types];
    }
    if (query.statuses) {
      filters.statuses = Array.isArray(query.statuses) ? query.statuses : [query.statuses];
    }
    if (query.categories) {
      filters.categories = Array.isArray(query.categories) ? query.categories : [query.categories];
    }
    
    // Handle pagination
    filters.page = query.page ? parseInt(query.page as string) : 1;
    filters.limit = query.limit ? parseInt(query.limit as string) : 20;

    // Validate the parsed filters
    const validatedFilters = transactionFiltersSchema.parse(filters);

    // Apply filters and get transactions
    const result = await transactionFilterService.applyFilters(userId, validatedFilters);

    res.json({
      success: true,
      data: {
        transactions: result.transactions,
        totalCount: result.totalCount,
        filters: result.appliedFilters,
        executionTime: result.executionTime,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError('Invalid filter parameters', 400);
    }
    throw error;
  }
};

/**
 * GET /api/transactions/search
 * Search transactions with highlighting
 */
export const searchTransactions = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const searchParams = searchQuerySchema.parse(req.query);

    const result = await transactionSearchService.searchTransactions(
      userId,
      searchParams.query
    );

    res.json({
      success: true,
      data: {
        transactions: result.transactions,
        query: searchParams.query,
        totalMatches: result.totalMatches,
        searchTime: result.searchTime,
        highlights: result.highlights,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError('Invalid search parameters', 400);
    }
    throw error;
  }
};

/**
 * GET /api/transactions/search/suggestions
 * Get search suggestions based on transaction history
 */
export const getSearchSuggestions = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { query } = req.query as { query?: string };

    const suggestions = await transactionSearchService.getSearchSuggestions(
      userId,
      query || ''
    );

    res.json({
      success: true,
      data: {
        suggestions,
      },
    });
  } catch (error) {
    throw error;
  }
};

/**
 * GET /api/transactions/:id
 * Get detailed transaction information
 */
export const getTransactionDetails = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    if (!id) {
      throw new AppError('Transaction ID is required', 400);
    }

    // Get transaction with details
    const transaction = await prisma.transaction.findFirst({
      where: { 
        id,
        OR: [{ fromUserId: userId }, { toUserId: userId }]
      },
      include: {
        fromUser: { select: { id: true, name: true, phone: true } },
        toUser: { select: { id: true, name: true, phone: true } },
        category: true,
      },
    });

    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    res.json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    throw error;
  }
};

/**
 * GET /api/transactions/categories
 * Get all available transaction categories
 */
export const getCategories = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const categories = await transactionCategoryService.getCategories(userId);

    res.json({
      success: true,
      data: {
        categories,
      },
    });
  } catch (error) {
    throw error;
  }
};

/**
 * POST /api/transactions/categories
 * Create a new custom category
 */
export const createCategory = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { name, color, icon } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new AppError('Category name is required', 400);
    }

    const category = await transactionCategoryService.createCategory(userId, {
      name: name.trim(),
      color: color || '#6B7280',
      icon,
    });

    res.status(201).json({
      success: true,
      data: category,
    });
  } catch (error) {
    throw error;
  }
};

/**
 * PUT /api/transactions/categories/:id
 * Update a custom category
 */
export const updateCategory = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const { name, color, icon } = req.body;

    if (!id) {
      throw new AppError('Category ID is required', 400);
    }

    const updates: any = {};
    if (name?.trim()) updates.name = name.trim();
    if (color) updates.color = color;
    if (icon !== undefined) updates.icon = icon;

    const category = await transactionCategoryService.updateCategory(id, userId, updates);

    res.json({
      success: true,
      data: category,
    });
  } catch (error) {
    throw error;
  }
};

/**
 * DELETE /api/transactions/categories/:id
 * Delete a custom category
 */
export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    if (!id) {
      throw new AppError('Category ID is required', 400);
    }

    await transactionCategoryService.deleteCategory(id, userId);

    res.json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    throw error;
  }
};

/**
 * POST /api/transactions/assign-category
 * Assign category to transactions
 */
export const assignCategory = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { transactionIds, categoryId } = categoryAssignmentSchema.parse(req.body);

    // Assign category to each transaction
    let assignedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const transactionId of transactionIds) {
      try {
        await transactionCategoryService.assignCategory(transactionId, categoryId, userId);
        assignedCount++;
      } catch (error) {
        failedCount++;
        errors.push(`${transactionId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    res.json({
      success: true,
      data: {
        assignedCount,
        failedCount,
        errors,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError('Invalid assignment parameters', 400);
    }
    throw error;
  }
};

/**
 * POST /api/transactions/bulk-assign-category
 * Bulk assign category to multiple transactions
 */
export const bulkAssignCategory = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { transactionIds, categoryId } = bulkCategoryAssignmentSchema.parse(req.body);

    const result = await transactionCategoryService.bulkCategorize(
      transactionIds,
      categoryId,
      userId
    );

    res.json({
      success: true,
      data: {
        assignedCount: result.successCount,
        failedCount: result.failureCount,
        errors: result.errors,
        processedInBatches: Math.ceil(transactionIds.length / 100),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError('Invalid bulk assignment parameters', 400);
    }
    throw error;
  }
};

/**
 * GET /api/transactions/category-suggestions/:id
 * Get category suggestions for a transaction
 */
export const getCategorySuggestions = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    if (!id) {
      throw new AppError('Transaction ID is required', 400);
    }

    // Get transaction to extract description
    const transaction = await prisma.transaction.findFirst({
      where: { 
        id,
        OR: [{ fromUserId: userId }, { toUserId: userId }]
      },
      select: { description: true }
    });

    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    const suggestions = await transactionCategoryService.suggestCategory(
      userId,
      transaction.description || '',
      5
    );

    res.json({
      success: true,
      data: {
        suggestions,
      },
    });
  } catch (error) {
    throw error;
  }
};

/**
 * GET /api/transactions/filters/presets
 * Get saved filter presets for the user
 */
export const getFilterPresets = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const presets = await transactionFilterService.getFilterPresets(userId);

    res.json({
      success: true,
      data: {
        presets,
      },
    });
  } catch (error) {
    throw error;
  }
};

/**
 * POST /api/transactions/filters/presets
 * Save a filter preset
 */
export const saveFilterPreset = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { name, filters } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new AppError('Preset name is required', 400);
    }

    if (!filters || typeof filters !== 'object') {
      throw new AppError('Filter configuration is required', 400);
    }

    const preset = await transactionFilterService.saveFilterPreset(
      userId,
      name.trim(),
      filters
    );

    res.status(201).json({
      success: true,
      data: preset,
    });
  } catch (error) {
    throw error;
  }
};

/**
 * DELETE /api/transactions/filters/presets/:id
 * Delete a filter preset
 */
export const deleteFilterPreset = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    if (!id) {
      throw new AppError('Preset ID is required', 400);
    }

    await transactionFilterService.deleteFilterPreset(id, userId);

    res.json({
      success: true,
      message: 'Filter preset deleted successfully',
    });
  } catch (error) {
    throw error;
  }
};

/**
 * GET /api/transactions/analytics/trends
 * Get spending trends for the user
 */
export const getSpendingTrends = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { startDate, endDate } = analyticsDateRangeSchema.parse(req.query);

    const trends = await transactionAnalyticsService.getSpendingTrends(
      userId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: trends,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError('Invalid date range parameters', 400);
    }
    throw error;
  }
};

/**
 * GET /api/transactions/analytics/insights
 * Get transaction insights for the user
 */
export const getTransactionInsights = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { startDate, endDate } = analyticsDateRangeSchema.parse(req.query);

    const insights = await transactionAnalyticsService.getTransactionInsights(
      userId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: insights,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError('Invalid date range parameters', 400);
    }
    throw error;
  }
};

/**
 * GET /api/transactions/analytics/category-breakdown
 * Get category breakdown for spending analysis
 */
export const getCategoryBreakdown = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { startDate, endDate } = analyticsDateRangeSchema.parse(req.query);

    const breakdown = await transactionAnalyticsService.getCategoryBreakdown(
      userId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      data: breakdown,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError('Invalid date range parameters', 400);
    }
    throw error;
  }
};

/**
 * GET /api/transactions/analytics/compare-periods
 * Compare two time periods for analytics
 */
export const comparePeriods = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { period1Start, period1End, period2Start, period2End } = comparePeriodSchema.parse(req.query);

    const comparison = await transactionAnalyticsService.comparePeriods(
      userId,
      period1Start,
      period1End,
      period2Start,
      period2End
    );

    res.json({
      success: true,
      data: comparison,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError('Invalid period comparison parameters', 400);
    }
    throw error;
  }
};

/**
 * POST /api/transactions/export
 * Create export job
 * **Validates: Requirements 4.1-4.6**
 */
export const createExport = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const exportRequest = exportRequestSchema.parse(req.body);

    const result = await transactionExportService.exportTransactions(userId, exportRequest);

    res.status(201).json({
      success: true,
      data: {
        exportId: result.exportId,
        status: result.status,
        message: 'Export job created successfully. You will be notified when it\'s ready.',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError('Invalid export request parameters', 400);
    }
    throw error;
  }
};

/**
 * GET /api/transactions/export/:id/status
 * Get export status
 * **Validates: Requirements 4.1-4.6**
 */
export const getExportStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new AppError('Export ID is required', 400);
    }

    const status = await transactionExportService.getExportStatus(id);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    if (error.message === 'Export not found') {
      throw new AppError('Export not found', 404);
    }
    throw error;
  }
};

/**
 * GET /api/transactions/export/:id/download
 * Download export file
 * **Validates: Requirements 4.1-4.6**
 */
export const downloadExport = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { token } = req.query;

    if (!id) {
      throw new AppError('Export ID is required', 400);
    }

    if (!token || typeof token !== 'string') {
      throw new AppError('Download token is required', 400);
    }

    const fileInfo = await transactionExportService.validateDownloadAndServeFile(id, token);

    // Set appropriate headers for file download
    res.setHeader('Content-Type', fileInfo.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.fileName}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Stream the file
    const fs = require('fs');
    const fileStream = fs.createReadStream(fileInfo.filePath);
    
    fileStream.on('error', (error: any) => {
      console.error('File stream error:', error);
      if (!res.headersSent) {
        throw new AppError('Failed to download file', 500);
      }
    });

    fileStream.pipe(res);
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('Invalid download token')) {
      throw new AppError('Export not found or invalid download token', 404);
    }
    if (error.message.includes('expired')) {
      throw new AppError('Download link has expired', 410);
    }
    if (error.message.includes('not completed')) {
      throw new AppError('Export is not ready for download', 400);
    }
    throw error;
  }
};

/**
 * POST /api/transactions/export/:id/email
 * Email export to user
 * **Validates: Requirements 4.1-4.6**
 */
export const emailExport = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { email } = emailExportSchema.parse(req.body);

    if (!id) {
      throw new AppError('Export ID is required', 400);
    }

    await transactionExportService.emailExport(id, email);

    res.json({
      success: true,
      message: `Export has been emailed to ${email}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError('Invalid email address', 400);
    }
    if (error.message.includes('not found') || error.message.includes('not ready')) {
      throw new AppError('Export not found or not ready for delivery', 404);
    }
    throw error;
  }
};

/**
 * GET /api/transactions/exports
 * Get user's export history
 * **Validates: Requirements 4.1-4.6**
 */
export const getExportHistory = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { limit } = exportHistorySchema.parse(req.query);

    const exports = await transactionExportService.getUserExports(userId, limit);

    res.json({
      success: true,
      data: {
        exports,
        totalCount: exports.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError('Invalid query parameters', 400);
    }
    throw error;
  }
};

/**
 * DELETE /api/transactions/export/:id
 * Cancel export
 * **Validates: Requirements 4.1-4.6**
 */
export const cancelExport = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    if (!id) {
      throw new AppError('Export ID is required', 400);
    }

    await transactionExportService.cancelExport(id, userId);

    res.json({
      success: true,
      message: 'Export cancelled successfully',
    });
  } catch (error) {
    if (error.message === 'Export not found') {
      throw new AppError('Export not found', 404);
    }
    if (error.message === 'Export cannot be cancelled') {
      throw new AppError('Export cannot be cancelled - it may already be completed or failed', 400);
    }
    throw error;
  }
};

/**
 * POST /api/transactions/:id/receipt
 * Generate receipt for transaction
 * **Validates: Requirements 8.1-8.6 (Receipt integration)**
 */
export const generateReceipt = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const receiptRequest = receiptGenerationSchema.parse(req.body);

    if (!id) {
      throw new AppError('Transaction ID is required', 400);
    }

    // Verify user has access to this transaction
    const transaction = await prisma.transaction.findFirst({
      where: { 
        id,
        OR: [{ fromUserId: userId }, { toUserId: userId }]
      },
    });

    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    const result = await transactionReceiptService.generateReceiptForTransaction({
      transactionId: id,
      userId,
      ...receiptRequest,
    });

    res.status(201).json({
      success: true,
      data: {
        receiptId: result.receiptId,
        status: result.status,
        downloadUrl: result.downloadUrl,
        message: 'Receipt generated successfully',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError('Invalid receipt generation parameters', 400);
    }
    throw error;
  }
};

/**
 * GET /api/transactions/:id/receipt/status
 * Get receipt status
 * **Validates: Requirements 8.1-8.6 (Receipt integration)**
 */
export const getReceiptStatus = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    if (!id) {
      throw new AppError('Transaction ID is required', 400);
    }

    // Verify user has access to this transaction
    const transaction = await prisma.transaction.findFirst({
      where: { 
        id,
        OR: [{ fromUserId: userId }, { toUserId: userId }]
      },
    });

    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    const status = await transactionReceiptService.getReceiptStatus(id);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    if (error.message === 'Receipt not found') {
      throw new AppError('Receipt not found for this transaction', 404);
    }
    throw error;
  }
};

/**
 * POST /api/transactions/receipts/bulk
 * Generate bulk receipts
 * **Validates: Requirements 8.1-8.6 (Receipt integration)**
 */
export const generateBulkReceipts = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const bulkRequest = bulkReceiptSchema.parse(req.body);

    // Verify user has access to all transactions
    const transactions = await prisma.transaction.findMany({
      where: { 
        id: { in: bulkRequest.transactionIds },
        OR: [{ fromUserId: userId }, { toUserId: userId }]
      },
      select: { id: true }
    });

    if (transactions.length !== bulkRequest.transactionIds.length) {
      throw new AppError('Some transactions not found or access denied', 403);
    }

    const result = await transactionReceiptService.generateBulkReceipts({
      ...bulkRequest,
      userId,
    });

    res.status(201).json({
      success: true,
      data: {
        batchId: result.batchId,
        status: result.status,
        totalReceipts: result.totalReceipts,
        successCount: result.successCount,
        failureCount: result.failureCount,
        downloadUrl: result.downloadUrl,
        message: 'Bulk receipt generation initiated successfully',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError('Invalid bulk receipt parameters', 400);
    }
    throw error;
  }
};

/**
 * GET /api/transactions/:id/receipt/sharing
 * Get receipt sharing options
 * **Validates: Requirements 8.1-8.6 (Receipt integration)**
 */
export const getReceiptSharingOptions = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    if (!id) {
      throw new AppError('Transaction ID is required', 400);
    }

    // Verify user has access to this transaction
    const transaction = await prisma.transaction.findFirst({
      where: { 
        id,
        OR: [{ fromUserId: userId }, { toUserId: userId }]
      },
    });

    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    const sharingOptions = await transactionReceiptService.getReceiptSharingOptions(id);

    res.json({
      success: true,
      data: sharingOptions,
    });
  } catch (error) {
    if (error.message === 'Receipt not found') {
      throw new AppError('Receipt not found for this transaction', 404);
    }
    throw error;
  }
};

/**
 * POST /api/transactions/:id/receipt/share
 * Share receipt via email/link
 * **Validates: Requirements 8.1-8.6 (Receipt integration)**
 */
export const shareReceipt = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const sharingRequest = receiptSharingSchema.parse(req.body);

    if (!id) {
      throw new AppError('Transaction ID is required', 400);
    }

    // Verify user has access to this transaction
    const transaction = await prisma.transaction.findFirst({
      where: { 
        id,
        OR: [{ fromUserId: userId }, { toUserId: userId }]
      },
    });

    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    const result = await transactionReceiptService.shareReceipt({
      transactionId: id,
      userId,
      ...sharingRequest,
    });

    res.json({
      success: true,
      data: {
        shareId: result.shareId,
        method: result.method,
        recipient: result.recipient,
        shareUrl: result.shareUrl,
        expiresAt: result.expiresAt,
        message: `Receipt shared successfully via ${sharingRequest.method.toLowerCase()}`,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError('Invalid receipt sharing parameters', 400);
    }
    if (error.message === 'Receipt not found') {
      throw new AppError('Receipt not found for this transaction', 404);
    }
    throw error;
  }
};