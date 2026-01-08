import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

export async function listNotifications(req: Request, res: Response) {
  const { page = 1, limit = 20, unread } = req.query as any;
  const skip = (Number(page) - 1) * Number(limit);

  const where: any = { userId: req.user!.userId };
  if (unread === "true") where.read = false;

  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: Number(limit),
    }),
    prisma.notification.count({ where }),
  ]);

  res.json({
    success: true,
    data: {
      notifications: items,
      pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
    },
  });
}

export async function markRead(req: Request, res: Response) {
  const { id } = req.params;
  if (!id) throw new AppError("Notification id required", 400);

  const existing = await prisma.notification.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) throw new AppError("Notification not found", 404);
  if (existing.userId !== req.user!.userId) throw new AppError("Unauthorized", 403);

  await prisma.notification.update({ where: { id }, data: { read: true } });
  res.json({ success: true });
}

export async function markAllRead(req: Request, res: Response) {
  await prisma.notification.updateMany({ where: { userId: req.user!.userId, read: false }, data: { read: true } });
  res.json({ success: true });
}




