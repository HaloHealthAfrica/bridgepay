import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { uploadFilesToS3 } from "../services/storage.service";
import lemonadeService from "../services/lemonade.service";
import crypto from "crypto";
import feeEngine from "../services/feeEngine.service";
import platformLedger from "../services/platformLedger.service";

function getCallbackBaseUrl() {
  return process.env.APP_URL || process.env.BACKEND_URL || "http://localhost:3000";
}

export async function createProject(req: Request, res: Response) {
  const { title, description, category, budget, milestones, deadline } = req.body ?? {};

  if (!title || !description || !budget || !milestones || milestones.length === 0) {
    throw new AppError("Missing required fields", 400);
  }

  const milestonesTotal = milestones.reduce((sum: number, m: any) => sum + Number(m.amount || 0), 0);
  if (Math.abs(milestonesTotal - Number(budget)) > 0.01) {
    throw new AppError("Milestones total must equal project budget", 400);
  }

  const project = await prisma.project.create({
    data: {
      title,
      description,
      category,
      budget: new Prisma.Decimal(budget),
      deadline: deadline ? new Date(deadline) : null,
      ownerId: req.user!.userId,
      status: "DRAFT",
      milestones: {
        create: milestones.map((m: any) => ({
          title: m.title,
          description: m.description,
          amount: new Prisma.Decimal(m.amount),
          dueDate: m.dueDate ? new Date(m.dueDate) : null,
        })),
      },
    },
    include: { milestones: true },
  });

  res.status(201).json({ success: true, data: { project } });
}

export async function getProjects(req: Request, res: Response) {
  const { page = 1, limit = 20, status, category, search, role } = req.query as any;

  const skip = (Number(page) - 1) * Number(limit);
  const where: any = {};

  if (role === "owner") where.ownerId = req.user!.userId;
  else if (role === "implementer") where.implementerId = req.user!.userId;
  else if (role === "verifier") {
    if (req.user?.role !== "PROJECT_VERIFIER") throw new AppError("Forbidden", 403);
    // Show projects with at least one milestone awaiting review.
    where.status = { in: ["ASSIGNED", "ACTIVE"] };
    where.milestones = { some: { status: { in: ["SUBMITTED", "IN_REVIEW"] } } };
  }
  else if (role === "browse") {
    where.status = "OPEN";
    where.implementerId = null;
  }

  if (status) where.status = status;
  if (category) where.category = category;
  if (search) {
    where.OR = [
      { title: { contains: search as string, mode: "insensitive" } },
      { description: { contains: search as string, mode: "insensitive" } },
    ];
  }

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { id: true, name: true, phone: true } },
        implementer: { select: { id: true, name: true, phone: true } },
        milestones: { select: { id: true, title: true, amount: true, status: true, dueDate: true } },
        _count: { select: { applications: true } },
      },
    }),
    prisma.project.count({ where }),
  ]);

  res.json({
    success: true,
    data: {
      projects,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    },
  });
}

export async function getProjectById(req: Request, res: Response) {
  const { id } = req.params;
  if (!id) throw new AppError("Project id required", 400);

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          phone: true,
          profile: { select: { averageRating: true, totalReviews: true } },
        },
      },
      implementer: {
        select: {
          id: true,
          name: true,
          phone: true,
          profile: {
            select: {
              bio: true,
              skills: true,
              averageRating: true,
              totalReviews: true,
              completedProjects: true,
            },
          },
        },
      },
      milestones: {
        orderBy: { createdAt: "asc" },
        include: { verifier: { select: { id: true, name: true } } },
      },
      applications: {
        where: { status: "PENDING" },
        include: {
          applicant: {
            select: {
              id: true,
              name: true,
              profile: {
                select: { bio: true, skills: true, averageRating: true, completedProjects: true },
              },
            },
          },
        },
      },
    },
  });

  if (!project) throw new AppError("Project not found", 404);

  await prisma.project.update({ where: { id }, data: { views: { increment: 1 } } });

  res.json({ success: true, data: { project } });
}

export async function publishProject(req: Request, res: Response) {
  const { id } = req.params;
  if (!id) throw new AppError("Project id required", 400);

  const project = await prisma.project.findUnique({ where: { id }, include: { milestones: true } });
  if (!project) throw new AppError("Project not found", 404);
  if (project.ownerId !== req.user!.userId) throw new AppError("Unauthorized", 403);
  if (project.status !== "DRAFT") throw new AppError("Project already published", 400);
  if (project.milestones.length === 0) throw new AppError("Add at least one milestone", 400);

  await prisma.project.update({ where: { id }, data: { status: "OPEN" } });

  res.json({ success: true, message: "Project published successfully" });
}

