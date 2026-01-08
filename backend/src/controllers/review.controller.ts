import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

export async function createReview(req: Request, res: Response) {
  const projectId = (req.body?.projectId as string | undefined) ?? undefined;
  const revieweeId = (req.body?.revieweeId as string | undefined) ?? undefined;
  const rating = req.body?.rating as number | undefined;
  const comment = req.body?.comment as string | undefined;

  if (!projectId || !revieweeId) throw new AppError("Missing required fields", 400);
  if (!rating || Number(rating) < 1 || Number(rating) > 5) throw new AppError("Rating must be between 1 and 5", 400);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true, implementerId: true, status: true },
  });
  if (!project) throw new AppError("Project not found", 404);
  if (project.status !== "COMPLETED") throw new AppError("Can only review completed projects", 400);
  if (project.ownerId !== req.user!.userId) throw new AppError("Only project owner can review", 403);
  if (project.implementerId !== revieweeId) throw new AppError("Invalid reviewee", 400);

  const existing = await prisma.review.findUnique({
    where: { projectId_reviewerId: { projectId, reviewerId: req.user!.userId } },
  });
  if (existing) throw new AppError("Already reviewed", 400);

  await prisma.$transaction(async (tx) => {
    await tx.review.create({
      data: { projectId, reviewerId: req.user!.userId, revieweeId, rating: Number(rating), comment: comment ?? null },
    });

    const reviews = await tx.review.findMany({ where: { revieweeId }, select: { rating: true } });
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    await tx.userProfile.update({
      where: { userId: revieweeId },
      data: { averageRating: new Prisma.Decimal(avgRating), totalReviews: reviews.length, completedProjects: { increment: 1 } },
    });

    await tx.notification.create({
      data: { userId: revieweeId, type: "PROJECT", title: "New Review", message: `You received a ${rating}-star review`, actionUrl: "/profile" },
    });
  });

  res.status(201).json({ success: true, message: "Review submitted" });
}

export async function getReviews(req: Request, res: Response) {
  const { userId } = req.params;
  if (!userId) throw new AppError("userId required", 400);
  const { page = 1, limit = 10 } = req.query as any;
  const skip = (Number(page) - 1) * Number(limit);

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where: { revieweeId: userId },
      skip,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
      include: { reviewer: { select: { name: true } } },
    }),
    prisma.review.count({ where: { revieweeId: userId } }),
  ]);

  res.json({
    success: true,
    data: { reviews, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } },
  });
}


