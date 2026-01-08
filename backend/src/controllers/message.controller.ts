import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

export async function getConversations(req: Request, res: Response) {
  const conversations = await prisma.conversation.findMany({
    where: { participants: { has: req.user!.userId } },
    orderBy: { lastMessageAt: "desc" },
    include: {
      messages: { take: 1, orderBy: { createdAt: "desc" } },
      project: { select: { id: true, title: true } },
    },
  });

  const enriched = await Promise.all(
    conversations.map(async (conv) => {
      const otherParticipantId = conv.participants.find((p) => p !== req.user!.userId);
      const otherParticipant = otherParticipantId
        ? await prisma.user.findUnique({ where: { id: otherParticipantId }, select: { id: true, name: true } })
        : null;
      return { ...conv, otherParticipant };
    })
  );

  res.json({ success: true, data: { conversations: enriched } });
}

export async function getMessages(req: Request, res: Response) {
  const { conversationId } = req.params;
  if (!conversationId) throw new AppError("conversationId required", 400);
  const { page = 1, limit = 50 } = req.query as any;
  const skip = (Number(page) - 1) * Number(limit);

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || !conversation.participants.includes(req.user!.userId)) throw new AppError("Unauthorized", 403);

  const messages = await prisma.message.findMany({
    where: { conversationId },
    skip,
    take: Number(limit),
    orderBy: { createdAt: "desc" },
    include: { sender: { select: { id: true, name: true } } },
  });

  res.json({ success: true, data: { messages: messages.reverse() } });
}

export async function createConversation(req: Request, res: Response) {
  const { projectId, participantId } = req.body ?? {};
  if (!participantId) throw new AppError("participantId required", 400);

  const existing = await prisma.conversation.findFirst({
    where: { projectId, participants: { hasEvery: [req.user!.userId, participantId] } },
  });

  if (existing) return res.json({ success: true, data: { conversation: existing } });

  const conversation = await prisma.conversation.create({
    data: { projectId, participants: [req.user!.userId, participantId] },
  });

  res.status(201).json({ success: true, data: { conversation } });
}