export async function applyToProject(req: Request, res: Response) {
  const { id } = req.params;
  if (!id) throw new AppError("Project id required", 400);
  const { coverLetter, proposedRate, estimatedDuration } = req.body ?? {};

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (user?.role !== "IMPLEMENTER") throw new AppError("Only implementers can apply", 403);

  const existingApplication = await prisma.projectApplication.findUnique({
    where: { projectId_userId: { projectId: id, userId: req.user!.userId } },
  });
  if (existingApplication) throw new AppError("Already applied to this project", 400);

  const application = await prisma.projectApplication.create({
    data: {
      projectId: id,
      userId: req.user!.userId,
      coverLetter,
      proposedRate: proposedRate ? new Prisma.Decimal(proposedRate) : null,
      estimatedDuration,
    },
  });

  const project = await prisma.project.findUnique({ where: { id }, select: { ownerId: true, title: true } });
  if (project) {
    await prisma.notification.create({
      data: {
        userId: project.ownerId,
        type: "PROJECT",
        title: "New Project Application",
        message: `Someone applied to your project: ${project.title}`,
        actionUrl: `/projects/${id}`,
      },
    });
  }

  res.status(201).json({ success: true, data: { application } });
}

export async function assignImplementer(req: Request, res: Response) {
  const { id } = req.params;
  if (!id) throw new AppError("Project id required", 400);
  const { implementerId } = req.body ?? {};
  if (!implementerId) throw new AppError("implementerId required", 400);

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new AppError("Project not found", 404);
  if (project.ownerId !== req.user!.userId) throw new AppError("Unauthorized", 403);
  if (project.status !== "OPEN") throw new AppError("Project not open for assignment", 400);

  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data: { implementerId, status: "ASSIGNED" } });
    await tx.projectApplication.updateMany({ where: { projectId: id }, data: { status: "REJECTED" } });
    await tx.projectApplication.update({
      where: { projectId_userId: { projectId: id, userId: implementerId } },
      data: { status: "ACCEPTED" },
    });

    await tx.notification.create({
      data: {
        userId: implementerId,
        type: "PROJECT",
        title: "Project Assigned",
        message: `You've been assigned to project: ${project.title}`,
        actionUrl: `/projects/${id}`,
      },
    });
  });

  res.json({ success: true, message: "Implementer assigned successfully" });
}

export async function fundProject(req: Request, res: Response) {
  const { id } = req.params;
  if (!id) throw new AppError("Project id required", 400);

  const project = await prisma.project.findUnique({ where: { id }, include: { milestones: true } });
  if (!project) throw new AppError("Project not found", 404);
  if (project.ownerId !== req.user!.userId) throw new AppError("Unauthorized", 403);
  if (!project.implementerId) throw new AppError("Assign implementer first", 400);

  const quote = await feeEngine.quote({
    flow: "PROJECT_FUND_WALLET",
    method: "WALLET",
    currency: "KES",
    amount: project.budget,
  });

  await prisma.$transaction(
    async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: req.user!.userId } });
      if (!wallet) throw new AppError("Wallet not found", 404);
      const totalDebit = quote.feePayer === "SENDER" ? project.budget.add(quote.fee) : project.budget;
      if (wallet.balance.lt(totalDebit)) throw new AppError("Insufficient balance", 400);

      await tx.wallet.update({
        where: { userId: req.user!.userId },
        data: {
          balance: { decrement: totalDebit },
          escrowBalance: { increment: project.budget },
        },
      });

      await tx.project.update({
        where: { id },
        data: { status: "ACTIVE", escrowBalance: project.budget, startDate: new Date() },
      });

      const txRow = await tx.transaction.create({
        data: {
          fromUserId: req.user!.userId,
          amount: project.budget,
          fee: quote.fee,
          type: "ESCROW_LOCK",
          status: "SUCCESS",
          reference: `ESC-LOCK-${crypto.randomUUID()}`,
          description: `Escrow lock for project: ${project.title}`,
          metadata: { projectId: id, fee: { scheduleId: quote.scheduleId, feePayer: quote.feePayer, amount: Number(quote.fee) } },
        },
      });

      await platformLedger.creditFeeRevenue(tx, {
        currency: wallet.currency || "KES",
        amount: quote.fee,
        transactionId: txRow.id,
        reference: txRow.reference,
        metadata: { flow: "PROJECT_FUND_WALLET", method: "WALLET" },
      });

      await tx.notification.create({
        data: {
          userId: project.implementerId!,
          type: "PROJECT",
          title: "Project Funded",
          message: `Project "${project.title}" has been funded. Start working!`,
          actionUrl: `/projects/${id}`,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 }
  );

  res.json({ success: true, message: "Project funded successfully" });
}

