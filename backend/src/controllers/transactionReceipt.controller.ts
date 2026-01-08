import { Request, Response } from 'express';
import { transactionReceiptService } from '../services/transactionReceipt.service';
// Using a simple error class instead of AppError for now
class AppError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}
import { z } from 'zod';

// Validation schemas
const generateReceiptSchema = z.object({
  transactionId: z.string().uuid(),
  forceRegenerate: z.boolean().optional().default(false),
});

const bulkReceiptSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1).max(100),
  forceRegenerate: z.boolean().optional().default(false),
});

const shareReceiptSchema = z.object({
  transactionId: z.string().uuid(),
  method: z.enum(['email', 'download', 'link']),
  email: z.string().email().optional(),
});

/**
 * Generate receipt for a single transaction
 * POST /api/transactions/receipts/generate
 */
export const generateReceipt = async (req: Request, res: Response) => {
  try {
    const { transactionId, forceRegenerate } = generateReceiptSchema.parse(req.body);

    const result = await transactionReceiptService.generateReceiptForTransaction({
      transactionId,
      forceRegenerate,
    });

    if (result.status === 'FAILED') {
      throw new AppError(result.error || 'Receipt generation failed', 400);
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError('Invalid request data', 400);
    }
    throw error;
  }
};

/**
 * Generate receipts for multiple transactions
 * POST /api/transactions/receipts/bulk-generate
 */
export const generateBulkReceipts = async (req: Request, res: Response) => {
  try {
    const { transactionIds, forceRegenerate } = bulkReceiptSchema.parse(req.body);

    const result = await transactionReceiptService.generateBulkReceipts({
      transactionIds,
      forceRegenerate,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError('Invalid request data', 400);
    }
    throw error;
  }
};

/**
 * Get receipt status for a transaction
 * GET /api/transactions/:transactionId/receipt/status
 */
export const getReceiptStatus = async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;

    if (!transactionId) {
      throw new AppError('Transaction ID is required', 400);
    }

    const status = await transactionReceiptService.getReceiptStatus(transactionId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Get receipt sharing options
 * GET /api/transactions/:transactionId/receipt/sharing-options
 */
export const getReceiptSharingOptions = async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;

    if (!transactionId) {
      throw new AppError('Transaction ID is required', 400);
    }

    const options = await transactionReceiptService.getReceiptSharingOptions(transactionId);

    res.json({
      success: true,
      data: options,
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Share receipt via specified method
 * POST /api/transactions/receipts/share
 */
export const shareReceipt = async (req: Request, res: Response) => {
  try {
    const { transactionId, method, email } = shareReceiptSchema.parse(req.body);

    // Validate email is provided for email method
    if (method === 'email' && !email) {
      throw new AppError('Email address is required for email sharing', 400);
    }

    const result = await transactionReceiptService.shareReceipt({
      transactionId,
      method,
      ...(email && { email }),
    });

    if (!result.success) {
      throw new AppError(result.message, 400);
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError('Invalid request data', 400);
    }
    throw error;
  }
};

/**
 * Get cached receipt information
 * GET /api/transactions/:transactionId/receipt/cache-info
 */
export const getCachedReceiptInfo = async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;

    if (!transactionId) {
      throw new AppError('Transaction ID is required', 400);
    }

    const cacheInfo = transactionReceiptService.getCachedReceiptInfo(transactionId);

    res.json({
      success: true,
      data: cacheInfo,
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Clear receipt cache for a transaction
 * DELETE /api/transactions/:transactionId/receipt/cache
 */
export const clearReceiptCache = async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;

    if (!transactionId) {
      throw new AppError('Transaction ID is required', 400);
    }

    transactionReceiptService.clearReceiptCache(transactionId);

    res.json({
      success: true,
      message: 'Receipt cache cleared',
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Get all cached receipts (admin endpoint)
 * GET /api/transactions/receipts/cache/all
 */
export const getAllCachedReceipts = async (req: Request, res: Response) => {
  try {
    const cachedReceipts = transactionReceiptService.getAllCachedReceipts();

    res.json({
      success: true,
      data: {
        count: cachedReceipts.length,
        receipts: cachedReceipts,
      },
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Clean up expired cache entries (admin endpoint)
 * POST /api/transactions/receipts/cache/cleanup
 */
export const cleanupExpiredCache = async (req: Request, res: Response) => {
  try {
    transactionReceiptService.cleanupExpiredCache();

    res.json({
      success: true,
      message: 'Expired cache entries cleaned up',
    });
  } catch (error) {
    throw error;
  }
};