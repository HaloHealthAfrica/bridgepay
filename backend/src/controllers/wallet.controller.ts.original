import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import mpesaService from "../services/mpesa.service";
import lemonadeService from "../services/lemonade.service";
import { generateReceipt } from "../services/receipt.service";

export async function getBalance(req: Request, res: Response) {
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.userId } });
  if (!wallet) throw new AppError("Wallet not found", 404);

  res.json({
    success: true,
    data: {
      balance: Number(wallet.balance),
      pendingBalance: Number(wallet.pendingBalance),
      escrowBalance: Number(wallet.escrowBalance),
      currency: wallet.currency,
    },
  });
}

export async function getTransactions(req: Request, res: Response) {
  const { page = 1, limit = 20, type, status } = req.query as any;
  const skip = (Number(page) - 1) * Number(limit);

  const where: any = { OR: [{ fromUserId: req.user!.userId }, { toUserId: req.user!.userId }] };
  if (type) where.type = type;
  if (status) where.status = status;

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
      include: {
        fromUser: { select: { id: true, name: true, phone: true } },
        toUser: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  res.json({
    success: true,
    data: {
      transactions,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    },
  });
}

export async function depositMpesa(req: Request, res: Response) {
  const { amount, phone } = req.body ?? {};
  if (!amount || Number(amount) < 1) throw new AppError("Minimum deposit is KES 1", 400);
  if (!phone) throw new AppError("Phone number required", 400);

  const reference = `MPESA-DEP-${Date.now()}`;

  const transaction = await prisma.transaction.create({
    data: {
      toUserId: req.user!.userId,
      amount: new Prisma.Decimal(amount),
      type: "DEPOSIT",
      status: "PENDING",
      reference,
      description: `M-Pesa deposit from ${phone}`,
      metadata: { phone, method: "mpesa" },
    },
  });

  try {
    const stkResponse = await mpesaService.initiateSTKPush(String(phone), Number(amount), reference);

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        metadata: {
          ...(transaction.metadata as any),
          merchantRequestID: stkResponse.MerchantRequestID,
          checkoutRequestID: stkResponse.CheckoutRequestID,
        },
      },
    });

    res.json({
      success: true,
      data: {
        transaction: {
          id: transaction.id,
          reference,
          amount: Number(transaction.amount),
          status: "PENDING",
          checkoutRequestID: stkResponse.CheckoutRequestID,
        },
        message: "Check your phone for M-Pesa prompt",
      },
    });
  } catch (error: any) {
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: "FAILED", metadata: { ...(transaction.metadata as any), error: error?.message } },
    });
    throw new AppError("M-Pesa request failed", 500);
  }
}

export async function depositCard(req: Request, res: Response) {
  const { amount } = req.body ?? {};
  if (!amount || Number(amount) < 1) throw new AppError("Minimum deposit is KES 1", 400);

  const reference = `CARD-DEP-${Date.now()}`;
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const resultUrl = `${process.env.APP_URL || process.env.BACKEND_URL || "http://localhost:3000"}/api/callback/lemonade`;
  const walletNo = process.env.LEMONADE_WALLET_NO || "";
  if (!walletNo) throw new AppError("Card payments not configured (LEMONADE_WALLET_NO missing)", 500);

  const transaction = await prisma.transaction.create({
    data: {
      toUserId: req.user!.userId,
      amount: new Prisma.Decimal(amount),
      type: "DEPOSIT",
      status: "PENDING",
      reference,
      description: "Card deposit",
      metadata: { method: "card", provider: "lemonade" },
    },
  });

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { name: true, phone: true, email: true },
    });
    if (!user) throw new AppError("User not found", 404);

    const initiated = await lemonadeService.initiateCardPayment({
      walletNo,
      reference,
      amount: Number(amount),
      currency: "KES",
      customerName: user.name,
      customerPhone: user.phone,
      description: "Bridge wallet top-up (Card)",
      resultUrl,
      email: user.email,
    });

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        metadata: {
          ...(transaction.metadata as any),
          lemonade: {
            transaction_id: initiated.transactionId,
            internal_id: initiated.internalId,
            redirect_url: initiated.redirectUrl,
          },
        },
      },
    });

    res.json({
      success: true,
      data: {
        // Keep key name `checkoutUrl` for frontend compatibility; Lemonade returns `redirect_url`.
        checkoutUrl: initiated.redirectUrl,
        providerTransactionId: initiated.transactionId,
        transaction: {
          id: transaction.id,
          reference,
          amount: Number(transaction.amount),
          status: "PENDING",
        },
      },
    });
  } catch (error: any) {
    await prisma.transaction.update({ where: { id: transaction.id }, data: { status: "FAILED" } });
    throw new AppError("Failed to create payment checkout", 500);
  }
}

export async function checkCardPaymentStatus(req: Request, res: Response) {
  const { providerTransactionId } = req.params;
  if (!providerTransactionId) throw new AppError("providerTransactionId required", 400);

  // Find our transaction that belongs to this user
  const txRow = await prisma.transaction.findFirst({
    where: {
      toUserId: req.user!.userId,
      type: "DEPOSIT",
      metadata: { path: ["lemonade", "transaction_id"], equals: providerTransactionId },
    },
  });
  if (!txRow) throw new AppError("Transaction not found", 404);

  const status = await lemonadeService.queryStatus(providerTransactionId);

  // If provider returns external_reference, reconcile by that; otherwise reconcile this tx reference.
  const ref = (status as any)?.data?.external_reference || txRow.reference;
  await lemonadeService.reconcileBridgeTransactionByReference(String(ref), status);

  const updated = await prisma.transaction.findUnique({ where: { id: txRow.id } });

  res.json({
    success: true,
    data: {
      provider: status,
      transaction: updated,
    },
  });
}

