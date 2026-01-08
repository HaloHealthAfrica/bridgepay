import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import mpesaService from "../services/mpesa.service";
import lemonadeService from "../services/lemonade.service";
import wapipayService from "../services/wapipay.service";
import { generateReceipt } from "../services/receipt.service";
import feeEngine from "../services/feeEngine.service";
import platformLedger from "../services/platformLedger.service";

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

  const reference = `MPESA-DEP-${crypto.randomUUID()}`;
  const feeQuote = await feeEngine.quote({
    flow: "WALLET_DEPOSIT",
    method: "MPESA_STK",
    currency: "KES",
    amount: new Prisma.Decimal(amount),
  });

  const transaction = await prisma.transaction.create({
    data: {
      toUserId: req.user!.userId,
      amount: new Prisma.Decimal(amount),
      fee: feeQuote.fee,
      type: "DEPOSIT",
      status: "PENDING",
      reference,
      description: `M-Pesa deposit from ${phone}`,
      metadata: {
        phone,
        method: "mpesa",
        fee: { scheduleId: feeQuote.scheduleId, feePayer: feeQuote.feePayer, amount: Number(feeQuote.fee) },
      },
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

  const reference = `CARD-DEP-${crypto.randomUUID()}`;
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const resultUrl = `${process.env.APP_URL || process.env.BACKEND_URL || "http://localhost:3000"}/api/callback/lemonade`;
  const walletNo = process.env.LEMONADE_WALLET_NO || "";
  if (!walletNo) throw new AppError("Card payments not configured (LEMONADE_WALLET_NO missing)", 500);

  const transaction = await prisma.transaction.create({
    data: {
      toUserId: req.user!.userId,
      amount: new Prisma.Decimal(amount),
      fee: (
        await feeEngine.quote({
          flow: "WALLET_DEPOSIT",
          method: "CARD",
          currency: "KES",
          amount: new Prisma.Decimal(amount),
        })
      ).fee,
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

  const sender = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { name: true } });
  const senderName = sender?.name || "Someone";

  const quote = await feeEngine.quote({
    flow: "WALLET_TRANSFER",
    method: "WALLET",
    currency: "KES",
    amount: new Prisma.Decimal(amount),
  });

  const result = await prisma.$transaction(
    async (tx) => {
      // SECURITY FIX: Check balance INSIDE transaction to prevent race conditions
      const senderWallet = await tx.wallet.findUnique({ where: { userId: req.user!.userId } });
      if (!senderWallet) throw new AppError("Wallet not found", 404);

      const fee = quote.fee;
      const amt = new Prisma.Decimal(amount);
      const debited = quote.feePayer === "SENDER" ? amt.add(fee) : amt;
      const credited = quote.feePayer === "RECEIVER" ? amt.sub(fee) : amt;
      if (credited.lte(0)) throw new AppError("Fee exceeds amount", 400);

      if (senderWallet.balance.lt(debited)) throw new AppError("Insufficient balance", 400);

      // Ensure recipient wallet exists
      const recipientWallet = await tx.wallet.findUnique({
        where: { userId: recipient.id }
      });
      if (!recipientWallet) {
        throw new AppError("Recipient wallet not found", 404);
      }

      await tx.wallet.update({
        where: { userId: req.user!.userId },
        data: { balance: { decrement: debited } },
      });
      await tx.wallet.update({
        where: { userId: recipient.id },
        data: { balance: { increment: credited } },
      });

      const txRow = await tx.transaction.create({
        data: {
          fromUserId: req.user!.userId,
          toUserId: recipient.id,
          amount: amt,
          fee,
          type: "TRANSFER",
          status: "SUCCESS",
          reference: `TRF-${crypto.randomUUID()}`,
          description: note || "Transfer",
          metadata: { fee: { scheduleId: quote.scheduleId, feePayer: quote.feePayer, amount: Number(fee) } },
        },
        include: { toUser: { select: { name: true, phone: true } } },
      });

      await platformLedger.creditFeeRevenue(tx, {
        currency: senderWallet.currency || "KES",
        amount: fee,
        transactionId: txRow.id,
        reference: txRow.reference,
        metadata: { flow: "WALLET_TRANSFER", method: "WALLET", feePayer: quote.feePayer },
      });

      await tx.notification.create({
        data: {
          userId: recipient.id,
          type: "PAYMENT",
          title: "Money Received",
          message: `You received KES ${Number(credited)} from ${senderName}`,
          actionUrl: "/wallet",
        },
      });

      return txRow;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 }
  );

  res.json({ success: true, data: { transaction: result } });
}

export async function withdrawMpesa(req: Request, res: Response) {
  const { amount, phone } = req.body ?? {};
  if (!amount || Number(amount) < 10) throw new AppError("Minimum withdrawal is KES 10", 400);
  if (!phone) throw new AppError("Phone number required", 400);

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { kycStatus: true } });
  if (!user) throw new AppError("User not found", 404);
  if (user.kycStatus !== "VERIFIED") throw new AppError("KYC verification is required for withdrawals", 403);

  const quote = await feeEngine.quote({
    flow: "WALLET_WITHDRAWAL",
    method: "MPESA_B2C",
    currency: "KES",
    amount: new Prisma.Decimal(amount),
  });
  const fee = Number(quote.fee);
  const total = Number(amount) + fee;

  const created = await prisma.$transaction(
    async (tx) => {
      // SECURITY FIX: Check balance INSIDE transaction to prevent race conditions
      const wallet = await tx.wallet.findUnique({ where: { userId: req.user!.userId } });
      if (!wallet || Number(wallet.balance) < total) throw new AppError("Insufficient balance", 400);

      await tx.wallet.update({
        where: { userId: req.user!.userId },
        data: { balance: { decrement: new Prisma.Decimal(total) } },
      });

      const txRow = await tx.transaction.create({
        data: {
          fromUserId: req.user!.userId,
          amount: new Prisma.Decimal(amount),
          fee: new Prisma.Decimal(fee),
          type: "WITHDRAWAL",
          status: "PENDING",
          reference: `WD-${crypto.randomUUID()}`,
          description: `Withdrawal to ${phone}`,
          metadata: { phone, method: "mpesa", fee: { scheduleId: quote.scheduleId, feePayer: quote.feePayer, amount: fee } },
        },
      });
      // PSP accounting: move principal to payout clearing, fee to platform revenue (reversible on failure)
      await platformLedger.creditPayoutClearing(tx, {
        currency: wallet.currency || "KES",
        amount: new Prisma.Decimal(amount),
        transactionId: txRow.id,
        reference: txRow.reference,
        metadata: { flow: "WALLET_WITHDRAWAL", method: "MPESA_B2C" },
      });
      await platformLedger.creditFeeRevenue(tx, {
        currency: wallet.currency || "KES",
        amount: new Prisma.Decimal(fee),
        transactionId: txRow.id,
        reference: txRow.reference,
        metadata: { flow: "WALLET_WITHDRAWAL", method: "MPESA_B2C" },
      });
      return txRow;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 }
  );

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
      const wallet = await tx.wallet.findUnique({ where: { userId: req.user!.userId } });
      await tx.wallet.update({
        where: { userId: req.user!.userId },
        data: { balance: { increment: new Prisma.Decimal(total) } },
      });

      await tx.transaction.update({
        where: { id: created.id },
        data: { status: "FAILED", metadata: { ...(created.metadata as any), error: error?.message } },
      });

      // Reverse platform postings
      await platformLedger.debitPayoutClearing(tx, {
        currency: wallet?.currency || "KES",
        amount: new Prisma.Decimal(amount),
        transactionId: created.id,
        reference: created.reference,
        metadata: { reason: "INIT_FAILED" },
      });
      await platformLedger.debitFeeRevenue(tx, {
        currency: wallet?.currency || "KES",
        amount: new Prisma.Decimal(fee),
        transactionId: created.id,
        reference: created.reference,
        metadata: { reason: "INIT_FAILED" },
      });
    });

    throw new AppError("Withdrawal failed", 500);
  }
}

