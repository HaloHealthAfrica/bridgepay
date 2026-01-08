import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import QRCode from "qrcode";
import lemonadeService from "../services/lemonade.service";

function getCallbackBaseUrl() {
  return process.env.APP_URL || process.env.BACKEND_URL || "http://localhost:3000";
}

export async function getMerchantPublic(req: Request, res: Response) {
  const { merchantId } = req.params;
  if (!merchantId) throw new AppError("merchantId required", 400);

  const merchant = await prisma.user.findUnique({
    where: { id: merchantId },
    include: { merchantProfile: true },
  });

  if (!merchant || merchant.role !== "MERCHANT" || !merchant.merchantProfile) {
    throw new AppError("Merchant not found", 404);
  }

  res.json({
    success: true,
    data: {
      merchant: {
        id: merchant.id,
        name: merchant.name,
        phone: merchant.phone,
        businessName: merchant.merchantProfile.businessName,
        businessType: merchant.merchantProfile.businessType,
        businessAddress: merchant.merchantProfile.businessAddress,
        qrCode: merchant.merchantProfile.qrCode,
        paymentMethods: merchant.merchantProfile.paymentMethods,
      },
    },
  });
}

export async function getMerchantMe(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { merchantProfile: true, wallet: true },
  });

  if (!user || user.role !== "MERCHANT") throw new AppError("Unauthorized", 403);

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        kycStatus: user.kycStatus,
        merchantProfile: user.merchantProfile,
      },
      wallet: user.wallet
        ? {
            balance: Number(user.wallet.balance),
            pendingBalance: Number(user.wallet.pendingBalance),
            escrowBalance: Number(user.wallet.escrowBalance),
            currency: user.wallet.currency,
          }
        : null,
    },
  });
}

