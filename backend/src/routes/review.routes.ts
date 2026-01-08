import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import * as reviewController from "../controllers/review.controller";

export const reviewRouter = Router();

reviewRouter.post("/", requireAuth, asyncHandler(reviewController.createReview));
reviewRouter.get("/:userId", requireAuth, asyncHandler(reviewController.getReviews));




