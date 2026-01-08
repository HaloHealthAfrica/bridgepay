import express from "express";
import cors from "cors";
import { apiRateLimiter } from "./middleware/rateLimiter";
import { apiRouter } from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export const app = express();

app.set("trust proxy", true);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
  })
);
// Capture raw body (useful for payment provider signature verification)
app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any).rawBody = buf;
    },
  })
);

// Global API rate limiting
app.use(apiRateLimiter);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api", apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);



