import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

export async function searchUsers(req: Request, res: Response) {
  const { q, type } = req.query as any;
  if (!q) throw new AppError("Search query required", 400);

  const where: any = { status: "ACTIVE", id: { not: req.user!.userId } };
  switch (type) {
    case "phone":
      where.phone = { contains: q as string };
      break;
    case "email":
      where.email = { contains: q as string, mode: "insensitive" };
      break;
    default:
      where.OR = [
        { phone: { contains: q as string } },
        { email: { contains: q as string, mode: "insensitive" } },
        { name: { contains: q as string, mode: "insensitive" } },
      ];
  }

  const users = await prisma.user.findMany({
    where,
    take: 10,
    select: { id: true, name: true, phone: true, email: true, role: true, kycStatus: true },
  });

  res.json({ success: true, data: { users } });
}

export async function browseImplementers(req: Request, res: Response) {
  const { page = 1, limit = 20, skills, minRating } = req.query as any;
  const skip = (Number(page) - 1) * Number(limit);

  const where: any = { role: "IMPLEMENTER", status: "ACTIVE", kycStatus: "VERIFIED" };

  if (skills) {
    where.profile = {
      skills: { hasSome: String(skills).split(",") },
    };
  }

  if (minRating) {
    where.profile = {
      ...(where.profile || {}),
      averageRating: { gte: new Prisma.Decimal(minRating) },
    };
  }

  const [implementers, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: Number(limit),
      select: {
        id: true,
        name: true,
        profile: {
          select: {
            bio: true,
            skills: true,
            hourlyRate: true,
            averageRating: true,
            totalReviews: true,
            completedProjects: true,
            portfolio: true,
          },
        },
      },
      orderBy: { profile: { averageRating: "desc" } },
    }),
    prisma.user.count({ where }),
  ]);

  res.json({
    success: true,
    data: { implementers, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } },
  });
}

export async function getImplementerProfile(req: Request, res: Response) {
  const { id } = req.params;
  if (!id) throw new AppError("Implementer id required", 400);

  const implementer = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
      profile: {
        select: {
          bio: true,
          skills: true,
          hourlyRate: true,
          availability: true,
          location: true,
          languages: true,
          experience: true,
          averageRating: true,
          totalReviews: true,
          completedProjects: true,
          portfolio: true,
        },
      },
      reviewsReceived: {
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { reviewer: { select: { name: true } } },
      },
    },
  });

  if (!implementer) throw new AppError("Implementer not found", 404);

  res.json({ success: true, data: { implementer } });
}

export async function updateProfile(req: Request, res: Response) {
  const { bio, skills, hourlyRate, availability, location, languages, experience, portfolio } = req.body ?? {};

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (user?.role !== "IMPLEMENTER") throw new AppError("Only implementers can update profile", 403);

  const profile = await prisma.userProfile.upsert({
    where: { userId: req.user!.userId },
    update: {
      bio,
      skills: skills ?? [],
      hourlyRate: hourlyRate ? new Prisma.Decimal(hourlyRate) : null,
      availability,
      location,
      languages: languages ?? [],
      experience,
      portfolio,
    },
    create: {
      userId: req.user!.userId,
      bio,
      skills: skills ?? [],
      hourlyRate: hourlyRate ? new Prisma.Decimal(hourlyRate) : null,
      availability,
      location,
      languages: languages ?? [],
      experience,
      portfolio,
    },
  });

  res.json({ success: true, data: { profile } });
}


