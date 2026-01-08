import { prisma } from "../lib/prisma";
import { Prisma } from "@prisma/client";
import crypto from "crypto";

export interface RefundRequest {
  userId: string;
  transactionId: string;
  amount?: number; // Optional: for partial refunds
  reason: string;
  initiatedBy: string; // userId of person initiating refund (admin/system/user)
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  amount: number;
  originalTransactionId: string;
  message: string;
}

/**
 * Process a refund for a completed transaction
 *
 * Refunds credit the wallet balance (not back to original payment method)
 * This simplifies implementation and gives users flexibility to withdraw via their preferred method
 *
 * @param request - Refund request details
 * @returns Refund result with transaction ID
 */
export async function processRefund(
  request: RefundRequest
): Promise<RefundResult> {
  const { userId, transactionId, amount, reason, initiatedBy } = request;

  return await prisma.$transaction(
    async (tx) => {
      // 1. Fetch original transaction
      const originalTx = await tx.transaction.findUnique({
        where: { id: transactionId },
        include: {
          fromUser: { select: { id: true, name: true, email: true } },
          toUser: { select: { id: true, name: true, email: true } },
        },
      });

      if (!originalTx) {
        throw new Error("Original transaction not found");
      }

      // 2. Verify transaction belongs to user (or user is involved)
      if (originalTx.fromUserId !== userId && originalTx.toUserId !== userId) {
        throw new Error("Transaction does not belong to user");
      }

      // 3. Verify transaction is refundable
      const refundableTypes: string[] = [
        "DEPOSIT",
        "PAYMENT",
        "TRANSFER",
        "WITHDRAWAL", // Failed withdrawals can be refunded
      ];

      if (!refundableTypes.includes(originalTx.type)) {
        throw new Error(
          `Transaction type ${originalTx.type} is not refundable`
        );
      }

      if (originalTx.status !== "SUCCESS" && originalTx.status !== "FAILED") {
        throw new Error(
          "Only completed or failed transactions can be refunded"
        );
      }

      // 4. Check if already refunded
      const existingRefund = await tx.transaction.findFirst({
        where: {
          type: "REFUND",
          metadata: {
            path: ["originalTransactionId"],
            equals: transactionId,
          },
        },
      });

      if (existingRefund) {
        throw new Error("Transaction has already been refunded");
      }

      // 5. Calculate refund amount
      const refundAmount = amount
        ? new Prisma.Decimal(amount)
        : originalTx.amount;

      if (refundAmount.greaterThan(originalTx.amount)) {
        throw new Error("Refund amount exceeds original transaction amount");
      }

      if (refundAmount.lessThanOrEqualTo(0)) {
        throw new Error("Refund amount must be positive");
      }

      // 6. Determine who gets the refund
      let recipientUserId: string;

      if (originalTx.type === "DEPOSIT" || originalTx.type === "PAYMENT") {
        // Refund to the person who paid (fromUser)
        recipientUserId = originalTx.fromUserId!;
      } else if (originalTx.type === "WITHDRAWAL") {
        // Failed withdrawal - refund to the person who tried to withdraw
        recipientUserId = originalTx.fromUserId!;
      } else if (originalTx.type === "TRANSFER") {
        // Transfer refund goes back to sender
        recipientUserId = originalTx.fromUserId!;
      } else {
        throw new Error(`Cannot determine refund recipient for type: ${originalTx.type}`);
      }

      // 7. Get user wallet
      const wallet = await tx.wallet.findUnique({
        where: { userId: recipientUserId },
      });

      if (!wallet) {
        throw new Error("Recipient wallet not found");
      }

      // 8. Credit wallet balance
      await tx.wallet.update({
        where: { userId: recipientUserId },
        data: {
          balance: { increment: refundAmount },
        },
      });

      // 9. Create refund transaction record
      const refundReference = crypto.randomUUID();

      const refundTx = await tx.transaction.create({
        data: {
          toUserId: recipientUserId,
          fromUserId: null, // System refund
          amount: refundAmount,
          fee: new Prisma.Decimal(0),
          type: "REFUND",
          status: "SUCCESS",
          reference: refundReference,
          description: `Refund: ${reason}`,
          metadata: {
            originalTransactionId: transactionId,
            originalReference: originalTx.reference,
            originalType: originalTx.type,
            refundReason: reason,
            initiatedBy,
            refundDate: new Date().toISOString(),
            partialRefund: amount !== undefined,
          },
        },
      });

      // 10. Send notification
      await tx.notification.create({
        data: {
          userId: recipientUserId,
          type: "PAYMENT",
          title: "Refund Processed",
          message: `You received a refund of KES ${Number(refundAmount)} to your wallet`,
          actionUrl: "/wallet",
          metadata: {
            transactionId: refundTx.id,
            refundReason: reason,
            originalTransactionId: transactionId,
          },
        },
      });

      // 11. Log audit trail (if audit log exists)
      try {
        await tx.$executeRaw`
          INSERT INTO "AuditLog" ("id", "userId", "action", "entityType", "entityId", "metadata", "createdAt")
          VALUES (
            ${crypto.randomUUID()},
            ${initiatedBy},
            'REFUND_PROCESSED',
            'TRANSACTION',
            ${transactionId},
            ${JSON.stringify({
              refundId: refundTx.id,
              amount: Number(refundAmount),
              reason,
            })}::jsonb,
            NOW()
          )
        `;
      } catch (auditError) {
        // Audit log table may not exist yet - ignore error
        console.warn("Could not create audit log:", auditError);
      }

      return {
        success: true,
        refundId: refundTx.id,
        amount: Number(refundAmount),
        originalTransactionId: transactionId,
        message: "Refund processed successfully",
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10000,
    }
  );
}

/**
 * Get refund history for a user
 *
 * @param userId - User ID to get refunds for
 * @returns Array of refund transactions
 */
export async function getRefundHistory(userId: string) {
  return await prisma.transaction.findMany({
    where: {
      toUserId: userId,
      type: "REFUND",
    },
    orderBy: { createdAt: "desc" },
    include: {
      toUser: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
    },
  });
}

/**
 * Check if a transaction can be refunded
 *
 * @param transactionId - Transaction ID to check
 * @returns Object with canRefund boolean and reason if not refundable
 */
export async function canRefundTransaction(transactionId: string): Promise<{
  canRefund: boolean;
  reason?: string;
}> {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction) {
    return { canRefund: false, reason: "Transaction not found" };
  }

  const refundableTypes = ["DEPOSIT", "PAYMENT", "TRANSFER", "WITHDRAWAL"];

  if (!refundableTypes.includes(transaction.type)) {
    return {
      canRefund: false,
      reason: `Transaction type ${transaction.type} is not refundable`,
    };
  }

  if (transaction.status !== "SUCCESS" && transaction.status !== "FAILED") {
    return {
      canRefund: false,
      reason: "Only completed or failed transactions can be refunded",
    };
  }

  // Check if already refunded
  const existingRefund = await prisma.transaction.findFirst({
    where: {
      type: "REFUND",
      metadata: {
        path: ["originalTransactionId"],
        equals: transactionId,
      },
    },
  });

  if (existingRefund) {
    return { canRefund: false, reason: "Transaction already refunded" };
  }

  return { canRefund: true };
}
