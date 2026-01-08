import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import * as messageController from "../controllers/message.controller";

export const messageRouter = Router();

messageRouter.get("/conversations", requireAuth, asyncHandler(messageController.getConversations));
messageRouter.get("/conversations/:conversationId", requireAuth, asyncHandler(messageController.getMessages));
messageRouter.post("/conversations", requireAuth, asyncHandler(messageController.createConversation));




