import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import * as userController from "../controllers/user.controller";

export const userRouter = Router();

userRouter.get("/search", requireAuth, asyncHandler(userController.searchUsers));
userRouter.get("/implementers", requireAuth, asyncHandler(userController.browseImplementers));
userRouter.get("/implementers/:id", requireAuth, asyncHandler(userController.getImplementerProfile));
userRouter.put("/profile", requireAuth, asyncHandler(userController.updateProfile));