// M-Pesa send money (wallet -> any phone). This is functionally similar to withdraw,
// but the UX is "send to phone number" and we allow an optional note.
export async function sendMpesa(req: Request, res: Response) {
  const { amount, phone, note } = req.body ?? {};
  if (!amount || Number(amount) < 10) throw new AppError("Minimum send is KES 10", 400);
  if (!phone) throw new AppError("Phone number required", 400);

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { kycStatus: true } });
  if (!user) throw new AppError("User not found", 404);
  if (user.kycStatus !== "VERIFIED") throw new AppError("KYC verification is required for withdrawals", 403);

  const quote = await feeEngine.quote({
    flow: "WALLET_SEND_MPESA",
    method: "MPESA_B2C",
    currency: "KES",
    amount: new Prisma.Decimal(amount),
  });
  const fee = Number(quote.fee);
  const total = Number(amount) + fee;

  const created = await prisma.$transaction(
    async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: req.user!.userId } });
      if (!wallet || Number(wallet.balance) < total) throw new AppError("Insufficient balance", 400);

      await tx.wallet.update({
        where: { userId: req.user!.userId },
        data: { balance: { decrement: new Prisma.Decimal(total) } },
      });

      const txRow = await tx.transaction.create({
        data: {
          fromUserId: req.user!.userId,
          amount: new Prisma.Decimal(amount),
          fee: new Prisma.Decimal(fee),
          type: "WITHDRAWAL",
          status: "PENDING",
          reference: `MPESA-SEND-${crypto.randomUUID()}`,
          description: note || `M-Pesa send to ${phone}`,
          metadata: {
            phone,
            method: "mpesa_b2c",
            kind: "send_money",
            fee: { scheduleId: quote.scheduleId, feePayer: quote.feePayer, amount: fee },
          },
        },
      });
      await platformLedger.creditPayoutClearing(tx, {
        currency: wallet.currency || "KES",
        amount: new Prisma.Decimal(amount),
        transactionId: txRow.id,
        reference: txRow.reference,
        metadata: { flow: "WALLET_SEND_MPESA", method: "MPESA_B2C" },
      });
      await platformLedger.creditFeeRevenue(tx, {
        currency: wallet.currency || "KES",
        amount: new Prisma.Decimal(fee),
        transactionId: txRow.id,
        reference: txRow.reference,
        metadata: { flow: "WALLET_SEND_MPESA", method: "MPESA_B2C" },
      });
      return txRow;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 }
  );

  try {
    const b2cResponse = await mpesaService.withdrawToMpesa(String(phone), Number(amount), "Bridge Send Money");

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
      data: { transaction: created, message: "Send initiated. Recipient will receive M-Pesa shortly." },
    });
  } catch (error: any) {
    await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: req.user!.userId } });
      await tx.wallet.update({
        where: { userId: req.user!.userId },
        data: { balance: { increment: new Prisma.Decimal(total) } },
      });

      await tx.transaction.update({
        where: { id: created.id },
        data: { status: "FAILED", metadata: { ...(created.metadata as any), error: error?.message } },
      });

      await platformLedger.debitPayoutClearing(tx, {
        currency: wallet?.currency || "KES",
        amount: new Prisma.Decimal(amount),
        transactionId: created.id,
        reference: created.reference,
        metadata: { reason: "INIT_FAILED" },
      });
      await platformLedger.debitFeeRevenue(tx, {
        currency: wallet?.currency || "KES",
        amount: new Prisma.Decimal(fee),
        transactionId: created.id,
        reference: created.reference,
        metadata: { reason: "INIT_FAILED" },
      });
    });

    throw new AppError("Send failed", 500);
  }
}