// Diaspora/Card -> Project escrow funding (via Lemonade checkout redirect)
export async function fundProjectCard(req: Request, res: Response) {
  const { id } = req.params;
  const { amount } = req.body ?? {};
  if (!id) throw new AppError("Project id required", 400);
  if (!amount || Number(amount) < 1) throw new AppError("Minimum funding is KES 1", 400);

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, title: true, ownerId: true, budget: true, escrowBalance: true, implementerId: true, status: true } });
  if (!project) throw new AppError("Project not found", 404);
  if (!project.implementerId) throw new AppError("Assign implementer first", 400);

  const remaining = Number(project.budget) - Number(project.escrowBalance);
  if (remaining <= 0) throw new AppError("Project already fully funded", 400);
  if (Number(amount) > remaining) throw new AppError(`Maximum funding is KES ${remaining}`, 400);
  if (!["ASSIGNED", "ACTIVE"].includes(project.status)) throw new AppError("Project not ready for funding", 400);

  const walletNo = process.env.LEMONADE_WALLET_NO || "";
  if (!walletNo) throw new AppError("Card funding not configured (LEMONADE_WALLET_NO missing)", 500);

  const payer = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { id: true, name: true, phone: true, email: true } });
  if (!payer) throw new AppError("User not found", 404);

  const reference = `CARD-PROJ-${crypto.randomUUID()}`;
  const resultUrl = `${getCallbackBaseUrl()}/api/callback/lemonade`;

  const quote = await feeEngine.quote({
    flow: "PROJECT_FUND_CARD",
    method: "CARD",
    currency: "KES",
    amount: new Prisma.Decimal(amount),
  });

  const txRow = await prisma.transaction.create({
    data: {
      fromUserId: payer.id,
      toUserId: project.ownerId,
      amount: new Prisma.Decimal(amount),
      fee: quote.fee,
      type: "ESCROW_LOCK",
      status: "PENDING",
      reference,
      description: `Project funding (card): ${project.title}`,
      metadata: {
        projectId: project.id,
        method: "card",
        provider: "lemonade",
        kind: "project_funding",
        fee: { scheduleId: quote.scheduleId, feePayer: quote.feePayer, amount: Number(quote.fee) },
      },
    },
  });

  try {
    const initiated = await lemonadeService.initiateCardPayment({
      walletNo,
      reference,
      amount: Number(amount),
      currency: "KES",
      customerName: payer.name,
      customerPhone: payer.phone,
      description: `Bridge: Fund project ${project.title}`,
      resultUrl,
      email: payer.email,
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
    throw new AppError(e?.message || "Failed to initiate card funding", 500);
  }
}

export async function checkProjectCardFundingStatus(req: Request, res: Response) {
  const { providerTransactionId } = req.params;
  if (!providerTransactionId) throw new AppError("providerTransactionId required", 400);

  const txRow = await prisma.transaction.findFirst({
    where: {
      fromUserId: req.user!.userId,
      type: "ESCROW_LOCK",
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

export async function submitEvidence(req: Request, res: Response) {
  const { projectId, milestoneId } = req.params;
  if (!projectId) throw new AppError("projectId required", 400);
  if (!milestoneId) throw new AppError("milestoneId required", 400);
  const { description, links } = req.body ?? {};
  const files = (req.files as Express.Multer.File[]) || [];

  const normalizedLinks = (() => {
    if (!links) return [];
    if (Array.isArray(links)) return links;
    if (typeof links === "string") {
      try {
        const parsed = JSON.parse(links);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Fallback: comma/newline separated
        return links
          .split(/[\n,]/g)
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
    return [];
  })();

  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId }, include: { project: true } });
  if (!milestone) throw new AppError("Milestone not found", 404);
  if (milestone.project.implementerId !== req.user!.userId) throw new AppError("Unauthorized", 403);
  if (!["PENDING", "IN_PROGRESS"].includes(milestone.status)) throw new AppError("Milestone not available", 400);

  const fileUrls = await uploadFilesToS3(
    files.map((f) => ({ buffer: f.buffer, originalname: f.originalname, mimetype: f.mimetype })),
    "evidence"
  );

  await prisma.$transaction(async (tx) => {
    await tx.milestone.update({
      where: { id: milestoneId },
      data: {
        status: "SUBMITTED",
        evidence: { files: fileUrls, links: normalizedLinks, description },
        submittedAt: new Date(),
      },
    });

    await tx.notification.create({
      data: {
        userId: milestone.project.ownerId,
        type: "PROJECT",
        title: "Milestone Evidence Submitted",
        message: `Evidence submitted for: ${milestone.title}`,
        actionUrl: `/projects/${projectId}`,
      },
    });
  });

  res.json({ success: true, message: "Evidence submitted successfully" });
}

export async function approveMilestone(req: Request, res: Response) {
  const { projectId, milestoneId } = req.params;
  if (!projectId) throw new AppError("projectId required", 400);
  if (!milestoneId) throw new AppError("milestoneId required", 400);
  const { notes } = req.body ?? {};

  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId }, include: { project: true } });
  if (!milestone) throw new AppError("Milestone not found", 404);

  const isOwner = milestone.project.ownerId === req.user!.userId;
  const isVerifier = req.user!.role === "PROJECT_VERIFIER";
  if (!isOwner && !isVerifier) throw new AppError("Unauthorized", 403);
  if (!["SUBMITTED", "IN_REVIEW"].includes(milestone.status)) throw new AppError("Not ready for approval", 400);

  await prisma.$transaction(async (tx) => {
    await tx.milestone.update({
      where: { id: milestoneId },
      data: {
        status: "APPROVED",
        verifierId: req.user!.userId,
        verifierNotes: notes,
        approvedAt: new Date(),
      },
    });

    await tx.wallet.update({
      where: { userId: milestone.project.ownerId },
      data: { escrowBalance: { decrement: milestone.amount } },
    });

    if (milestone.project.implementerId) {
      await tx.wallet.update({
        where: { userId: milestone.project.implementerId },
        data: { balance: { increment: milestone.amount } },
      });
    }

    await tx.project.update({
      where: { id: projectId },
      data: { escrowBalance: { decrement: milestone.amount } },
    });

    await tx.transaction.create({
      data: {
        fromUserId: milestone.project.ownerId,
        toUserId: milestone.project.implementerId!,
        amount: milestone.amount,
        type: "ESCROW_RELEASE",
        status: "SUCCESS",
        reference: `ESC-REL-${crypto.randomUUID()}`,
        description: `Milestone approved: ${milestone.title}`,
        metadata: { projectId, milestoneId },
      },
    });

    await tx.notification.create({
      data: {
        userId: milestone.project.implementerId!,
        type: "PROJECT",
        title: "Milestone Approved!",
        message: `KES ${milestone.amount} released for: ${milestone.title}`,
        actionUrl: `/projects/${projectId}`,
      },
    });

    const remaining = await tx.milestone.count({
      where: { projectId, status: { notIn: ["APPROVED", "REJECTED"] } },
    });

    if (remaining === 0) {
      await tx.project.update({ where: { id: projectId }, data: { status: "COMPLETED", endDate: new Date() } });
    }
  });

  res.json({ success: true, message: "Milestone approved and funds released" });
}

export async function rejectMilestone(req: Request, res: Response) {
  const { projectId, milestoneId } = req.params;
  if (!projectId) throw new AppError("projectId required", 400);
  if (!milestoneId) throw new AppError("milestoneId required", 400);
  const { reason } = req.body ?? {};

  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId }, include: { project: true } });
  if (!milestone) throw new AppError("Milestone not found", 404);

  const isOwner = milestone.project.ownerId === req.user!.userId;
  const isVerifier = req.user!.role === "PROJECT_VERIFIER";
  if (!isOwner && !isVerifier) throw new AppError("Unauthorized", 403);

  await prisma.$transaction(async (tx) => {
    await tx.milestone.update({
      where: { id: milestoneId },
      data: { status: "REJECTED", verifierId: req.user!.userId, verifierNotes: reason },
    });

    await tx.notification.create({
      data: {
        userId: milestone.project.implementerId!,
        type: "PROJECT",
        title: "Milestone Rejected",
        message: `Milestone "${milestone.title}" needs revision: ${reason}`,
        actionUrl: `/projects/${projectId}`,
      },
    });
  });

  res.json({ success: true, message: "Milestone rejected" });
}