export async function generateQRCode(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { merchantProfile: true },
  });

  if (user?.role !== "MERCHANT") throw new AppError("Only merchants can generate QR codes", 403);
  if (!user.merchantProfile) throw new AppError("Merchant profile missing", 400);

  const qrData = {
    type: "bridge_payment",
    merchantId: user.id,
    merchantName: user.merchantProfile.businessName,
    url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/pay/${user.id}`,
  };

  const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), { width: 400, margin: 2 });

  await prisma.merchantProfile.update({
    where: { userId: user.id },
    data: { qrCode: qrCodeDataURL },
  });

  res.json({ success: true, data: { qrCode: qrCodeDataURL, paymentUrl: qrData.url } });
}

export async function processQRPayment(req: Request, res: Response) {
  const { merchantId, amount, note } = req.body ?? {};
  if (!merchantId) throw new AppError("merchantId required", 400);
  if (!amount || Number(amount) < 1) throw new AppError("Invalid amount", 400);

  const customerWallet = await prisma.wallet.findUnique({ where: { userId: req.user!.userId } });
  if (!customerWallet || Number(customerWallet.balance) < Number(amount)) throw new AppError("Insufficient balance", 400);

  const merchant = await prisma.user.findUnique({ where: { id: merchantId }, include: { merchantProfile: true } });
  if (!merchant || merchant.role !== "MERCHANT") throw new AppError("Invalid merchant", 404);

  const result = await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { userId: req.user!.userId },
      data: { balance: { decrement: new Prisma.Decimal(amount) } },
    });

    await tx.wallet.update({
      where: { userId: merchantId },
      data: { balance: { increment: new Prisma.Decimal(amount) } },
    });

    const transaction = await tx.transaction.create({
      data: {
        fromUserId: req.user!.userId,
        toUserId: merchantId,
        amount: new Prisma.Decimal(amount),
        type: "PAYMENT",
        status: "SUCCESS",
        reference: `PAY-${Date.now()}`,
        description: note || `Payment to ${merchant.merchantProfile?.businessName || merchant.name}`,
        metadata: { method: "qr", merchantId },
      },
      include: { toUser: { select: { name: true, merchantProfile: true } } },
    });

    await tx.notification.create({
      data: {
        userId: merchantId,
        type: "PAYMENT",
        title: "Payment Received",
        message: `KES ${amount} received via QR code`,
        actionUrl: "/wallet",
      },
    });

    return transaction;
  });

  res.json({ success: true, data: { transaction: result } });
}

export async function initiateCardPaymentToMerchant(req: Request, res: Response) {
  const { merchantId, amount, note } = req.body ?? {};
  if (!merchantId) throw new AppError("merchantId required", 400);
  if (!amount || Number(amount) < 1) throw new AppError("Invalid amount", 400);

  const [merchant, customer] = await Promise.all([
    prisma.user.findUnique({ where: { id: merchantId }, include: { merchantProfile: true } }),
    prisma.user.findUnique({ where: { id: req.user!.userId }, select: { id: true, name: true, phone: true, email: true } }),
  ]);

  if (!merchant || merchant.role !== "MERCHANT" || !merchant.merchantProfile) throw new AppError("Invalid merchant", 404);
  if (!customer) throw new AppError("User not found", 404);

  const walletNo = process.env.LEMONADE_WALLET_NO || "";
  if (!walletNo) throw new AppError("Card payments not configured (LEMONADE_WALLET_NO missing)", 500);

  const reference = `CARD-PAY-${Date.now()}`;
  const resultUrl = `${getCallbackBaseUrl()}/api/callback/lemonade`;

  const txRow = await prisma.transaction.create({
    data: {
      fromUserId: req.user!.userId,
      toUserId: merchantId,
      amount: new Prisma.Decimal(amount),
      type: "PAYMENT",
      status: "PENDING",
      reference,
      description: note || `Card payment to ${merchant.merchantProfile.businessName}`,
      metadata: { method: "card", provider: "lemonade", merchantId },
    },
  });

  try {
    const initiated = await lemonadeService.initiateCardPayment({
      walletNo,
      reference,
      amount: Number(amount),
      currency: "KES",
      customerName: customer.name,
      customerPhone: customer.phone,
      description: `Bridge: Pay ${merchant.merchantProfile.businessName}`,
      resultUrl,
      email: customer.email,
    });

    await prisma.transaction.update({
      where: { id: txRow.id },
      data: {
        metadata: {
          ...(txRow.metadata as any),
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
        checkoutUrl: initiated.redirectUrl,
        providerTransactionId: initiated.transactionId,
        transaction: { id: txRow.id, reference: txRow.reference, amount: Number(txRow.amount), status: txRow.status },
      },
    });
  } catch (e: any) {
    await prisma.transaction.update({ where: { id: txRow.id }, data: { status: "FAILED" } });
    throw new AppError(e?.message || "Failed to initiate card payment", 500);
  }
}

export async function checkCardPaymentStatus(req: Request, res: Response) {
  const { providerTransactionId } = req.params;
  if (!providerTransactionId) throw new AppError("providerTransactionId required", 400);

  const txRow = await prisma.transaction.findFirst({
    where: {
      fromUserId: req.user!.userId,
      type: "PAYMENT",
      metadata: { path: ["lemonade", "transaction_id"], equals: providerTransactionId },
    },
  });
  if (!txRow) throw new AppError("Transaction not found", 404);

  const status = await lemonadeService.queryStatus(providerTransactionId);
  const ref = (status as any)?.data?.external_reference || txRow.reference;
  await lemonadeService.reconcileBridgeTransactionByReference(String(ref), status);

  const updated = await prisma.transaction.findUnique({ where: { id: txRow.id } });

  res.json({ success: true, data: { provider: status, transaction: updated } });
}

export async function getSalesStats(req: Request, res: Response) {
  const { period = "7days" } = req.query as any;

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (user?.role !== "MERCHANT") throw new AppError("Unauthorized", 403);

  let startDate: Date;
  const now = new Date();

  switch (period) {
    case "today":
      startDate = new Date(now.setHours(0, 0, 0, 0));
      break;
    case "30days":
      startDate = new Date(now.setDate(now.getDate() - 30));
      break;
    case "7days":
    default:
      startDate = new Date(now.setDate(now.getDate() - 7));
  }

  const [transactions, totalSales, transactionCount] = await Promise.all([
    prisma.transaction.findMany({
      where: { toUserId: req.user!.userId, type: "PAYMENT", status: "SUCCESS", createdAt: { gte: startDate } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { fromUser: { select: { name: true, phone: true } } },
    }),
    prisma.transaction.aggregate({
      where: { toUserId: req.user!.userId, type: "PAYMENT", status: "SUCCESS", createdAt: { gte: startDate } },
      _sum: { amount: true },
    }),
    prisma.transaction.count({
      where: { toUserId: req.user!.userId, type: "PAYMENT", status: "SUCCESS", createdAt: { gte: startDate } },
    }),
  ]);

  res.json({
    success: true,
    data: {
      period,
      totalSales: Number(totalSales._sum.amount) || 0,
      transactionCount,
      transactions,
    },
  });
}


