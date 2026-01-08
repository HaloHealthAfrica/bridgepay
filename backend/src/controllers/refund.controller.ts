import type { Request, Response } from "express";
import {
  processRefund,
  getRefundHistory,
  canRefundTransaction,
} from "../services/refund.service";
import { AppError } from "../middleware/errorHandler";

/**
 * Process a refund request
 *
 * POST /api/wallet/refund
 * Requires: Idempotency-Key header
 *
 * Body:
 * - transactionId: string (required)
 * - amount: number (optional - defaults to full amount)
 * - reason: string (required)
 */
export async function createRefund(req: Request, res: Response) {
  const { transactionId, amount, reason } = req.body;
  const userId = req.user!.userId;
  const initiatedBy = req.user!.userId; // Could be admin in future

  // Validate inputs
  if (!transactionId) {
    throw new AppError("Transaction ID is required", 400);
  }

  if (!reason || reason.trim().length < 3) {
    throw new AppError(
      "Refund reason is required (minimum 3 characters)",
      400
    );
  }

  if (amount !== undefined && amount <= 0) {
    throw new AppError("Amount must be positive", 400);
  }

  try {
    // Check if refundable first
    const check = await canRefundTransaction(transactionId);
    if (!check.canRefund) {
      throw new AppError(check.reason || "Transaction cannot be refunded", 400);
    }

    // Process refund
    const result = await processRefund({
      userId,
      transactionId,
      amount,
      reason: reason.trim(),
      initiatedBy,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Refund error:", error);
    throw new AppError(error.message || "Failed to process refund", 400);
  }
}

/**
 * Get refund history for the authenticated user
 *
 * GET /api/wallet/refunds
 * Query params:
 * - limit: number (default 20)
 * - offset: number (default 0)
 */
export async function getRefunds(req: Request, res: Response) {
  const userId = req.user!.userId;

  try {
    const refunds = await getRefundHistory(userId);

    res.status(200).json({
      success: true,
      data: {
        refunds,
        count: refunds.length,
      },
    });
  } catch (error: any) {
    console.error("Get refunds error:", error);
    throw new AppError("Failed to fetch refund history", 500);
  }
}

/**
 * Check if a transaction can be refunded
 *
 * GET /api/wallet/refund/check/:transactionId
 */
export async function checkRefundEligibility(req: Request, res: Response) {
  const { transactionId } = req.params;

  if (!transactionId) {
    throw new AppError("Transaction ID is required", 400);
  }

  try {
    const check = await canRefundTransaction(transactionId);

    res.status(200).json({
      success: true,
      data: check,
    });
  } catch (error: any) {
    console.error("Refund eligibility check error:", error);
    throw new AppError("Failed to check refund eligibility", 500);
  }
}
