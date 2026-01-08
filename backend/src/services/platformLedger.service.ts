import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type TxClient = typeof prisma | Prisma.TransactionClient;

async function ensureAccount(tx: TxClient, currency: string) {
  return tx.platformAccount.upsert({
    where: { currency },
    create: { currency, feeRevenue: new Prisma.Decimal(0), payoutClearing: new Prisma.Decimal(0) },
    update: {},
  });
}

class PlatformLedgerService {
  async creditFeeRevenue(tx: TxClient, args: { currency: string; amount: Prisma.Decimal; transactionId?: string; reference?: string; metadata?: any }) {
    if (args.amount.lte(0)) return;
    await ensureAccount(tx, args.currency);
    await tx.platformAccount.update({ where: { currency: args.currency }, data: { feeRevenue: { increment: args.amount } } });
    const data: any = {
      currency: args.currency,
      type: "FEE_REVENUE_CREDIT",
      amount: args.amount,
      ...(args.reference ? { reference: args.reference } : {}),
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
      ...(args.transactionId ? { transaction: { connect: { id: args.transactionId } } } : {}),
    };
    await tx.platformLedgerEntry.create({ data });
  }

  async debitFeeRevenue(tx: TxClient, args: { currency: string; amount: Prisma.Decimal; transactionId?: string; reference?: string; metadata?: any }) {
    if (args.amount.lte(0)) return;
    await ensureAccount(tx, args.currency);
    await tx.platformAccount.update({ where: { currency: args.currency }, data: { feeRevenue: { decrement: args.amount } } });
    const data: any = {
      currency: args.currency,
      type: "FEE_REVENUE_DEBIT",
      amount: args.amount,
      ...(args.reference ? { reference: args.reference } : {}),
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
      ...(args.transactionId ? { transaction: { connect: { id: args.transactionId } } } : {}),
    };
    await tx.platformLedgerEntry.create({ data });
  }

  async creditPayoutClearing(tx: TxClient, args: { currency: string; amount: Prisma.Decimal; transactionId?: string; reference?: string; metadata?: any }) {
    if (args.amount.lte(0)) return;
    await ensureAccount(tx, args.currency);
    await tx.platformAccount.update({ where: { currency: args.currency }, data: { payoutClearing: { increment: args.amount } } });
    const data: any = {
      currency: args.currency,
      type: "PAYOUT_CLEARING_CREDIT",
      amount: args.amount,
      ...(args.reference ? { reference: args.reference } : {}),
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
      ...(args.transactionId ? { transaction: { connect: { id: args.transactionId } } } : {}),
    };
    await tx.platformLedgerEntry.create({ data });
  }

  async debitPayoutClearing(tx: TxClient, args: { currency: string; amount: Prisma.Decimal; transactionId?: string; reference?: string; metadata?: any }) {
    if (args.amount.lte(0)) return;
    await ensureAccount(tx, args.currency);
    await tx.platformAccount.update({ where: { currency: args.currency }, data: { payoutClearing: { decrement: args.amount } } });
    const data: any = {
      currency: args.currency,
      type: "PAYOUT_CLEARING_DEBIT",
      amount: args.amount,
      ...(args.reference ? { reference: args.reference } : {}),
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
      ...(args.transactionId ? { transaction: { connect: { id: args.transactionId } } } : {}),
    };
    await tx.platformLedgerEntry.create({ data });
  }
}

export default new PlatformLedgerService();


