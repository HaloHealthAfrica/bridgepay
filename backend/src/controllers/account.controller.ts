import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

export async function updateMe(req: Request, res: Response) {
  const { name, email, phone } = req.body ?? {};

  if (!name && !email && !phone) throw new AppError("No changes provided", 400);

  // Basic uniqueness checks if changing email/phone
  if (email) {
    const existing = await prisma.user.findFirst({
      where: { email, id: { not: req.user!.userId } },
      select: { id: true },
    });
    if (existing) throw new AppError("Email already in use", 400);
  }

  if (phone) {
    const existing = await prisma.user.findFirst({
      where: { phone, id: { not: req.user!.userId } },
      select: { id: true },
    });
    if (existing) throw new AppError("Phone already in use", 400);
  }

  const user = await prisma.user.update({
    where: { id: req.user!.userId },
    data: {
      name: name ?? undefined,
      email: email ?? undefined,
      phone: phone ?? undefined,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      kycStatus: true,
      status: true,
      twoFactorEnabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json({ success: true, data: { user } });
}

export async function listSessions(req: Request, res: Response) {
  const sessions = await prisma.session.findMany({
    where: { userId: req.user!.userId },
    orderBy: { lastActive: "desc" },
    take: 50,
  });
  res.json({ success: true, data: { sessions } });
}