export async function transfer(req: Request, res: Response) {
  const { recipientPhone, amount, note } = req.body ?? {};
  if (!recipientPhone) throw new AppError("Recipient phone required", 400);
  if (!amount || Number(amount) < 1) throw new AppError("Minimum transfer is KES 1", 400);

  const recipient = await prisma.user.findUnique({
    where: { phone: recipientPhone },
    select: { id: true, name: true, status: true },
  });
  if (!recipient) throw new AppError("Recipient not found", 404);
  if (recipient.status !== "ACTIVE") throw new AppError("Recipient account is not active", 400);
  if (recipient.id === req.user!.userId) throw new AppError("Cannot transfer to yourself", 400);

  const senderWallet = await prisma.wallet.findUnique({ where: { userId: req.user!.userId } });
  if (!senderWallet || Number(senderWallet.balance) < Number(amount)) throw new AppError("Insufficient balance", 400);

  const sender = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { name: true } });
  const senderName = sender?.name || "Someone";

  const result = await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { userId: req.user!.userId },
      data: { balance: { decrement: new Prisma.Decimal(amount) } },
    });
    await tx.wallet.update({
      where: { userId: recipient.id },
      data: { balance: { increment: new Prisma.Decimal(amount) } },
    });

    const txRow = await tx.transaction.create({
      data: {
        fromUserId: req.user!.userId,
        toUserId: recipient.id,
        amount: new Prisma.Decimal(amount),
        type: "TRANSFER",
        status: "SUCCESS",
        reference: `TRF-${Date.now()}`,
        description: note || "Transfer",
      },
      include: { toUser: { select: { name: true, phone: true } } },
    });

    await tx.notification.create({
      data: {
        userId: recipient.id,
        type: "PAYMENT",
        title: "Money Received",
        message: `You received KES ${amount} from ${senderName}`,
        actionUrl: "/wallet",
      },
    });

    return txRow;
  });

  res.json({ success: true, data: { transaction: result } });
}

export async function withdrawMpesa(req: Request, res: Response) {
  const { amount, phone } = req.body ?? {};
  if (!amount || Number(amount) < 10) throw new AppError("Minimum withdrawal is KES 10", 400);
  if (!phone) throw new AppError("Phone number required", 400);

  const fee = Math.min(Number(amount) * 0.01, 50);
  const total = Number(amount) + fee;

  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.userId } });
  if (!wallet || Number(wallet.balance) < total) throw new AppError("Insufficient balance", 400);

  const created = await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { userId: req.user!.userId },
      data: { balance: { decrement: new Prisma.Decimal(total) } },
    });

    return tx.transaction.create({
      data: {
        fromUserId: req.user!.userId,
        amount: new Prisma.Decimal(amount),
        fee: new Prisma.Decimal(fee),
        type: "WITHDRAWAL",
        status: "PENDING",
        reference: `WD-${Date.now()}`,
        description: `Withdrawal to ${phone}`,
        metadata: { phone, method: "mpesa" },
      },
    });
  });

  try {
    const b2cResponse = await mpesaService.withdrawToMpesa(String(phone), Number(amount), "Bridge Withdrawal");

    await prisma.transaction.update({
      where: { id: created.id },
      data: {
        metadata: {
          ...(created.metadata as any),
          conversationID: b2cResponse.ConversationID,
          originatorConversationID: b2cResponse.OriginatorConversationID,
        },
      },
    });

    res.json({
      success: true,
      data: { transaction: created, message: "Withdrawal initiated. You will receive M-Pesa shortly." },
    });
  } catch (error: any) {
    await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { userId: req.user!.userId },
        data: { balance: { increment: new Prisma.Decimal(total) } },
      });

      await tx.transaction.update({
        where: { id: created.id },
        data: { status: "FAILED", metadata: { ...(created.metadata as any), error: error?.message } },
      });
    });

    throw new AppError("Withdrawal failed", 500);
  }
}

export async function checkPaymentStatus(req: Request, res: Response) {
  const { checkoutRequestID } = req.params;
  if (!checkoutRequestID) throw new AppError("checkoutRequestID required", 400);
  const status = await mpesaService.checkTransactionStatus(checkoutRequestID);
  res.json({ success: true, data: status });
}

export async function createReceipt(req: Request, res: Response) {
  const { transactionId } = req.params;
  if (!transactionId) throw new AppError("transactionId required", 400);

  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: { id: true, fromUserId: true, toUserId: true, receiptUrl: true },
  });
  if (!tx) throw new AppError("Transaction not found", 404);

  const isOwner = tx.fromUserId === req.user!.userId || tx.toUserId === req.user!.userId;
  if (!isOwner) throw new AppError("Unauthorized", 403);

  if (tx.receiptUrl) return res.json({ success: true, data: { receiptUrl: tx.receiptUrl } });

  try {
    const receiptUrl = await generateReceipt(tx.id);
    res.json({ success: true, data: { receiptUrl } });
  } catch (e: any) {
    throw new AppError(e?.message || "Failed to generate receipt", 500);
  }
}


