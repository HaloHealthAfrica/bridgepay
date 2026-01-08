import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import * as accountController from "../controllers/account.controller";

export const accountRouter = Router();

accountRouter.put("/me", requireAuth, asyncHandler(accountController.updateMe));
accountRouter.get("/sessions", requireAuth, asyncHandler(accountController.listSessions));