// A2P: Bank transfer via wallet (payout to bank account)
export async function withdrawBank(req: Request, res: Response) {
  const { amount, bankCode, accountNumber, accountName, note } = req.body ?? {};
  if (!amount || Number(amount) < 50) throw new AppError("Minimum bank transfer is KES 50", 400);
  if (!bankCode || !accountNumber || !accountName) throw new AppError("Bank details required", 400);

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { kycStatus: true } });
  if (!user) throw new AppError("User not found", 404);
  if (user.kycStatus !== "VERIFIED") throw new AppError("KYC verification is required for withdrawals", 403);

  const quote = await feeEngine.quote({
    flow: "WALLET_WITHDRAWAL",
    method: "BANK_A2P",
    currency: "KES",
    amount: new Prisma.Decimal(amount),
  });
  const fee = Number(quote.fee);
  const total = Number(amount) + fee;

  const created = await prisma.$transaction(
    async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: req.user!.userId } });
      if (!wallet || Number(wallet.balance) < total) throw new AppError("Insufficient balance", 400);

      await tx.wallet.update({
        where: { userId: req.user!.userId },
        data: { balance: { decrement: new Prisma.Decimal(total) } },
      });

      const txRow = await tx.transaction.create({
        data: {
          fromUserId: req.user!.userId,
          amount: new Prisma.Decimal(amount),
          fee: new Prisma.Decimal(fee),
          type: "WITHDRAWAL",
          status: "PENDING",
          reference: `BANK-${crypto.randomUUID()}`,
          description: note || `Bank transfer to ${accountName}`,
          metadata: {
            method: "bank",
            bankCode,
            accountNumber,
            accountName,
            provider: "wapipay",
            fee: { scheduleId: quote.scheduleId, feePayer: quote.feePayer, amount: fee },
          },
        },
      });
      await platformLedger.creditPayoutClearing(tx, {
        currency: wallet.currency || "KES",
        amount: new Prisma.Decimal(amount),
        transactionId: txRow.id,
        reference: txRow.reference,
        metadata: { flow: "WALLET_WITHDRAWAL", method: "BANK_A2P" },
      });
      await platformLedger.creditFeeRevenue(tx, {
        currency: wallet.currency || "KES",
        amount: new Prisma.Decimal(fee),
        transactionId: txRow.id,
        reference: txRow.reference,
        metadata: { flow: "WALLET_WITHDRAWAL", method: "BANK_A2P" },
      });
      return txRow;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 }
  );

  try {
    const payout = await wapipayService.createBankPayout({
      reference: created.reference,
      amount: Number(amount),
      currency: "KES",
      bank_code: bankCode,
      account_number: accountNumber,
      account_name: accountName,
      narration: note || "Bridge bank transfer",
    });

    await prisma.transaction.update({
      where: { id: created.id },
      data: {
        metadata: { ...(created.metadata as any), providerRef: payout.providerRef, wapipay: payout.raw },
      },
    });

    res.json({
      success: true,
      data: { transaction: created, message: "Bank transfer initiated. You will be notified when complete." },
    });
  } catch (e: any) {
    // refund on failure to initiate
    await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: req.user!.userId } });
      await tx.wallet.update({
        where: { userId: req.user!.userId },
        data: { balance: { increment: new Prisma.Decimal(total) } },
      });
      await tx.transaction.update({
        where: { id: created.id },
        data: { status: "FAILED", metadata: { ...(created.metadata as any), error: e?.message } },
      });

      await platformLedger.debitPayoutClearing(tx, {
        currency: wallet?.currency || "KES",
        amount: new Prisma.Decimal(amount),
        transactionId: created.id,
        reference: created.reference,
        metadata: { reason: "INIT_FAILED" },
      });
      await platformLedger.debitFeeRevenue(tx, {
        currency: wallet?.currency || "KES",
        amount: new Prisma.Decimal(fee),
        transactionId: created.id,
        reference: created.reference,
        metadata: { reason: "INIT_FAILED" },
      });
    });

    throw new AppError(e?.message || "Bank transfer failed", 500);
  }
}

