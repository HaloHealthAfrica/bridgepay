import { Server as SocketIOServer } from "socket.io";
import type { Server as HTTPServer } from "http";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

export const initializeSocket = (server: HTTPServer) => {
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.FRONTEND_URL,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Authentication error"));
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as any;
      socket.data.userId = decoded.userId;
      next();
    } catch {
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket) => {
    // eslint-disable-next-line no-console
    console.log("User connected:", socket.data.userId);

    socket.on("join_conversation", async (conversationId: string) => {
      const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
      if (conversation && conversation.participants.includes(socket.data.userId)) {
        socket.join(conversationId);
      }
    });

    socket.on(
      "send_message",
      async (data: { conversationId: string; content: string; attachments?: string[] }) => {
        try {
          const createData: any = {
            conversationId: data.conversationId,
            senderId: socket.data.userId,
            content: data.content,
          };
          if (data.attachments && data.attachments.length > 0) {
            createData.attachments = data.attachments;
          }

          const message = await prisma.message.create({
            data: {
              ...createData,
            },
            include: { sender: { select: { name: true } } },
          });

          await prisma.conversation.update({
            where: { id: data.conversationId },
            data: { lastMessage: data.content, lastMessageAt: new Date() },
          });

          io.to(data.conversationId).emit("new_message", message);

          const conversation = await prisma.conversation.findUnique({ where: { id: data.conversationId } });
          const otherParticipants = (conversation?.participants || []).filter((p) => p !== socket.data.userId);

          for (const participantId of otherParticipants) {
            await prisma.notification.create({
              data: {
                userId: participantId,
                type: "MESSAGE",
                title: "New Message",
                message: `${message.sender.name}: ${data.content.substring(0, 50)}...`,
                actionUrl: `/messages/${data.conversationId}`,
              },
            });
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("Send message error:", error);
        }
      }
    );

    socket.on("mark_read", async (conversationId: string) => {
      await prisma.message.updateMany({
        where: { conversationId, senderId: { not: socket.data.userId }, status: { not: "READ" } },
        data: { status: "READ" },
      });

      socket.to(conversationId).emit("messages_read", conversationId);
    });

    socket.on("disconnect", () => {
      // eslint-disable-next-line no-console
      console.log("User disconnected:", socket.data.userId);
    });
  });

  return io;
};


