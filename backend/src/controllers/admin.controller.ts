import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

export async function getStats(_req: Request, res: Response) {
  const [
    totalUsers,
    merchants,
    customers,
    totalTransactions,
    transactionVolume,
    pendingKyc,
    activeDisputes,
    escrowAgg,
    balanceAgg,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "MERCHANT" } }),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.transaction.count(),
    prisma.transaction.aggregate({ where: { status: "SUCCESS" }, _sum: { amount: true } }),
    prisma.kYCSubmission.count({ where: { status: "PENDING" } }),
    prisma.dispute.count({ where: { status: { not: "CLOSED" } } }),
    prisma.wallet.aggregate({ _sum: { escrowBalance: true } }),
    prisma.wallet.aggregate({ _sum: { balance: true } }),
  ]);

  res.json({
    success: true,
    data: {
      totalUsers,
      merchants,
      customers,
      totalTransactions,
      transactionVolume: Number(transactionVolume._sum.amount) || 0,
      pendingKYC: pendingKyc,
      activeDisputes,
      escrowBalance: Number(escrowAgg._sum.escrowBalance) || 0,
      platformBalance: Number(balanceAgg._sum.balance) || 0,
    },
  });
}

export async function listUsers(req: Request, res: Response) {
  const { page = 1, limit = 20, q, role, status, kycStatus } = req.query as any;
  const skip = (Number(page) - 1) * Number(limit);

  const where: any = {};
  if (role) where.role = role;
  if (status) where.status = status;
  if (kycStatus) where.kycStatus = kycStatus;
  if (q) {
    where.OR = [
      { name: { contains: q as string, mode: "insensitive" } },
      { email: { contains: q as string, mode: "insensitive" } },
      { phone: { contains: q as string } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
      include: {
        wallet: true,
        merchantProfile: true,
        profile: true,
        _count: {
          select: { sentTransactions: true, receivedTransactions: true, ownedProjects: true, implementedProjects: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const mapped = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    kycStatus: u.kycStatus,
    status: u.status,
    balance: u.wallet ? Number(u.wallet.balance) : 0,
    escrowBalance: u.wallet ? Number(u.wallet.escrowBalance) : 0,
    joinedDate: u.createdAt,
    lastActive: u.lastLoginAt,
    businessName: u.merchantProfile?.businessName,
    transactionCount: (u._count.sentTransactions || 0) + (u._count.receivedTransactions || 0),
    completedProjects: u.profile?.completedProjects || 0,
    rating: u.profile?.averageRating ? Number(u.profile.averageRating) : null,
  }));

  res.json({
    success: true,
    data: {
      users: mapped,
      pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
    },
  });
}

export async function updateUserStatus(req: Request, res: Response) {
  const { id } = req.params;
  const { status } = req.body ?? {};
  if (!id) throw new AppError("User id required", 400);
  if (!status) throw new AppError("status required", 400);

  const updated = await prisma.user.update({
    where: { id },
    data: { status },
    select: { id: true, status: true },
  });

  res.json({ success: true, data: { user: updated } });
}

export async function updateUserRole(req: Request, res: Response) {
  const { id } = req.params;
  const { role } = req.body ?? {};
  if (!id) throw new AppError("User id required", 400);
  if (!role) throw new AppError("role required", 400);

  const allowed = ["CUSTOMER", "MERCHANT", "IMPLEMENTER", "PROJECT_VERIFIER", "KYC_VERIFIER", "ADMIN"];
  const nextRole = String(role);
  if (!allowed.includes(nextRole)) throw new AppError("Invalid role", 400);

  const updated = await prisma.user.update({
    where: { id },
    data: { role: nextRole as any },
    select: { id: true, role: true },
  });

  res.json({ success: true, data: { user: updated } });
}

export async function listTransactions(req: Request, res: Response) {
  const { page = 1, limit = 20, q, type, status } = req.query as any;
  const skip = (Number(page) - 1) * Number(limit);

  const where: any = {};
  if (type) where.type = type;
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { reference: { contains: q as string, mode: "insensitive" } },
      { description: { contains: q as string, mode: "insensitive" } },
    ];
  }

  const [txs, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
      include: {
        fromUser: { select: { name: true, phone: true } },
        toUser: { select: { name: true, phone: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  const mapped = txs.map((t) => ({
    id: t.id,
    reference: t.reference,
    from: t.fromUser?.name || "Bridge",
    fromPhone: t.fromUser?.phone || null,
    to: t.toUser?.name || "Bridge",
    toPhone: t.toUser?.phone || null,
    amount: Number(t.amount),
    fee: Number(t.fee),
    type: t.type,
    method: (t.metadata as any)?.method?.toUpperCase?.() || null,
    status: t.status,
    timestamp: t.createdAt,
    description: t.description,
  }));

  res.json({
    success: true,
    data: {
      transactions: mapped,
      pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
    },
  });
}

export async function listWallets(req: Request, res: Response) {
  const { page = 1, limit = 20, q } = req.query as any;
  const skip = (Number(page) - 1) * Number(limit);

  const whereUser: any = {};
  if (q) {
    whereUser.OR = [
      { name: { contains: q as string, mode: "insensitive" } },
      { email: { contains: q as string, mode: "insensitive" } },
      { phone: { contains: q as string } },
    ];
  }

  const [wallets, total] = await Promise.all([
    prisma.wallet.findMany({
      skip,
      take: Number(limit),
      orderBy: { updatedAt: "desc" },
      include: { user: { select: { id: true, name: true, role: true }, where: whereUser } as any },
    }),
    prisma.wallet.count(),
  ]);

  const mapped = wallets
    .filter((w) => (q ? !!w.user : true))
    .map((w) => ({
      userId: w.userId,
      userName: w.user?.name || "Unknown",
      role: w.user?.role || "CUSTOMER",
      balance: Number(w.balance),
      pendingBalance: Number(w.pendingBalance),
      escrowBalance: Number(w.escrowBalance),
      currency: w.currency,
      lastTransaction: w.updatedAt,
    }));

  res.json({
    success: true,
    data: {
      wallets: mapped,
      pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
    },
  });
}

export async function listKycSubmissions(req: Request, res: Response) {
  const { page = 1, limit = 20, status } = req.query as any;
  const skip = (Number(page) - 1) * Number(limit);
  const where: any = {};
  if (status) where.status = status;

  const [items, total] = await Promise.all([
    prisma.kYCSubmission.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { updatedAt: "desc" },
      include: { user: { select: { id: true, name: true, email: true, phone: true, kycStatus: true } } },
    }),
    prisma.kYCSubmission.count({ where }),
  ]);

  res.json({
    success: true,
    data: {
      kycSubmissions: items,
      pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
    },
  });
}

export async function reviewKyc(req: Request, res: Response) {
  const { userId } = req.params;
  const { action, notes } = req.body ?? {};
  if (!userId) throw new AppError("userId required", 400);
  if (!action || !["APPROVE", "REJECT"].includes(action)) throw new AppError("action must be APPROVE|REJECT", 400);

  const status = action === "APPROVE" ? "VERIFIED" : "REJECTED";

  await prisma.$transaction(async (tx) => {
    await tx.kYCSubmission.update({
      where: { userId },
      data: {
        status,
        verifierId: req.user!.userId,
        verifierNotes: notes || null,
        reviewedAt: new Date(),
      },
    });

    await tx.user.update({ where: { id: userId }, data: { kycStatus: status } });

    await tx.notification.create({
      data: {
        userId,
        type: "KYC",
        title: action === "APPROVE" ? "KYC Approved" : "KYC Rejected",
        message: action === "APPROVE" ? "Your identity verification has been approved." : `Your KYC was rejected: ${notes || "Please resubmit."}`,
        actionUrl: "/settings/kyc",
      },
    });
  });

  res.json({ success: true });
}

export async function listDisputes(req: Request, res: Response) {
  const { page = 1, limit = 20, status, priority } = req.query as any;
  const skip = (Number(page) - 1) * Number(limit);
  const where: any = {};
  if (status) where.status = status;
  if (priority) where.priority = priority;

  const [items, total] = await Promise.all([
    prisma.dispute.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { id: true, title: true, escrowBalance: true, implementerId: true, ownerId: true } },
        reporter: { select: { id: true, name: true } },
      },
    }),
    prisma.dispute.count({ where }),
  ]);

  res.json({
    success: true,
    data: {
      disputes: items,
      pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
    },
  });
}




