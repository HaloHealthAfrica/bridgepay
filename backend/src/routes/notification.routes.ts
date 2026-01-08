import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import * as notificationController from "../controllers/notification.controller";

export const notificationRouter = Router();

notificationRouter.get("/", requireAuth, asyncHandler(notificationController.listNotifications));
notificationRouter.post("/read-all", requireAuth, asyncHandler(notificationController.markAllRead));
notificationRouter.post("/:id/read", requireAuth, asyncHandler(notificationController.markRead));




