import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import * as kycController from "../controllers/kyc.controller";

export const kycRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

kycRouter.get("/me", requireAuth, asyncHandler(kycController.getMyKyc));
kycRouter.post("/submit", requireAuth, upload.array("files", 5), asyncHandler(kycController.submitKyc));




