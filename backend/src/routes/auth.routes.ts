import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import * as authController from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";
import { validate, authSchemas } from "../middleware/validation";
import { authRateLimiter } from "../middleware/rateLimiter";

export const authRouter = Router();

authRouter.post("/register", authRateLimiter, validate(authSchemas.register), asyncHandler(authController.register));
authRouter.post("/login", authRateLimiter, validate(authSchemas.login), asyncHandler(authController.login));
authRouter.get("/me", requireAuth, asyncHandler(authController.getMe));
authRouter.post("/refresh", asyncHandler(authController.refreshToken));
authRouter.post("/logout", requireAuth, asyncHandler(authController.logout));
authRouter.post("/logout-all", requireAuth, asyncHandler(authController.logoutAll));



