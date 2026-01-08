import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import platformLedger from "../services/platformLedger.service";

export async function listFeeSchedules(req: Request, res: Response) {
  const { active, flow, currency, method } = req.query as any;

  const where: any = {};
  if (active !== undefined) where.active = String(active) === "true";
  if (flow) where.flow = String(flow);
  if (currency) where.currency = String(currency);
  if (method !== undefined) where.method = method === "null" ? null : String(method);

  const schedules = await prisma.feeSchedule.findMany({
    where,
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
  });

  res.json({ success: true, data: { schedules } });
}

export async function createFeeSchedule(req: Request, res: Response) {
  const body = req.body ?? {};
  const createdBy = ((req as any)?.user?.userId as string | undefined) ?? null;

  const schedule = await prisma.feeSchedule.create({
    data: {
      active: body.active ?? true,
      name: body.name,
      flow: body.flow,
      method: body.method ?? null,
      currency: body.currency ?? "KES",
      feePayer: body.feePayer ?? "SENDER",
      bps: body.bps ?? 0,
      flat: new Prisma.Decimal(body.flat ?? 0),
      minFee: new Prisma.Decimal(body.minFee ?? 0),
      maxFee: body.maxFee === null || body.maxFee === undefined ? null : new Prisma.Decimal(body.maxFee),
      metadata: body.metadata ?? undefined,
      createdBy,
    },
  });

  res.status(201).json({ success: true, data: { schedule } });
}

export async function updateFeeSchedule(req: Request, res: Response) {
  const { id } = req.params;
  if (!id) throw new AppError("FeeSchedule id required", 400);
  const body = req.body ?? {};

  const data: any = {};
  if (body.active !== undefined) data.active = body.active;
  if (body.name !== undefined) data.name = body.name;
  if (body.flow !== undefined) data.flow = body.flow;
  if (body.method !== undefined) data.method = body.method;
  if (body.currency !== undefined) data.currency = body.currency;
  if (body.feePayer !== undefined) data.feePayer = body.feePayer;
  if (body.bps !== undefined) data.bps = body.bps;
  if (body.flat !== undefined) data.flat = new Prisma.Decimal(body.flat);
  if (body.minFee !== undefined) data.minFee = new Prisma.Decimal(body.minFee);
  if (body.maxFee !== undefined) data.maxFee = body.maxFee === null ? null : new Prisma.Decimal(body.maxFee);
  if (body.metadata !== undefined) data.metadata = body.metadata;

  const updated = await prisma.feeSchedule.update({ where: { id }, data });

  res.json({ success: true, data: { schedule: updated } });
}

export async function getPlatformAccounts(req: Request, res: Response) {
  const accounts = await prisma.platformAccount.findMany({ orderBy: { currency: "asc" } });
  res.json({ success: true, data: { accounts } });
}

export async function listPlatformLedger(req: Request, res: Response) {
  const { currency, type, transactionId, limit = 50 } = req.query as any;

  const where: any = {};
  if (currency) where.currency = String(currency);
  if (type) where.type = String(type);
  if (transactionId) where.transactionId = String(transactionId);

  const entries = await prisma.platformLedgerEntry.findMany({
    where,
    take: Math.min(Number(limit) || 50, 200),
    orderBy: { createdAt: "desc" },
  });

  res.json({ success: true, data: { entries } });
}

// Bookkeeping: record a settlement out of platform fee revenue (e.g. to bank / PSP master wallet).
// This does NOT trigger an external payout yet; it simply reduces platform fee revenue and leaves an auditable trail.
export async function settleFeeRevenue(req: Request, res: Response) {
  const { currency = "KES", amount, reference, note } = req.body ?? {};
  if (!amount || Number(amount) <= 0) throw new AppError("amount is required", 400);

  const amt = new Prisma.Decimal(amount);
  const cur = String(currency || "KES");

  await prisma.$transaction(async (tx) => {
    // Ensure account exists and has enough
    const acct = await tx.platformAccount.upsert({
      where: { currency: cur },
      create: { currency: cur, feeRevenue: new Prisma.Decimal(0), payoutClearing: new Prisma.Decimal(0) },
      update: {},
    });
    if (acct.feeRevenue.lt(amt)) throw new AppError("Insufficient platform fee revenue to settle", 400);

    await platformLedger.debitFeeRevenue(tx, {
      currency: cur,
      amount: amt,
      ...(reference ? { reference: String(reference) } : {}),
      metadata: { ...(note ? { note: String(note) } : {}), kind: "fee_revenue_settlement" },
    });
  });

  res.json({ success: true, message: "Fee revenue settlement recorded" });
}