// Paybill deposit instructions (manual Paybill/C2B)
export async function depositPaybill(req: Request, res: Response) {
  const { amount } = req.body ?? {};
  if (!amount || Number(amount) < 1) throw new AppError("Minimum deposit is KES 1", 400);

  const paybill = process.env.MPESA_PAYBILL || process.env.MPESA_SHORTCODE || "";
  if (!paybill) throw new AppError("MPESA_PAYBILL not configured", 500);

  // Use a stable account reference so C2B confirmation can credit the right wallet
  const accountReference = `BR-${req.user!.userId}`;
  const feeQuote = await feeEngine.quote({
    flow: "WALLET_DEPOSIT",
    method: "PAYBILL",
    currency: "KES",
    amount: new Prisma.Decimal(amount),
  });

  const txRow = await prisma.transaction.create({
    data: {
      toUserId: req.user!.userId,
      amount: new Prisma.Decimal(amount),
      fee: feeQuote.fee,
      type: "DEPOSIT",
      status: "PENDING",
      reference: `PAYBILL-DEP-${crypto.randomUUID()}`,
      description: "Paybill deposit",
      metadata: {
        method: "paybill",
        paybill,
        accountReference,
        fee: { scheduleId: feeQuote.scheduleId, feePayer: feeQuote.feePayer, amount: Number(feeQuote.fee) },
      },
    },
  });

  res.json({
    success: true,
    data: {
      paybill,
      accountReference,
      amount: Number(txRow.amount),
      transaction: { id: txRow.id, reference: txRow.reference, status: txRow.status },
      instructions: [
        "Go to M-Pesa menu",
        "Select Lipa na M-Pesa",
        "Select Pay Bill",
        `Enter Business Number: ${paybill}`,
        `Enter Account Number: ${accountReference}`,
        `Enter Amount: ${Number(txRow.amount)}`,
        "Enter your PIN to complete",
      ],
    },
  });
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


